
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
  if (!keys.length) return `<div class="sec"><h3>Evidence</h3><p class="hint">No evidence recorded yet for these codings. To support or challenge a value, add a source under <code>evidence</code> in the file, for example <code>pt: [{source: "Author (2024), Section 3", url: "https://…", note: "decisions within 50 ms"}]</code>.</p></div>`;
  return `<div class="sec"><h3>Evidence</h3><dl class="kv">${keys.map(k => `<dt>${esc(k === "general" ? "General" : P[k] ? P[k].label : k)}</dt><dd><ul class="evl">${ev[k].map(e =>
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
  const st = CFG.stats || {};
  const rv = (n, d, what) => `<div class="kpi"><b>${n ?? "–"}<span>/${d}</span></b><span>${what}</span></div>`;
  $("#k-review").innerHTML = rv(st.reviewed_scenarios, SC.length, "scenarios reviewed") + rv(st.reviewed_applications, APPS.length, "applications reviewed")
    + rv(st.reviewed_datasets, DS.length, "datasets reviewed") + rv(st.applications_with_evidence, APPS.length, "applications with recorded evidence");
  $("#new-dom").innerHTML = DOM_ORDER.map(d => `<option value="${d}">${esc(DOM[d])} (${d})</option>`).join("");
  const iss = t => `${GH}/issues/new?template=${t}`;
  $("#c-issues").innerHTML = [["new-application.yml", "Propose an application"], ["new-dataset.yml", "Propose a dataset"], ["new-scenario.yml", "Propose a scenario"], ["change-request.yml", "Request a correction"]]
    .map(([t, l]) => `<a class="btn gh" href="${esc(iss(t))}" target="_blank" rel="noopener">${l}</a>`).join("");
  $("#c-links").innerHTML = `<a class="btn gh" href="${esc(GH)}" target="_blank" rel="noopener">Repository</a>
    <a class="btn gh" href="${esc(GH)}/discussions" target="_blank" rel="noopener">Discussions</a>
    <a class="btn gh" href="${esc(GH)}/pulls" target="_blank" rel="noopener">Open pull requests</a>
    <a class="btn gh" href="${esc(GH)}/blob/${BR}/CONTRIBUTING.md" target="_blank" rel="noopener">Contributing guide</a>
    <a class="btn gh" href="${esc(GH)}/blob/${BR}/GOVERNANCE.md" target="_blank" rel="noopener">How decisions are made</a>`;
  $("#c-build").innerHTML = `Built from commit <a class="mono" href="${esc(GH)}/commit/${esc(CFG.sha || "")}" target="_blank" rel="noopener">${esc((CFG.sha || "unknown").slice(0, 7))}</a> on ${esc(CFG.built || "")}.
    Downloads: <a href="catalog.json">catalog.json</a> · <a href="applications.csv">applications.csv</a> · <a href="datasets.csv">datasets.csv</a> · <a href="scenarios.csv">scenarios.csv</a> · <a href="stats.json">stats.json</a>.
    The code that computes every number: <a href="${esc(ghFile("scripts/atlaslib.py"))}" target="_blank" rel="noopener">scripts/atlaslib.py</a>.`;
}

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
