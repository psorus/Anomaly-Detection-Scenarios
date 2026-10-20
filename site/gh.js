
/* ---------- GitHub: edit, history, discussion and proposal links ---------- */
const CFG = (() => { try { return JSON.parse(document.getElementById("atlas-config").textContent); } catch (e) { return {}; } })();
const GH = CFG.repoUrl || "https://github.com/OWNER/REPO";
const BR = encodeURIComponent(CFG.branch || "main");
const KIND = { scen: ["scenario", "scenarios"], app: ["application", "applications"], ds: ["dataset", "datasets"] };
const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const ghFile = f => `${GH}/blob/${BR}/${f}`;
const ghEdit = f => `${GH}/edit/${BR}/${f}`;
const ghHistory = f => `${GH}/commits/${BR}/${f}`;
const ghNewFile = (dir, name, value) => `${GH}/new/${BR}/${dir}?${qs({ filename: name, value })}`;
function ghDiscussSearch(id) { return `${GH}/discussions?${qs({ discussions_q: id })}`; }
function ghDiscussNew(kind, rec) {
  const cat = (CFG.discussions || {})[KIND[kind][1]] || "general";
  return `${GH}/discussions/new?${qs({ category: cat, title: `${rec.id}: ${rec.name}`, body: `Discussion about ${KIND[kind][0]} **${rec.id} ${rec.name}**.\n\nFile: ${ghFile(rec._file)}\nSite: ${CFG.siteUrl || ""}\n\nWhat should change, and what is the evidence?\n` })}`;
}
function ghIssue(kind, rec) {
  return `${GH}/issues/new?${qs({ template: "change-request.yml", title: `[${rec.id}] `, record: `${rec.id} ${rec.name}`, labels: `change request,${KIND[kind][0]}` })}`;
}
function reviewBadge(rec) {
  return rec.review === "reviewed"
    ? `<span class="rv ok" data-tip="Checked against its evidence by ${esc((rec.reviewers || []).map(r => "@" + r).join(", ") || "a reviewer")}">Reviewed</span>`
    : `<span class="rv" data-tip="Initial draft, not yet checked against sources. Anyone can review it in a pull request.">Draft</span>`;
}
function ghBar(kind, rec) {
  if (!rec._file) return "";
  const k = KIND[kind][0];
  return `<div class="ghbar" role="group" aria-label="Change this ${k} on GitHub">
    <a class="btn gh primary" href="${esc(ghEdit(rec._file))}" target="_blank" rel="noopener" data-tip="Opens the file in GitHub's editor. GitHub forks the repository for you and turns your edit into a pull request.">Edit on GitHub</a>
    <a class="btn gh" href="${esc(ghDiscussSearch(rec.id))}" target="_blank" rel="noopener">Discussions</a>
    <a class="btn gh" href="${esc(ghDiscussNew(kind, rec))}" target="_blank" rel="noopener">Start a discussion</a>
    <a class="btn gh" href="${esc(ghIssue(kind, rec))}" target="_blank" rel="noopener" data-tip="Describe a correction without editing the file yourself.">Report a problem</a>
    <a class="btn gh" href="${esc(ghHistory(rec._file))}" target="_blank" rel="noopener" data-tip="Every change to this ${k}, who made it and why.">History</a>
    <a class="gh-file mono" href="${esc(ghFile(rec._file))}" target="_blank" rel="noopener">${esc(rec._file)}</a>
  </div>`;
}
function evidenceHTML(a) {
  const ev = a.evidence || {};
  const keys = Object.keys(ev).filter(k => (ev[k] || []).length);
  const conc = (a.concerns || []).length ? `<div class="sec"><h3>Open concerns</h3><ul class="evl">${a.concerns.map(c => `<li>${esc(c.note)}<span class="hint"> @${esc(c.by || "")}</span></li>`).join("")}</ul></div>` : "";
  if (!keys.length) return conc + `<div class="sec"><h3>Sources</h3><p class="hint">No sources recorded yet. Use the <b>Review</b> tab to add one.</p></div>`;
  return conc + `<div class="sec"><h3>Sources</h3><dl class="kv">${keys.map(k => `<dt>${esc(k === "general" ? "Whole entry" : P[k] ? P[k].label : k)}</dt><dd><ul class="evl">${ev[k].map(e =>
    `<li>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.source || hostOf(e.url))}</a>` : esc(e.source)}${e.note ? `<span class="hint"> ${esc(e.note)}</span>` : ""}</li>`).join("")}</ul></dd>`).join("")}</dl></div>`;
}

/* A builder group as a scenario rule: the same conditions the builder used to form the group. */
const BYRULE = {
  mf: a => ["mod", "first", FAM_MODS[a.mf]], mod1: a => ["mod", "first", [a.mod[0]]], at1: a => ["at", "first", [a.at[0]]],
  unit1: a => ["unit", "first", [a.unit[0]]], ar: a => ["ar", "in", [a.ar]], dim: a => ["dim", "in", [a.dim]],
  sup1: a => ["sup", "first", [a.sup[0]]], pt: a => ["pt", "in", [a.pt]], ep1: a => ["ep", "first", [a.ep[0]]], adv: a => ["adv", "in", [a.adv]],
};
function groupRule(g) {
  const a = g.members[0], m = {};
  const put = (k, op, vs) => {
    m[k] = m[k] || {};
    if (!m[k][op]) m[k][op] = vs.slice();
    else if (op === "first" || op === "in") m[k][op] = m[k][op].filter(v => vs.includes(v));
    else m[k][op] = [...new Set([...m[k][op], ...vs])];
  };
  B.by.forEach(k => { const [p, op, vs] = BYRULE[k](a); put(p, op, vs); });
  B.flags.forEach((f, j) => { const [k, v] = f.split(":"); put(k, g.fl[j] ? "all" : "none", [v]); });
  return m;
}
function ruleMatches(a, m) {
  return Object.entries(m).every(([k, c]) => Object.entries(c).every(([op, vs]) => {
    const xs = vals(a, k);
    return op === "in" || op === "any" ? xs.some(v => vs.includes(v)) : op === "all" ? vs.every(v => xs.includes(v))
      : op === "first" ? xs.length > 0 && vs.includes(xs[0]) : op === "none" ? !xs.some(v => vs.includes(v)) : false;
  }));
}
function nextId(prefix, list, width) {
  const n = Math.max(0, ...list.map(x => +(String(x.id).match(/(\d+)$/) || [0, 0])[1])) + 1;
  return prefix + String(n).padStart(width, "0");
}
const yq = s => JSON.stringify(String(s));
function scenarioYAML(id, m, g) {
  const doms = [...new Set(g.members.map(a => DOM[a.dom]))];
  const lines = [
    `# Scenario ${id}, proposed from the scenario builder. Members are computed from the rule; edit the text fields and open a pull request.`,
    `id: ${id}`, `name: ${yq("Name this scenario")}`, `family: ${yq(SC[0].family)}`, `paper: ""`,
    `summary: ${yq(`${g.members.length} applications from ${doms.length} domains (${doms.slice(0, 4).join(", ")}${doms.length > 4 ? ", …" : ""}) that share these properties. Describe what they have in common.`)}`,
    `rule:`, `  - match:`];
  Object.entries(m).forEach(([k, c]) => {
    lines.push(`      ${k}:  # ${P[k].label}`);
    Object.entries(c).forEach(([op, vs]) => lines.push(`        ${op}: [${vs.join(", ")}]`));
  });
  lines.push(`    datasets_need: []`);
  ["metrics", "protocol", "preprocessing", "algorithms", "avoid", "gaps"].forEach(k => lines.push(`${k}: ${yq("To be discussed.")}`));
  lines.push(`review:`, `  status: draft`, `  reviewers: []`, `  note: ${yq("Proposed from the scenario builder; not yet reviewed.")}`);
  return lines.join("\n") + "\n";
}
function proposeGroup(i) {
  const g = (window.__groups || [])[i];
  if (!g) return;
  const m = groupRule(g);
  const id = nextId("S", SC, 2);
  window.open(ghNewFile("data/scenarios", `${id}.yaml`, scenarioYAML(id, m, g)), "_blank", "noopener");
}
function proposeButton(g, i) {
  const m = groupRule(g);
  const exact = APPS.filter(a => ruleMatches(a, m)).length === g.members.length;
  return exact && (B.by.length || B.flags.length)
    ? `<button type="button" class="btn gh" data-propose="${i}" data-tip="Opens a new scenario file on GitHub with this group's rule filled in. Name it, describe it and submit it as a pull request.">Propose as a scenario on GitHub</button>` : "";
}

