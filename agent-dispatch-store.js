import db from "./database.js";
import { createAgentJob, canRun, nextAttempt } from "./agent-dispatch-contract.js";
import { validateGraph } from "./agent-dispatch-queue.js";

const MAX_QUEUE_SIZE = 128;

function rowToJob(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    role: row.role,
    instruction: row.instruction,
    resources: Object.freeze([...(row.resources ?? [])]),
    dependsOn: Object.freeze([...(row.depends_on ?? [])]),
    attempt: row.attempt,
    state: row.state,
  });
}

export class PersistentAgentDispatchQueue {
  async enqueue(input) {
    const job = createAgentJob(input);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const count = await client.query("SELECT COUNT(*)::int AS count FROM agent_dispatch_jobs");
      if (count.rows[0].count >= MAX_QUEUE_SIZE) throw new RangeError("dispatch queue limit exceeded");
      const existing = await client.query("SELECT id FROM agent_dispatch_jobs WHERE id = $1", [job.id]);
      if (existing.rowCount) throw new TypeError(`duplicate job id: ${job.id}`);
      const all = await client.query("SELECT id, role, instruction, resources, depends_on, attempt FROM agent_dispatch_jobs");
      validateGraph([...all.rows.map((row) => ({ id: row.id, role: row.role, instruction: row.instruction, resources: row.resources, dependsOn: row.depends_on, attempt: row.attempt })), job]);
      await client.query(
        `INSERT INTO agent_dispatch_jobs (id, role, instruction, resources, depends_on, attempt, state)
         VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
        [job.id, job.role, job.instruction, job.resources, job.dependsOn, job.attempt]
      );
      await client.query("COMMIT");
      return this.get(job.id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(id) {
    const result = await db.query("SELECT id, role, instruction, resources, depends_on, attempt, state FROM agent_dispatch_jobs WHERE id = $1", [id]);
    return rowToJob(result.rows[0]);
  }

  async list(state = null) {
    const result = state === null
      ? await db.query("SELECT id, role, instruction, resources, depends_on, attempt, state FROM agent_dispatch_jobs ORDER BY created_at, id")
      : await db.query("SELECT id, role, instruction, resources, depends_on, attempt, state FROM agent_dispatch_jobs WHERE state = $1 ORDER BY created_at, id", [state]);
    return result.rows.map(rowToJob);
  }

  async tryReserve(id) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT id, role, instruction, resources, depends_on, attempt, state FROM agent_dispatch_jobs WHERE id = $1 FOR UPDATE",
        [id]
      );
      const row = result.rows[0];
      if (!row || row.state !== "queued") {
        await client.query("COMMIT");
        return null;
      }
      const dependencies = row.depends_on ?? [];
      if (dependencies.length) {
        const deps = await client.query("SELECT id, state FROM agent_dispatch_jobs WHERE id = ANY($1::text[])", [dependencies]);
        const byId = new Map(deps.rows.map((dep) => [dep.id, dep.state]));
        if (dependencies.some((dependency) => ["failed", "cancelled"].includes(byId.get(dependency)))) {
          await client.query("UPDATE agent_dispatch_jobs SET state = 'cancelled', updated_at = NOW() WHERE id = $1", [id]);
          await client.query("COMMIT");
          return null;
        }
        if (!dependencies.every((dependency) => byId.get(dependency) === "succeeded")) {
          await client.query("COMMIT");
          return null;
        }
      }
      const active = await client.query(
        "SELECT resources FROM agent_dispatch_jobs WHERE state = 'running' AND resources && $1::text[]",
        [row.resources ?? []]
      );
      const completed = await client.query("SELECT id FROM agent_dispatch_jobs WHERE state = 'succeeded'");
      const job = rowToJob(row);
      const completedIds = completed.rows.map((item) => item.id);
      const activeJobs = active.rows.map((item) => ({ resources: item.resources ?? [] }));
      if (!canRun(job, completedIds, activeJobs)) {
        await client.query("COMMIT");
        return null;
      }
      await client.query("UPDATE agent_dispatch_jobs SET state = 'running', updated_at = NOW() WHERE id = $1", [id]);
      await client.query("COMMIT");
      return this.get(id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(id, outcome) {
    if (!["succeeded", "failed"].includes(outcome)) throw new TypeError(`invalid outcome: ${outcome}`);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT id, role, instruction, resources, depends_on, attempt, state FROM agent_dispatch_jobs WHERE id = $1 FOR UPDATE", [id]);
      const row = result.rows[0];
      if (!row || row.state !== "running") throw new TypeError(`job is not running: ${id}`);
      if (outcome === "failed") {
        const retry = nextAttempt(rowToJob(row));
        if (retry) {
          await client.query("UPDATE agent_dispatch_jobs SET attempt = $2, state = 'queued', updated_at = NOW() WHERE id = $1", [id, retry.attempt]);
          await client.query("COMMIT");
          return this.get(id);
        }
      }
      await client.query("UPDATE agent_dispatch_jobs SET state = $2, updated_at = NOW() WHERE id = $1", [id, outcome]);
      if (outcome === "failed") {
        await client.query(
          `UPDATE agent_dispatch_jobs AS child SET state = 'cancelled', updated_at = NOW()
           WHERE child.state = 'queued' AND EXISTS (
             SELECT 1 FROM agent_dispatch_jobs AS dep
             WHERE dep.id = ANY(child.depends_on) AND dep.state IN ('failed', 'cancelled')
           )`
        );
      }
      await client.query("COMMIT");
      return this.get(id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async cancel(id) {
    const result = await db.query(
      "UPDATE agent_dispatch_jobs SET state = 'cancelled', updated_at = NOW() WHERE id = $1 AND state IN ('queued', 'running') RETURNING id, role, instruction, resources, depends_on, attempt, state",
      [id]
    );
    if (!result.rowCount) return null;
    await db.query(
      `UPDATE agent_dispatch_jobs AS child SET state = 'cancelled', updated_at = NOW()
       WHERE child.state = 'queued' AND EXISTS (
         SELECT 1 FROM agent_dispatch_jobs AS dep
         WHERE dep.id = ANY(child.depends_on) AND dep.state IN ('failed', 'cancelled')
       )`
    );
    return rowToJob(result.rows[0]);
  }
}

export { MAX_QUEUE_SIZE, rowToJob };
