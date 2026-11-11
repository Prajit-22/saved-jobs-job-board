const list = document.getElementById("jobs");
const savedList = document.getElementById("saved");
const savedEmpty = document.getElementById("saved-empty");
const search = document.getElementById("search");
const message = document.getElementById("message");

let savedIds = new Set();

function describe(job) {
  return `${job.title} at ${job.company}, ${job.location}. Rs ${job.stipend.toLocaleString("en-IN")} a month.`;
}

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Something went wrong");
  return body;
}

function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function renderSaved(jobs) {
  savedIds = new Set(jobs.map((j) => j.id));
  savedList.innerHTML = "";
  savedEmpty.hidden = jobs.length > 0;
  for (const job of jobs) {
    const li = document.createElement("li");
    li.append(describe(job), " ", button("Remove", () => change(`/api/saved/${encodeURIComponent(job.id)}`, { method: "DELETE" })));
    savedList.append(li);
  }
}

async function show(query = "") {
  const jobs = await api(`/api/jobs?q=${encodeURIComponent(query)}`);
  list.innerHTML = "";
  for (const job of jobs) {
    const li = document.createElement("li");
    li.append(describe(job), " ");
    const saved = savedIds.has(job.id);
    const b = button(saved ? "Saved" : "Save", () => change("/api/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: job.id }),
    }));
    b.disabled = saved;
    li.append(b);
    list.append(li);
  }
}

// Save or remove, then refresh both lists from what the server now holds.
async function change(path, options) {
  message.textContent = "";
  try {
    renderSaved(await api(path, options));
    await show(search.value);
  } catch (err) {
    message.textContent = err.message;
  }
}

async function start() {
  try {
    renderSaved(await api("/api/saved"));
    await show();
  } catch (err) {
    message.textContent = err.message;
  }
}

search.addEventListener("input", () => show(search.value).catch((e) => (message.textContent = e.message)));
start();