/* Templates for brand-new records, opened in GitHub's file editor. */
function appTemplate(dom) {
  const id = nextId(dom + "-", APPS, 3);
  const L = [`# Application ${id}. Allowed values: data/taxonomy/properties.yaml. Remove this line's # comments if you like.`, `id: ${id}`,
    `name: ${yq("Short name of the application")}`, `domain: ${dom}`, `subdomain: ${yq("Subdomain")}`,
    `description: ${yq("Two or three sentences: what is scored, what counts as an anomaly, who acts on it.")}`, `properties:`];
  PROPS.forEach(p => L.push(`  ${p.key}: ${p.multi ? "[]" : p.values[0][0]}  # ${p.label}: ${p.values.map(v => v[0]).join(" | ")}`));
  L.push(`evidence: {}  # property code -> list of {source, url, note}`, `references: []`, `review:`, `  status: draft`, `  reviewers: []`, `  note: ${yq("Proposed by a contributor; not yet reviewed.")}`);
  return [id, L.join("\n") + "\n"];
}
function dsTemplate() {
  const id = nextId("D", DS, 3);
  return [id, [`# Dataset ${id}. Codes: data/taxonomy/dataset-properties.yaml and data/taxonomy/properties.yaml (modality).`, `id: ${id}`,
    `name: ${yq("Dataset name")}`, `year: "${new Date().getFullYear()}"`, `tier: app  # generic | suite | bench | app`, `labels: full  # full | partial | weak | none`,
    `anomaly_origin: real  # real | semi | sim`, `annotations: []  # ${DSP.ann.values.map(v => v[0]).join(" | ")}`, `modality: [tab]  # ${P.mod.values.map(v => v[0]).join(" | ")}`,
    `size: ""`, `description: ${yq("What the data is, where it comes from and how anomalies are labeled.")}`, `applications: []  # application ids, most representative first`,
    `links:`, `  page:`, `    url: "https://"`, `    found_in_search: false`, `  other: []`, `references: []`, `review:`, `  status: draft`, `  reviewers: []`,
    `  note: ${yq("Proposed by a contributor; not yet reviewed.")}`].join("\n") + "\n"];
}

