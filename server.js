// A small job board: a JSON API and one page. Run with `npm start`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadJobs, searchJobs } from "./lib/jobs.js";
import { createSavedStore, SavedError } from "./lib/saved.js";

const PORT = Number(process.env.PORT ?? 3000);

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new SavedError("Request body too large", 413);
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new SavedError("Body must be valid JSON", 400);
  }
}

/** `savedPath` lets tests use a temporary file instead of data/saved.json. */
export function createApp({ savedPath } = {}) {
  let store;
  const getStore = async () => (store ??= createSavedStore({ jobs: await loadJobs(), path: savedPath }));

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/saved" && req.method === "GET") {
        return sendJson(res, 200, await (await getStore()).list());
      }
      if (url.pathname === "/api/saved" && req.method === "POST") {
        const body = await readJsonBody(req);
        return sendJson(res, 201, await (await getStore()).save(body?.jobId));
      }
      if (url.pathname.startsWith("/api/saved/") && req.method === "DELETE") {
        const jobId = decodeURIComponent(url.pathname.slice("/api/saved/".length));
        return sendJson(res, 200, await (await getStore()).remove(jobId));
      }
      if (req.method === "GET" && url.pathname === "/api/jobs") {
        const jobs = await loadJobs();
        return sendJson(res, 200, searchJobs(jobs, url.searchParams.get("q")));
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js")) {
        const file = url.pathname === "/" ? "index.html" : "app.js";
        const type = file.endsWith(".html") ? "text/html" : "text/javascript";
        const body = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
        return res.end(body);
      }
      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      if (err instanceof SavedError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      sendJson(res, 500, { error: "Something went wrong" });
    }
  });
}

// Started directly (npm start), not imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(PORT, () => console.log(`Job board on http://localhost:${PORT}`));
}
