import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.js";
import { createSavedStore } from "../lib/saved.js";

const jobs = [
  { id: "a", title: "A", company: "X", location: "Remote", stipend: 1 },
  { id: "b", title: "B", company: "Y", location: "Pune", stipend: 2 },
];

let dir;
before(async () => { dir = await mkdtemp(join(tmpdir(), "saved-")); });
after(async () => { await rm(dir, { recursive: true, force: true }); });

// A running server on a random port, using its own saved file.
async function withServer(fn, file = join(dir, `${Math.random()}.json`)) {
  const server = createApp({ savedPath: file });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try { await fn(base, file); } finally { await new Promise((r) => server.close(r)); }
}
const post = (base, body, raw = false) =>
  fetch(`${base}/api/saved`, { method: "POST", headers: { "content-type": "application/json" }, body: raw ? body : JSON.stringify(body) });

test("store: save, list and remove", async () => {
  const store = createSavedStore({ jobs, path: join(dir, "s1.json") });
  assert.deepEqual(await store.list(), []);
  await store.save("b");
  await store.save("a");
  assert.deepEqual((await store.list()).map((j) => j.id), ["b", "a"]);
  await store.remove("b");
  assert.deepEqual((await store.list()).map((j) => j.id), ["a"]);
});

test("store: saving twice keeps one copy", async () => {
  const store = createSavedStore({ jobs, path: join(dir, "s2.json") });
  await store.save("a");
  await store.save("a");
  assert.equal((await store.list()).length, 1);
});

test("store: unknown or missing id is rejected with a status", async () => {
  const store = createSavedStore({ jobs, path: join(dir, "s3.json") });
  await assert.rejects(store.save("nope"), { status: 404 });
  await assert.rejects(store.save(undefined), { status: 400 });
  await assert.rejects(store.save(42), { status: 400 });
  await assert.rejects(store.remove("a"), { status: 404 });
});

test("store: many saves at once are all kept", async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `j${i}`, title: "t", company: "c", location: "l", stipend: 1 }));
  const store = createSavedStore({ jobs: many, path: join(dir, "s4.json") });
  await Promise.all(many.map((j) => store.save(j.id)));
  assert.equal((await store.list()).length, 20);
});

test("store: a damaged file is treated as empty", async () => {
  const path = join(dir, "s5.json");
  await writeFile(path, "{not json");
  const store = createSavedStore({ jobs, path });
  assert.deepEqual(await store.list(), []);
  await store.save("a");
  assert.equal((await store.list()).length, 1);
});

test("api: save, list, remove", async () => {
  await withServer(async (base) => {
    let res = await post(base, { jobId: "j1" });
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()).map((j) => j.id), ["j1"]);
    res = await fetch(`${base}/api/saved`);
    assert.deepEqual((await res.json()).map((j) => j.id), ["j1"]);
    res = await fetch(`${base}/api/saved/j1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/saved`)).json(), []);
  });
});

test("api: saving the same job twice keeps one copy", async () => {
  await withServer(async (base) => {
    await post(base, { jobId: "j2" });
    await post(base, { jobId: "j2" });
    assert.equal((await (await fetch(`${base}/api/saved`)).json()).length, 1);
  });
});

test("api: errors are clear and the server keeps working", async () => {
  await withServer(async (base) => {
    let res = await post(base, { jobId: "does-not-exist" });
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /does-not-exist/);
    res = await post(base, {});
    assert.equal(res.status, 400);
    res = await post(base, "{oops", true);
    assert.equal(res.status, 400);
    res = await fetch(`${base}/api/saved/j1`, { method: "DELETE" });
    assert.equal(res.status, 404);
    assert.equal((await fetch(`${base}/api/saved`)).status, 200);
  });
});

test("api: saved jobs survive a restart", async () => {
  const file = join(dir, "persist.json");
  await withServer(async (base) => { await post(base, { jobId: "j3" }); }, file);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), ["j3"]);
  await withServer(async (base) => {
    assert.deepEqual((await (await fetch(`${base}/api/saved`)).json()).map((j) => j.id), ["j3"]);
  }, file);
});