function renderContribute() {
  const iss = t => `${GH}/issues/new?template=${t}`;
  $("#new-dom").innerHTML = DOM_ORDER.map(d => `<option value="${d}">${esc(DOM[d])}</option>`).join("");
  $("#c-issues").innerHTML = [["new-application.yml", "Application form"], ["new-dataset.yml", "Dataset form"], ["new-scenario.yml", "Scenario form"]]
    .map(([t, l]) => `<a class="btn gh" href="${esc(iss(t))}" target="_blank" rel="noopener">${l}</a>`).join("");
  $("#c-links").innerHTML = `<a class="btn gh" href="${esc(GH)}/discussions" target="_blank" rel="noopener">Discussions</a>
    <a class="btn gh" href="${esc(GH)}/pulls" target="_blank" rel="noopener">Open pull requests</a>
    <a class="btn gh" href="${esc(GH)}/blob/${BR}/CONTRIBUTING.md" target="_blank" rel="noopener">Full guide</a>`;
  document.querySelectorAll("a.gh-link").forEach(a => {
    a.href = a.dataset.path ? ghFile(a.dataset.path) : iss(a.dataset.issue);
    a.target = "_blank"; a.rel = "noopener";
  });
  $("#c-build").innerHTML = `Data as of commit <a class="mono" href="${esc(GH)}/commit/${esc(CFG.sha || "")}" target="_blank" rel="noopener">${esc((CFG.sha || "unknown").slice(0, 7))}</a>, ${esc(CFG.built || "")}. Downloads: <a href="catalog.json">catalog.json</a> · <a href="applications.csv">applications.csv</a> · <a href="datasets.csv">datasets.csv</a> · <a href="scenarios.csv">scenarios.csv</a>.`;
}

