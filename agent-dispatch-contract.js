const ROLES = Object.freeze([
  "manager",
  "implementer",
  "tester",
  "reviewer",
  "repairer",
  "integrator",
]);

const TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled"]);
const ACTIVE_STATES = new Set(["queued", "running"]);

export function createAgentJob({ id, role, instruction, resources = [], dependsOn = [], attempt = 0 }) {
  if (typeof id !== "string" || !id.trim()) throw new TypeError("job id is required");
  if (!ROLES.includes(role)) throw new TypeError(`unsupported agent role: ${role}`);
  if (typeof instruction !== "string" || !instruction.trim()) {
    throw new TypeError("instruction is required");
  }
  if (!Array.isArray(resources) || resources.some((value) => typeof value !== "string" || !value.trim())) {
    throw new TypeError("resources must be non-empty strings");
  }
  if (!Array.isArray(dependsOn) || dependsOn.includes(id)) {
    throw new TypeError("invalid dependencies");
  }
  if (!Number.isInteger(attempt) || attempt < 0 || attempt > 2) {
    throw new RangeError("attempt must be an integer between 0 and 2");
  }
  return Object.freeze({ id, role, instruction, resources: Object.freeze([...resources]), dependsOn: Object.freeze([...dependsOn]), attempt });
}

export function canRun(job, completedIds, activeJobs = []) {
  if (!job || !Array.isArray(completedIds) || !Array.isArray(activeJobs)) return false;
  if (!job.dependsOn.every((id) => completedIds.includes(id))) return false;
  return !activeJobs.some((other) =>
    other && Array.isArray(other.resources) && job.resources.some((resource) => other.resources.includes(resource))
  );
}

export function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

export function isActive(state) {
  return ACTIVE_STATES.has(state);
}

export { ROLES };
