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

## Saved jobs

This adds a saved-jobs list to the starter job board. Save a job, find it in the Saved panel, or remove it when it is no longer needed. The list survives page refreshes and server restarts.

### Run and test

Requires Node.js 20 or newer. No extra packages or installation steps are needed.

Start the app:

    node server.js

Open http://localhost:3000 in a browser.

Run the tests:

    node --test

Expected result: 17 passed, 0 failed.

### Implementation

- Added Save and Remove buttons, a saved-job count, and a search empty state.
- Added POST /api/saved, GET /api/saved and DELETE /api/saved/:jobId.
- Saved job IDs are stored in data/saved.json, which is created on the first save.
- Saving the same job twice keeps one entry. Invalid requests and unknown IDs return JSON errors.

The store is in lib/saved.js, the routes are in server.js, and the interface is in public/index.html and public/app.js. Tests are in test/saved.test.js.

### A design choice

The saved list stores job IDs rather than copies of job details. Titles, companies and stipends come from jobs.json, so there is only one place to update them.

Writes are queued to avoid overlapping updates. Each update is written to a temporary file before replacing the saved file.

### Testing

Tests cover saving, listing, removing, duplicate saves, invalid IDs, concurrent saves, damaged files, API errors and persistence after a restart.

Local testing on Windows caught a file-path bug that the original tests missed. The fix uses fileURLToPath instead of a URL pathname. A regression test now runs the app from a folder with spaces in its name.

### With more time

The next step would be separate saved lists for individual users. This version has one shared list because the starter has no accounts. A saved-only search filter would also be useful.

### AI assistance

Built with an AI coding assistant for the implementation, tests and README. I tested the app on Windows, reported a file-path issue and verified the corrected version.
