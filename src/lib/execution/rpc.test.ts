import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { codexEnvironment, StdioRpc } from "../../../worker/rpc";

function fixture(timeout?: number) {
  const process = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(process, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  const written: Record<string, unknown>[] = [];
  process.stdin.on("data", data => written.push(JSON.parse(data.toString())));
  const client = new StdioRpc(process, timeout);
  return { process, written, client };
}
describe("bounded stdio RPC", () => {
  it("pairs responses by id, parses split JSONL, and denies unsolicited tool requests", async () => {
    const { process, written, client } = fixture();
    const pending = client.request("initialize");
    process.stdout.emit("data", Buffer.from('{"id":1,"result":'));
    process.stdout.emit("data", Buffer.from('{"ok":true}}\n'));
    expect(await pending).toEqual({ ok: true });
    process.stdout.emit("data", Buffer.from('{"id":99,"method":"item/commandExecution/requestApproval","params":{}}\n'));
    expect(written.at(-1)).toMatchObject({ id: 99, error: { code: -32601 } });
    client.close();
  });
  it("rejects pending work and reports disconnect on process exit", async () => {
    const { process, client } = fixture(); const disconnected = vi.fn(); client.onDisconnect(disconnected);
    const pending = client.request("account/read"); const result = expect(pending).rejects.toMatchObject({ code: "transport" });
    process.emit("exit", 1); await result; expect(disconnected).toHaveBeenCalledOnce();
    await expect(client.request("account/read")).rejects.toMatchObject({ code: "transport" });
  });
  it("fails closed for malformed data and request timeouts", async () => {
    const { process, client } = fixture(); const pending = client.request("test");
    const result = expect(pending).rejects.toMatchObject({ code: "transport" });
    process.stdout.emit("data", Buffer.from("not-json\n")); await result;
    const timed = fixture(10);
    await expect(timed.client.request("test")).rejects.toMatchObject({ code: "transport" });
    expect(timed.process.kill).toHaveBeenCalled();
  });
  it("does not forward worker secrets or API billing credentials to Codex", () => {
    const env = codexEnvironment({ PATH: "/bin", HOME: "/private-user", OPENAI_API_KEY: "secret", DATABASE_URL: "secret", DOSSIER_SECRET: "secret", CODEX_HOME: "/auth/codex" });
    expect(env).toEqual({ NODE_ENV: "production", PATH: "/bin", HOME: "/auth/codex", CODEX_HOME: "/auth/codex" });
  });
});
