import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { DIAGNOSTIC_PROMPT, type ExecutionProgress, type ExecutionResult, type ExecutionStatus, type RunView } from "../src/lib/execution/contracts";

export type RunRow = Omit<RunView, "createdAt" | "updatedAt"> & {
  createdAt: Date; updatedAt: Date; prompt: string; threadId: string | null;
  turnId: string | null; owner: string | null; leaseUntil: Date | null;
};
export function view(row: RunRow): RunView {
  const { id, status, model, stage, output, result, error, createdAt, updatedAt } = row;
  return { id, status, model, stage, output, result, error, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}

export class ExecutionStore {
  constructor(readonly pool: Pool) {}
  async create(model?: string): Promise<RunRow> {
    const result = await this.pool.query<RunRow>('INSERT INTO "ExecutionRun" (id, model, prompt) VALUES ($1,$2,$3) RETURNING *', [randomUUID(), model ?? null, DIAGNOSTIC_PROMPT]);
    return result.rows[0];
  }
  async list(): Promise<RunView[]> {
    return (await this.pool.query<RunRow>('SELECT * FROM "ExecutionRun" ORDER BY "createdAt" DESC LIMIT 30')).rows.map(view);
  }
  async get(id: string): Promise<RunRow | null> {
    return (await this.pool.query<RunRow>('SELECT * FROM "ExecutionRun" WHERE id=$1', [id])).rows[0] ?? null;
  }
  async claim(owner: string): Promise<RunRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // All claimers serialize on one DB-scoped lock, including the expired-lease check.
      await client.query("SELECT pg_advisory_xact_lock(2801029)");
      await client.query(`UPDATE "ExecutionRun" SET status='INTERRUPTED', owner=NULL, "leaseUntil"=NULL,
        error='Worker interrupted. Resume when ready.', "updatedAt"=NOW()
        WHERE status='RUNNING' AND "leaseUntil" < NOW()`);
      const result = await client.query<RunRow>(`UPDATE "ExecutionRun" SET status='RUNNING', owner=$1,
        "leaseUntil"=NOW()+INTERVAL '60 seconds', stage='Connecting to Codex', error=NULL, "updatedAt"=NOW()
        WHERE id=(SELECT id FROM "ExecutionRun" WHERE status='QUEUED'
          AND NOT EXISTS(SELECT 1 FROM "ExecutionRun" WHERE status='RUNNING')
          ORDER BY "createdAt",id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [owner]);
      await client.query("COMMIT");
      return result.rows[0] ?? null;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async heartbeat(id: string, owner: string): Promise<boolean> {
    return (await this.pool.query(`UPDATE "ExecutionRun" SET "leaseUntil"=NOW()+INTERVAL '60 seconds'
      WHERE id=$1 AND owner=$2 AND status='RUNNING' AND "leaseUntil">NOW() AND NOT "cancelRequested"`, [id, owner])).rowCount === 1;
  }
  async progress(id: string, owner: string, event: ExecutionProgress): Promise<void> {
    await this.pool.query(`UPDATE "ExecutionRun" SET
      output=CASE WHEN $3='delta' THEN LEFT(output || $4, 100000) ELSE output END,
      stage=CASE WHEN $3='stage' THEN LEFT($4,200) ELSE stage END,
      "threadId"=COALESCE($5,"threadId"), "turnId"=COALESCE($6,"turnId"), "updatedAt"=NOW()
      WHERE id=$1 AND owner=$2 AND status='RUNNING' AND "leaseUntil">NOW()`,
    [id, owner, event.type, event.message ?? "", event.threadId ?? null, event.turnId ?? null]);
  }
  async finish(id: string, owner: string, status: ExecutionStatus, result?: ExecutionResult, error?: string): Promise<void> {
    await this.pool.query(`UPDATE "ExecutionRun" SET status=CASE WHEN "cancelRequested" THEN 'CANCELLED' ELSE $3 END,
      result=CASE WHEN "cancelRequested" THEN NULL ELSE $4::jsonb END,
      output=CASE WHEN "cancelRequested" THEN output ELSE COALESCE($5,output) END,
      error=$6, stage=CASE WHEN "cancelRequested" THEN 'CANCELLED' ELSE $3 END, owner=NULL, "leaseUntil"=NULL, "updatedAt"=NOW()
      WHERE id=$1 AND owner=$2 AND status='RUNNING' AND "leaseUntil">NOW()`,
    [id, owner, status, result ? JSON.stringify(result.structured ?? null) : null, result?.text ?? null, error ?? null]);
  }
  async cancel(id: string): Promise<void> {
    await this.pool.query(`UPDATE "ExecutionRun" SET
      status=CASE WHEN status='RUNNING' THEN 'RUNNING' ELSE 'CANCELLED' END,
      stage=CASE WHEN status='RUNNING' THEN 'Cancelling...' ELSE 'Cancelled' END,
      "cancelRequested"=true, "updatedAt"=NOW()
      WHERE id=$1 AND status IN ('QUEUED','RUNNING','BLOCKED','INTERRUPTED')`, [id]);
  }
  async cancelAll(): Promise<void> {
    await this.pool.query(`UPDATE "ExecutionRun" SET status=CASE WHEN status='RUNNING' THEN 'RUNNING' ELSE 'CANCELLED' END,
      "cancelRequested"=true, stage='Signing out', "updatedAt"=NOW() WHERE status IN ('RUNNING','QUEUED')`);
  }
  async resume(id: string): Promise<boolean> {
    return (await this.pool.query(`UPDATE "ExecutionRun" SET status='QUEUED', error=NULL, "cancelRequested"=false, stage='Waiting to resume',
      "updatedAt"=NOW() WHERE id=$1 AND status IN ('BLOCKED','INTERRUPTED','FAILED','CANCELLED')`, [id])).rowCount === 1;
  }
}