test("default file location is a real path, also in a folder with spaces", async () => {
  // Copy the app into a folder with a space in its name (like "New folder" on Windows)
  // and save a job through the DEFAULT location. This failed before, when the URL's raw
  // .pathname ("/C:/New%20folder/...") was used as a file path.
  const root = join(dir, "my folder", "app");
  await cp(new URL("../", import.meta.url), root, {
    recursive: true,
    filter: (src) => !/node_modules|[\\/]data([\\/]|$)|[\\/]\.git/.test(src),
  });
  const load = (file) => import(pathToFileURL(join(root, file)).href);
  const { createSavedStore: make } = await load("lib/saved.js");
  const { loadJobs } = await load("lib/jobs.js");
  const store = make({ jobs: await loadJobs(pathToFileURL(join(root, "jobs.json"))) });
  await store.save("j1");
  assert.ok(existsSync(join(root, "data", "saved.json")), "saved.json is created inside the app folder");
  assert.equal(existsSync(join(dir, "my%20folder")), false, "no folder with an encoded name is created");
  assert.deepEqual((await store.list()).map((j) => j.id), ["j1"]);
});

test("api: simultaneous first requests do not lose saves", async () => {
  // The store is created on the first request. Several requests arriving together
  // must share ONE store, or their file writes can overwrite each other.
  await withServer(async (base) => {
    const ids = ["j1", "j2", "j3", "j4", "j5", "j6", "j7", "j8"];
    const results = await Promise.all(ids.map((jobId) => post(base, { jobId })));
    assert.ok(results.every((r) => r.status === 201));
    const saved = (await (await fetch(`${base}/api/saved`)).json()).map((j) => j.id);
    assert.deepEqual(saved.sort(), ids);
  });
});

test("api: wrong method on a saved route gets 405 with an Allow header", async () => {
  await withServer(async (base) => {
    let res = await fetch(`${base}/api/saved`, { method: "PUT" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, POST");
    res = await fetch(`${base}/api/saved/j1`, { method: "GET" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "DELETE");
    assert.match((await res.json()).error, /not allowed/i);
  });
});

test("api: a badly encoded job id is a 400, not a crash", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/saved/%E0%A4%A`, { method: "DELETE" });
    assert.equal(res.status, 400);
    assert.equal((await fetch(`${base}/api/saved`)).status, 200);
  });
});

test("api: an id with special characters is looked up as given", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/saved/${encodeURIComponent("a/b c")}`, { method: "DELETE" });
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /a\/b c/);
  });
});

test("store: an empty or whitespace-only id is a 400 for save and remove", async () => {
  const store = createSavedStore({ jobs, path: join(dir, "blank.json") });
  for (const id of ["", " ", "  \t\n"]) {
    await assert.rejects(store.save(id), { status: 400 });
    await assert.rejects(store.remove(id), { status: 400 });
  }
  assert.deepEqual(await store.list(), []);
});

test("api: a whitespace-only id is a 400 (POST body and DELETE path)", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, { jobId: "   " })).status, 400);
    assert.equal((await fetch(`${base}/api/saved/%20%20`, { method: "DELETE" })).status, 400);
    assert.equal((await fetch(`${base}/api/saved/`, { method: "DELETE" })).status, 400);
  });
});

test("store: a failed write is reported, cleans up its temp file and keeps old data", async () => {
  const path = join(dir, "failing.json");
  const good = createSavedStore({ jobs, path });
  await good.save("a");
  const removed = [];
  const fs = {
    ...(await import("node:fs/promises")),
    rename: async () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); },
    rm: async (p, o) => { removed.push(p); return (await import("node:fs/promises")).rm(p, o); },
  };
  const broken = createSavedStore({ jobs, path, fs });
  await assert.rejects(broken.save("b"), { status: 500, message: /Could not save/ });
  assert.equal(removed.length, 1);
  assert.equal(existsSync(removed[0]), false);
  assert.deepEqual((await good.list()).map((j) => j.id), ["a"]);
  // The store still works after a failure.
  assert.deepEqual((await createSavedStore({ jobs, path }).save("b")).map((j) => j.id), ["a", "b"]);
});
