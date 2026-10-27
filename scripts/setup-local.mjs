// Run with Node 24.7+ (or the Node 24 Docker image). Never overwrites .env.
import { randomBytes } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../src/lib/auth/password-hash.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function hidden(prompt) {
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      if (chunk.startsWith("\x1b")) return;
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish();
        if (char === "\x03" || char === "\x04") return finish(new Error("Setup cancelled."));
        if (char === "\x7f" || char === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  try {
    await access(envPath);
    throw new Error(".env already exists; preserve it or move it yourself before setup.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let password;
  if (process.stdin.isTTY) {
    password = await hidden("Choose an application password: ");
    if (await hidden("Confirm password: ") !== password) throw new Error("Passwords do not match.");
  } else {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    password = input.split(/\r?\n/)[0];
  }
  if (!password) throw new Error("A non-empty password is required.");
  const hash = await hashPassword(password);
  const dbPassword = randomBytes(24).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  await writeFile(envPath, [
    "# Generated locally. Do not commit or share this file.",
    `DOSSIER_PASSWORD=${hash}`,
    `DOSSIER_SECRET=${secret}`,
    "POSTGRES_USER=dossier",
    `POSTGRES_PASSWORD=${dbPassword}`,
    "POSTGRES_DB=dossier",
    `DATABASE_URL=postgresql://dossier:${dbPassword}@db:5432/dossier`,
    "DOSSIER_TELEMETRY=off",
    "NEXT_TELEMETRY_DISABLED=1",
    "DOSSIER_PORT=3000",
    "",
  ].join("\n"), { flag: "wx", mode: 0o600 });
  await mkdir(resolve(root, "data"), { recursive: true });
  process.stdout.write("Created .env and data/. Secrets were not printed. Start with docker compose up -d --build.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