/* ---------- Review queue: verdicts collect in this browser and go to GitHub as one batch ---------- */
const RV = { kind: load("rvKind", "app"), dom: "", all: false, shown: 25, d: load("rvDraft", {}), sent: load("rvSent", {}) };
if (!["app", "scen", "ds"].includes(RV.kind)) RV.kind = "app";
const RECS = { app: () => APPS, scen: () => SC, ds: () => DS };
const byKind = (k, id) => (k === "app" ? BYID : k === "scen" ? SCID : DSID)[id];
function rvSave() { store("rvDraft", RV.d); store("rvSent", RV.sent); }
function rvList() {
  return RECS[RV.kind]().filter(x => {
    if (RV.dom && RV.kind !== "scen" && !(RV.kind === "app" ? x.dom === RV.dom : x.dom.includes(RV.dom))) return false;
    if (!RV.all && (x.review === "reviewed" || RV.sent[x.id])) return false;
    return true;
  });
}
function renderReview() {
  const kp = (n, d, w) => `<div class="kpi"><b>${n}<span>/${d}</span></b><span>${w}</span></div>`;
  const rv = list => list.filter(x => x.review === "reviewed").length;
  $("#k-review").innerHTML = kp(rv(SC), SC.length, "scenarios reviewed") + kp(rv(APPS), APPS.length, "applications reviewed") + kp(rv(DS), DS.length, "datasets reviewed");
  document.querySelectorAll("[data-rkind]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.rkind === RV.kind)));
  const sel = $("#r-dom");
  sel.closest("label").hidden = RV.kind === "scen";
  sel.innerHTML = `<option value="">All domains</option>` + DOM_ORDER.map(d => `<option value="${d}"${RV.dom === d ? " selected" : ""}>${esc(DOM[d])}</option>`).join("");
  $("#r-all").checked = RV.all;
  drawReviewList();
}
function rvFacts(k, x) {
  if (k === "app") return `<ul class="rprops">${PROPS.map(p => `<li><span class="hint">${esc(p.label)}</span> ${vals(x, p.key).length ? vals(x, p.key).map(v => `<span title="${esc(DESC[p.key][v])}">${esc(LBL[p.key][v])}</span>`).join(", ") : "none"}</li>`).join("")}</ul>`;
  if (k === "scen") return `<div class="sig">${sigTags(x.rule, false)}</div><p class="hint">${x.members.length} applications, for example ${x.members.slice(0, 4).map(i => esc(BYID[i].name)).join("; ")}.</p>`;
  return `<dl class="kv rkv"><dt>Readiness</dt><dd><span class="chip">${esc(DL.tier[x.tier])}</span></dd><dt>Labels</dt><dd><span class="chip">${esc(DL.lab[x.lab])}</span></dd>
    <dt>Anomalies</dt><dd><span class="chip">${esc(DL.real[x.real])}</span></dd><dt>Annotations</dt><dd>${x.ann.length ? x.ann.map(v => `<span class="chip">${esc(DL.ann[v])}</span>`).join("") : `<span class="hint">binary labels only</span>`}</dd>
    <dt>Modality</dt><dd>${x.mod.map(v => `<span class="chip">${esc(LBL.mod[v])}</span>`).join("")}</dd><dt>Size</dt><dd>${esc(x.size || "not stated")}</dd>
    <dt>Comes from</dt><dd>${x.apps.length ? x.apps.slice(0, 4).map(i => esc(BYID[i].name)).join("; ") : `<span class="hint">a generic collection</span>`}</dd></dl>${x.url ? `<p><a href="${esc(x.url)}" target="_blank" rel="noopener">Dataset page</a></p>` : ""}`;
}
function rvSources(k, x) {
  const have = [];
  Object.values(x.evidence || {}).forEach(l => (l || []).forEach(e => have.push(e.source || e.url)));
  const sug = x.sugg || [];
  return `<div class="rsrc">
    ${have.length ? `<p class="hint">Already recorded: ${have.map(esc).join("; ")}</p>` : ""}
    ${sug.length ? `<p class="rsh">Suggested reading <span class="hint">(unverified suggestions; check the paper before choosing it)</span></p>
      <ul class="sugg">${sug.map((g, i) => `<li><label><input type="checkbox" data-rs="${x.id}" value="${i}"> <span>${esc(g.t)}</span></label> <a href="${esc(g.u || scholarQ(g.t))}" target="_blank" rel="noopener">${g.u ? "Open" : "Find"}</a>${g.why ? `<span class="hint"> ${esc(g.why)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="hint">No suggestions yet for this entry.</p>`}
    <label class="ro"><span>Other source</span><input type="text" class="btn" id="ro-${x.id}" placeholder="DOI, link, or Author (Year). Title."></label>
  </div>`;
}
function rvCard(k, x) {
  const d = RV.d[x.id], conc = (x.concerns || []).length;
  const head = `<div class="rhead"><span class="mono">${x.id}</span>${reviewBadge(x)}${conc ? `<span class="rv warn">${conc} open ${conc === 1 ? "concern" : "concerns"}</span>` : ""}<span class="sp"></span><button type="button" class="linkbtn" data-open-${k === "ds" ? "ds" : k}="${x.id}">Open</button></div>`;
  if (d) return `<article class="rcard done" id="rc-${x.id}">${head}<h4>${esc(x.name)}</h4>
    <p class="rdone">${d.v === "ok" ? "Marked correct" : "Flagged"}${d.src.length ? ` · ${d.src.length} source${d.src.length > 1 ? "s" : ""}` : ""}${d.note ? ` · “${esc(d.note)}”` : ""} <button type="button" class="linkbtn" data-rundo="${x.id}">Undo</button></p></article>`;
  return `<article class="rcard" id="rc-${x.id}">${head}<h4>${esc(x.name)}</h4>
    <p class="sum">${esc(k === "scen" ? x.summary : x.desc)}</p>
    ${rvFacts(k, x)}
    ${rvSources(k, x)}
    <div class="ract">
      <button type="button" class="btn gh primary" data-rok="${x.id}">Correct</button>
      <button type="button" class="btn gh" data-rfix="${x.id}">Something is wrong</button>
    </div>
    <div class="rfix" id="rf-${x.id}" hidden><textarea class="btn" id="rn-${x.id}" rows="3" placeholder="What is wrong, and what should it be?"></textarea>
      <button type="button" class="btn gh primary" data-rfixsave="${x.id}">Save</button></div>
  </article>`;
}
function drawReviewList() {
  const list = rvList();
  const cards = list.slice(0, RV.shown).map(x => rvCard(RV.kind, x)).join("");
  $("#r-list").innerHTML = (list.length ? cards : `<div class="empty">Nothing left to review here. Pick another domain or include reviewed entries.</div>`)
    + (list.length > RV.shown ? `<button type="button" class="btn" id="r-more">Show ${Math.min(25, list.length - RV.shown)} more (${list.length - RV.shown} left)</button>` : "");
  drawReviewBar();
}
function drawReviewBar(msg) {
  const n = Object.keys(RV.d).length, sent = Object.keys(RV.sent).length;
  $("#rbar").hidden = !n && !msg;
  $("#rbar-n").innerHTML = msg || `<b>${n}</b> ${n === 1 ? "verdict" : "verdicts"} ready${sent ? ` · ${sent} sent earlier from this browser` : ""}`;
  $("#r-send").hidden = !n;
}
function rvPick(id) {
  const x = byKind(RV.kind, id) || BYID[id] || SCID[id] || DSID[id];
  const sug = x.sugg || [];
  const src = [...document.querySelectorAll(`input[data-rs="${CSS.escape(id)}"]:checked`)].map(i => sug[+i.value]).map(g => g.u ? `${g.t} ${g.u}` : g.t);
  const other = ($("#ro-" + CSS.escape(id)) || {}).value;
  if (other && other.trim()) src.push(other.trim());
  return src;
}
function rvBatch() {
  return Object.entries(RV.d).map(([id, d]) => "- " + JSON.stringify({ id, verdict: d.v === "ok" ? "correct" : "needs-fix", sources: d.src, note: d.note || "" })).join("\n");
}
function rvSend() {
  const n = Object.keys(RV.d).length;
  if (!n) return;
  const text = rvBatch();
  const base = `${GH}/issues/new?${qs({ template: "review.yml", title: `Review: ${n} ${n === 1 ? "entry" : "entries"}` })}`;
  const full = `${base}&reviews=${encodeURIComponent(text)}`;
  const done = () => { Object.keys(RV.d).forEach(id => { RV.sent[id] = Date.now(); }); RV.d = {}; rvSave(); drawReviewList(); };
  if (full.length < 7500) { window.open(full, "_blank", "noopener"); done(); drawReviewBar(`Opened GitHub with ${n} ${n === 1 ? "verdict" : "verdicts"}. Select <b>Create</b> there to send them.`); return; }
  const go = () => { window.open(base, "_blank", "noopener"); done(); drawReviewBar(`${n} verdicts copied. Paste them into the <b>Reviews</b> field on GitHub, then select <b>Create</b>.`); };
  try { navigator.clipboard.writeText(text).then(go, () => { prompt("Copy these verdicts, then paste them into the Reviews field on GitHub:", text); go(); }); }
  catch (e) { prompt("Copy these verdicts, then paste them into the Reviews field on GitHub:", text); go(); }
}
document.addEventListener("click", e => {
  const t = e.target.closest("button");
  if (!t) return;
  const b = t.dataset;
  if (b.rkind) { RV.kind = b.rkind; RV.shown = 25; store("rvKind", RV.kind); return renderReview(); }
  if (b.rok) { RV.d[b.rok] = { v: "ok", src: rvPick(b.rok), note: "" }; rvSave(); return drawReviewList(); }
  if (b.rfix) { const f = $("#rf-" + CSS.escape(b.rfix)); f.hidden = !f.hidden; if (!f.hidden) $("#rn-" + CSS.escape(b.rfix)).focus(); return; }
  if (b.rfixsave) { const note = $("#rn-" + CSS.escape(b.rfixsave)).value.trim(); if (!note) return $("#rn-" + CSS.escape(b.rfixsave)).focus(); RV.d[b.rfixsave] = { v: "fix", src: rvPick(b.rfixsave), note }; rvSave(); return drawReviewList(); }
  if (b.rundo) { delete RV.d[b.rundo]; rvSave(); return drawReviewList(); }
  if (t.id === "r-more") { RV.shown += 25; return drawReviewList(); }
  if (t.id === "r-send") return rvSend();
  if (t.id === "r-clear") { if (Object.keys(RV.d).length && !confirm("Discard the verdicts you have not sent?")) return; RV.d = {}; rvSave(); return drawReviewList(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "r-dom") { RV.dom = e.target.value; RV.shown = 25; drawReviewList(); }
  if (e.target.id === "r-all") { RV.all = e.target.checked; RV.shown = 25; drawReviewList(); }
});

function ghFooter() {
  const f = document.getElementById("gh-foot");
  if (f) f.innerHTML = `<span>Every record is a file in <a href="${esc(GH)}" target="_blank" rel="noopener">${esc(CFG.repo || "the repository")}</a>; edit it with a pull request.</span>
    <span>Commit <a class="mono" href="${esc(GH)}/commit/${esc(CFG.sha || "")}" target="_blank" rel="noopener">${esc((CFG.sha || "unknown").slice(0, 7))}</a>, ${esc(CFG.built || "")}</span>`;
  const r = document.getElementById("gh-repo");
  if (r) r.href = GH;
}

document.addEventListener("click", e => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.propose !== undefined) return proposeGroup(+t.dataset.propose);
  if (t.id === "new-app") { const [id, y] = appTemplate($("#new-dom").value); window.open(ghNewFile("data/applications", `${id}.yaml`, y), "_blank", "noopener"); }
  if (t.id === "new-ds") { const [id, y] = dsTemplate(); window.open(ghNewFile("data/datasets", `${id}.yaml`, y), "_blank", "noopener"); }
  if (t.id === "new-scen") {
    const id = nextId("S", SC, 2);
    const g = { members: [] };
    window.open(ghNewFile("data/scenarios", `${id}.yaml`, scenarioYAML(id, { pt: { in: ["on"] }, mod: { any: ["mts"] } }, g).replace(/0 applications from 0 domains \(\) that share these properties\. /, "")), "_blank", "noopener");
  }
});
ghFooter();
