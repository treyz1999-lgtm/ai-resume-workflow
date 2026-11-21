import "server-only";
import { ActionError } from "@/lib/action";
import { getAiProvider } from "@/lib/ai";
import { configFrom } from "@/lib/discovery/store";
import { prisma } from "@/lib/prisma";
import { classifyStatusPrompt, STATUS_REPORT_INSTRUCTIONS, statusClassificationSchema, type StatusMailContext } from "./status-report-task";

export async function classifyStatus(context: StatusMailContext) {
  const config = configFrom((await prisma.discoveryControl.findUnique({ where: { id: "discovery" } }))?.config);
  const prompt = classifyStatusPrompt(context);
  const signal = AbortSignal.timeout(240_000);
  if (config.provider === "configured") {
    const provider = await getAiProvider();
    return statusClassificationSchema.parse(await provider.complete({
      system: STATUS_REPORT_INSTRUCTIONS, messages: [{ role: "user", content: prompt }],
      schema: statusClassificationSchema, schemaName: "email_status", maxTokens: 4000, signal,
    }));
  }
  const token = process.env.DOSSIER_SECRET;
  if (!token) throw new ActionError("Configure the execution worker before checking email updates.");
  const response = await fetch((process.env.WORKER_URL ?? "http://worker:4310").replace(/\/$/, "") + "/status-report/classify", {
    method: "POST", redirect: "error", headers: { "content-type": "application/json", "x-worker-token": token },
    body: JSON.stringify({ messages: context, model: config.model }), signal,
  });
  const reader = response.body?.getReader();
  if (!reader) throw new ActionError("The status reviewer returned no response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new ActionError("The status reviewer exceeded its response limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const answer = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!response.ok) throw new ActionError(answer.code === "quota" ? "Codex usage limit reached. Saved findings are retained; retry after reset." :
    answer.code === "auth" ? "Reconnect ChatGPT in Connections before checking updates." : "The status reviewer could not complete this email. Saved findings are retained.");
  return statusClassificationSchema.parse(answer);
}
