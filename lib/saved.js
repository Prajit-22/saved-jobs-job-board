// Saved jobs: a small store backed by a JSON file (a list of job ids).
// Writes are queued so two requests at once cannot overwrite each other,
// and each write goes to a temp file first so a crash cannot leave half a file.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { findJob } from "./jobs.js";

export const DEFAULT_SAVED_PATH = new URL("../data/saved.json", import.meta.url);

/** Raised for problems the caller caused. `status` is the HTTP status to use. */
export class SavedError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "SavedError";
    this.status = status;
  }
}

export function createSavedStore({ jobs, path = DEFAULT_SAVED_PATH }) {
  let queue = Promise.resolve();

  async function readIds() {
    try {
      const ids = JSON.parse(await readFile(path, "utf8"));
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    } catch (err) {
      if (err.code === "ENOENT") return [];
      if (err instanceof SyntaxError) return []; // damaged file: start empty rather than crash
      throw err;
    }
  }

  async function writeIds(ids) {
    await mkdir(dirname(path instanceof URL ? path.pathname : path), { recursive: true });
    const tmp = `${path instanceof URL ? path.pathname : path}.tmp`;
    await writeFile(tmp, JSON.stringify(ids, null, 2));
    await rename(tmp, path instanceof URL ? path.pathname : path);
  }

  // Run one change at a time.
  function exclusive(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  function toJobs(ids) {
    // Skip ids that no longer match a job (the jobs file may change).
    return ids.map((id) => findJob(jobs, id)).filter(Boolean);
  }

  return {
    async list() {
      return toJobs(await readIds());
    },

    async save(jobId) {
      if (typeof jobId !== "string" || !jobId) throw new SavedError("jobId is required", 400);
      if (!findJob(jobs, jobId)) throw new SavedError(`No job with id "${jobId}"`, 404);
      return exclusive(async () => {
        const ids = await readIds();
        if (!ids.includes(jobId)) {
          ids.push(jobId);
          await writeIds(ids);
        }
        return toJobs(ids);
      });
    },

    remove(jobId) {
      return exclusive(async () => {
        const ids = await readIds();
        if (!ids.includes(jobId)) throw new SavedError(`Job "${jobId}" is not saved`, 404);
        const rest = ids.filter((id) => id !== jobId);
        await writeIds(rest);
        return toJobs(rest);
      });
    },
  };
}
