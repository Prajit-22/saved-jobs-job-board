const list = document.getElementById("jobs");
const savedList = document.getElementById("saved");
const savedEmpty = document.getElementById("saved-empty");
const search = document.getElementById("search");
const message = document.getElementById("message");

let savedIds = new Set();
let entering = true; // cards fade in on first load only, not on every refresh
let justSaved = null; // id of the job saved last, so its card in the saved list can flash once

const savedCount = document.getElementById("saved-count");

// One job as a card: initial, title, company and place, stipend, then the action button.
function card(job, action) {
  const li = document.createElement("li");
  if (entering) li.classList.add("enter");
  const mark = document.createElement("div");
  mark.className = "mark";
  mark.textContent = job.company.charAt(0);
  const info = document.createElement("div");
  info.className = "info";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = job.title;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = job.company;
  const chips = document.createElement("div");
  chips.className = "chips";
  for (const [text, extra] of [[job.location, ""], [`Rs ${job.stipend.toLocaleString("en-IN")} / month`, " pay"]]) {
    const chip = document.createElement("span");
    chip.className = `chip${extra}`;
    chip.textContent = text;
    chips.append(chip);
  }
  info.append(title, meta, chips);
  if (justSaved === job.id && action.classList.contains("remove")) li.classList.add("fresh");
  li.append(mark, info, action);
  return li;
}

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Something went wrong");
  return body;
}

const BOOKMARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';

function button(label, onClick, icon = false) {
  const b = document.createElement("button");
  b.type = "button";
  if (icon) b.innerHTML = BOOKMARK;
  b.append(label);
  b.addEventListener("click", onClick);
  return b;
}

function renderSaved(jobs) {
  savedIds = new Set(jobs.map((j) => j.id));
  savedList.innerHTML = "";
  savedEmpty.hidden = jobs.length > 0;
  savedCount.textContent = jobs.length;
  for (const job of jobs) {
    const remove = button("Remove", () => change(`/api/saved/${encodeURIComponent(job.id)}`, { method: "DELETE" }));
    remove.className = "remove";
    remove.setAttribute("aria-label", `Remove ${job.title} at ${job.company}`);
    savedList.append(card(job, remove));
  }
}

async function show(query = "") {
  const jobs = await api(`/api/jobs?q=${encodeURIComponent(query)}`);
  list.innerHTML = "";
  document.getElementById("none").hidden = jobs.length > 0;
  document.getElementById("result-count").textContent = `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`;
  for (const job of jobs) {
    const saved = savedIds.has(job.id);
    const b = button(saved ? "Saved" : "Save", () => change("/api/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: job.id }),
    }, job.id), true);
    b.disabled = saved;
    b.classList.toggle("is-saved", saved);
    b.setAttribute("aria-label", `${saved ? "Saved" : "Save"} ${job.title} at ${job.company}`);
    list.append(card(job, b));
  }
}

// Save or remove, then refresh both lists from what the server now holds.
async function change(path, options, savedJobId = null) {
  message.textContent = "";
  justSaved = savedJobId;
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
  entering = false;
}

search.addEventListener("input", () => show(search.value).catch((e) => (message.textContent = e.message)));
start();
