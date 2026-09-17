import { canRun, createAgentJob, isActive, isTerminal, nextAttempt } from "./agent-dispatch-contract.js";

const STATES = Object.freeze(["queued", "running", "succeeded", "failed", "cancelled"]);
const MAX_QUEUE_SIZE = 128;

function validateGraph(jobs) {
  const ids = new Set();
  for (const job of jobs) {
    if (ids.has(job.id)) throw new TypeError(`duplicate job id: ${job.id}`);
    ids.add(job.id);
  }

  for (const job of jobs) {
    for (const dependency of job.dependsOn) {
      if (!ids.has(dependency)) throw new TypeError(`missing dependency: ${dependency}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new TypeError("dependency cycle detected");
    if (visited.has(id)) return;
    visiting.add(id);
    const job = jobs.find((candidate) => candidate.id === id);
    for (const dependency of job.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const job of jobs) visit(job.id);
}

export class AgentDispatchQueue {
  #jobs = new Map();
  #states = new Map();
  #active = new Set();

  enqueue(job) {
    const normalized = createAgentJob(job);
    if (this.#jobs.has(normalized.id)) throw new TypeError(`duplicate job id: ${normalized.id}`);
    if (this.#jobs.size >= MAX_QUEUE_SIZE) throw new RangeError("dispatch queue limit exceeded");
    const candidateJobs = [...this.#jobs.values(), normalized];
    validateGraph(candidateJobs);
    this.#jobs.set(normalized.id, normalized);
    this.#states.set(normalized.id, "queued");
    return this.get(normalized.id);
  }

  enqueueBatch(jobs) {
    if (!Array.isArray(jobs)) throw new TypeError("jobs must be an array");
    const normalized = jobs.map((job) => createAgentJob(job));
    if (this.#jobs.size + normalized.length > MAX_QUEUE_SIZE) {
      throw new RangeError("dispatch queue limit exceeded");
    }
    validateGraph([...this.#jobs.values(), ...normalized]);
    for (const job of normalized) {
      if (this.#jobs.has(job.id)) throw new TypeError(`duplicate job id: ${job.id}`);
    }
    for (const job of normalized) {
      this.#jobs.set(job.id, job);
      this.#states.set(job.id, "queued");
    }
    return normalized.map((job) => this.get(job.id));
  }

  // Synchronous reserve = dependency/resource check + active registration in one operation.
  tryReserve(id) {
    const job = this.#jobs.get(id);
    if (!job || this.#states.get(id) !== "queued") return null;
    const dependencies = job.dependsOn.map((dependency) => this.#states.get(dependency));
    if (dependencies.some((state) => state === "failed" || state === "cancelled")) {
      this.#states.set(id, "cancelled");
      return null;
    }
    if (!dependencies.every((state) => state === "succeeded")) return null;
    const activeJobs = [...this.#active].map((activeId) => this.#jobs.get(activeId));
    const completedIds = [...this.#states.entries()]
      .filter(([, state]) => state === "succeeded")
      .map(([jobId]) => jobId);
    if (!canRun(job, completedIds, activeJobs)) return null;
    this.#active.add(id);
    this.#states.set(id, "running");
    return this.get(id);
  }

  complete(id, outcome) {
    const state = this.#states.get(id);
    if (state !== "running") throw new TypeError(`job is not running: ${id}`);
    if (!["succeeded", "failed"].includes(outcome)) throw new TypeError(`invalid outcome: ${outcome}`);
    this.#active.delete(id);
    if (outcome === "failed") {
      const job = this.#jobs.get(id);
      const retry = nextAttempt(job);
      if (retry) {
        this.#jobs.set(id, retry);
        this.#states.set(id, "queued");
        return this.get(id);
      }
    }
    this.#states.set(id, outcome);
    this.#cancelBlockedDependents();
    return this.get(id);
  }

  cancel(id) {
    const state = this.#states.get(id);
    if (!state || isTerminal(state)) return null;
    this.#active.delete(id);
    this.#states.set(id, "cancelled");
    this.#cancelBlockedDependents();
    return this.get(id);
  }

  get(id) {
    const job = this.#jobs.get(id);
    return job ? Object.freeze({ ...job, state: this.#states.get(id) }) : null;
  }

  list(state = null) {
    if (state !== null && !STATES.includes(state)) throw new TypeError(`invalid state: ${state}`);
    return [...this.#jobs.keys()]
      .map((id) => this.get(id))
      .filter((job) => state === null || job.state === state);
  }

  #cancelBlockedDependents() {
    for (const job of this.#jobs.values()) {
      if (this.#states.get(job.id) !== "queued") continue;
      if (job.dependsOn.some((dependency) => ["failed", "cancelled"].includes(this.#states.get(dependency)))) {
        this.#states.set(job.id, "cancelled");
      }
    }
  }
}

export { MAX_QUEUE_SIZE, STATES, validateGraph, isActive, isTerminal };
