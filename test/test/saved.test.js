import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
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
