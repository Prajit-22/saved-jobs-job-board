# Job board starter

A small job board for an insiderOne work sample. It is made up: the jobs and
companies are not real.

## Run it

You need Node 20 or newer. There are no packages to install.

```
npm start      # then open http://localhost:3000
npm test       # runs the tests in test/
```

## What is here

- `server.js`: the web server. `GET /api/jobs?q=` lists jobs, `GET /` serves the page.
- `lib/jobs.js`: reading and searching the jobs. Pure functions.
- `jobs.json`: the jobs.
- `public/`: the page and its script.
- `test/`: tests, using Node's built-in test runner.

## Your task

See the work sample brief on insiderOne: add saved jobs (save, list, remove),
with tests, and add a short section to this README about what you built.

## Saved jobs (what I added)

Each job has a Save button. A "Saved jobs" list sits above the full list, with a Remove button on each saved job. Saved jobs are kept on the server, so they are still there after a reload or restart.

**API**

| Call | Result |
| --- | --- |
| `POST /api/saved` with `{ "jobId": "j1" }` | `201` and the full saved list |
| `GET /api/saved` | `200` and the saved jobs, in the order they were saved |
| `DELETE /api/saved/:jobId` | `200` and the saved list after removal |

Saving the same job twice keeps one copy. An unknown job id gives `404` with `{ "error": "No job with id ..." }`. A missing id or bad JSON gives `400`. Removing a job that is not saved gives `404`.

**Run it:** `npm start`, then open http://localhost:3000. Saved ids are written to `data/saved.json` (created on first save, ignored by git).

**Tests:** `npm test`. The new tests are in `test/saved.test.js` and cover the store (save, list, remove, duplicates, bad ids, many saves at once, a damaged file) and the HTTP API (including errors and a restart).

**Files:** `lib/saved.js` is the store, `server.js` has the routes, `public/app.js` and `public/index.html` have the page.

**One decision:** the store keeps only job ids in the file, and looks up the job details from `jobs.json` each time. That way the saved list never holds stale copies if a job's details change, and a job that was removed from `jobs.json` simply stops showing. The cost is one lookup per saved job, which is nothing at this size. Writes are queued one at a time and go through a temp file and rename, so two quick requests cannot overwrite each other and a crash cannot leave a half-written file.

**What I would do next:** save per user (this version has one shared list, as there are no accounts), add a way to show only saved jobs in search, and show a small "saved" count in the page title.

**AI use:** this was built with AI assistance (code, tests and this section were drafted with an AI coding assistant, then run and checked by running the tests and the app). The starter files `lib/jobs.js`, `jobs.json` and the original three tests are unchanged.
