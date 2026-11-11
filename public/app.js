const list = document.getElementById("jobs");
const savedList = document.getElementById("saved");
const savedEmpty = document.getElementById("saved-empty");
const search = document.getElementById("search");
const message = document.getElementById("message");

let savedIds = new Set();

const savedCount = document.getElementById("saved-count");

// One job as a card: initial, title, company and place, stipend, then the action button.
function card(job, action) {
  const li = document.createElement("li");
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
  meta.textContent = `${job.company} \u00b7 ${job.location}`;
  const pay = document.createElement("div");
  pay.className = "pay";
  pay.textContent = `Rs ${job.stipend.toLocaleString("en-IN")} a month`;
  info.append(title, meta, pay);
  li.append(mark, info, action);
  return li;
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
  for (const job of jobs) {
    const saved = savedIds.has(job.id);
    const b = button(saved ? "Saved" : "Save", () => change("/api/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: job.id }),
    }));
    b.disabled = saved;
    b.setAttribute("aria-label", `${saved ? "Saved" : "Save"} ${job.title} at ${job.company}`);
    list.append(card(job, b));
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
