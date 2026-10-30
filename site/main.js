(() => {
"use strict";
const D = JSON.parse(document.getElementById("atlas-data").textContent);
const TAX = D.taxonomy, APPS = D.apps, SC = D.scenarios, DS = D.datasets;
const DSID = Object.fromEntries(DS.map(d => [d.id, d]));
const PROPS = TAX.properties;
const P = Object.fromEntries(PROPS.map(p => [p.key, p]));
const LBL = {}, DESC = {};
PROPS.forEach(p => { LBL[p.key] = {}; DESC[p.key] = {}; p.values.forEach(([c, l, d]) => { LBL[p.key][c] = l; DESC[p.key][c] = d; }); });
const DOM = Object.fromEntries(TAX.domains);
const DOM_ORDER = TAX.domains.map(d => d[0]);
const SINGLE = new Set(PROPS.filter(p => !p.multi).map(p => p.key));
const BYID = Object.fromEntries(APPS.map(a => [a.id, a]));
const SCID = Object.fromEntries(SC.map(s => [s.id, s]));
const TABLE1 = ["at", "ar", "mod", "dim", "sup", "pt", "ep", "oc"];
const EXT = ["unit", "out", "adv", "dq"];
const MF = { tab: "Tabular", ts: "Time series & signals", mts: "Time series & signals", sig: "Time series & signals",
  seq: "Sequences & logs", img: "Vision", vid: "Vision", vol: "Vision", pc: "Vision", rs: "Vision", txt: "Text & code",
  code: "Text & code", gr: "Graphs", dg: "Graphs", st: "Spatio-temporal" };
APPS.forEach(a => {
  a.mf = MF[a.mod[0]];
  a._q = [a.id, a.name, a.desc, a.sub, DOM[a.dom], a.ds.map(i => DSID[i].name).join(" ")].join(" ").toLowerCase();
  a._set = new Set();
  PROPS.forEach(p => vals(a, p.key).forEach(v => a._set.add(p.key + ":" + v)));
});
SC.forEach(s => { s._m = new Set(s.members); });

function vals(a, k) { return SINGLE.has(k) ? (a[k] ? [a[k]] : []) : a[k]; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function $(s) { return document.querySelector(s); }
function pct(n, d) { return d ? Math.round(100 * n / d) : 0; }
function store(k, v) { try { localStorage.setItem("atlas." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
function load(k, dflt) { try { const v = localStorage.getItem("atlas." + k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } }
function countBy(list, fn) { const m = new Map(); list.forEach(x => fn(x).forEach(k => m.set(k, (m.get(k) || 0) + 1))); return m; }
function domSummary(ids, n) {
  const m = countBy(ids.map(i => BYID[i]), a => [a.dom]);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([d, c]) => `${d} ${c}`).join(" · ");
}
function families() { const f = []; SC.forEach(s => { if (!f.includes(s.family)) f.push(s.family); }); return f; }

const OPWORD = { in: "", any: "", all: "all of ", none: "not ", first: "typically " };
function condText(k, c) {
  return Object.entries(c).map(([op, vs]) => OPWORD[op] + vs.map(v => LBL[k][v]).join(" / ")).join(", ");
}
const SHORT = { mod: "Data", at: "Anomaly", unit: "Unit", ar: "Ratio", dim: "Dims", sup: "Labels", pt: "Time", ep: "Priority", out: "Output", oc: "Constraint", adv: "Adversary", dq: "Data" };
function sigTags(rule, compact) {
  const clause = rule[0];
  let html = Object.entries(clause).map(([k, c]) =>
    `<span class="tag" title="${esc(P[k].label)}">${esc(compact ? SHORT[k] : P[k].label)}: ${esc(condText(k, c))}</span>`).join("");
  if (rule.length > 1) html += `<span class="tag k">+${rule.length - 1} alternative</span>`;
  return html;
}

/* ---------- Views ---------- */
const VIEWS = ["scenarios", "apps", "datasets", "review", "contribute", "dist", "taxonomy", "builder"];
const SECONDARY = ["dist", "taxonomy", "builder"];
let current = null;
const rendered = {};
function setView(v, opts = {}) {
  if (!VIEWS.includes(v)) v = "scenarios";
  current = v;
  VIEWS.forEach(x => {
    $("#v-" + x).hidden = x !== v;
    $("#t-" + x).setAttribute("aria-selected", String(x === v));
  });
  const sec = SECONDARY.includes(v);
  $("#t-more").setAttribute("aria-selected", String(sec));
  $("#subnav").hidden = !sec;
  $("#t-more").setAttribute("aria-expanded", String(sec));
  if (!rendered[v] || opts.force) { if (!emptyView(v)) RENDER[v](); rendered[v] = true; }
  store("view", v);
  try { history.replaceState(null, "", "#" + v); } catch (e) { /* ignore */ }
  if (!opts.keepScroll) window.scrollTo(0, 0);
}

/* ---------- Only reviewed entries are public; views without any show a pointer to the Review tab ---------- */
const NEEDS = { scenarios: () => SC.length, apps: () => APPS.length, datasets: () => DS.length, dist: () => APPS.length || DS.length, taxonomy: () => APPS.length, builder: () => APPS.length };
const WHAT = { scenarios: "scenarios", apps: "applications", datasets: "datasets", dist: "applications or datasets", taxonomy: "applications", builder: "applications" };
function emptyView(v) {
  if (!NEEDS[v] || NEEDS[v]()) return false;
  $("#v-" + v).innerHTML = `<div class="lead"><h2>Nothing here yet</h2><p>Entries appear on this site once they have been reviewed. No ${WHAT[v]} have been reviewed so far.</p></div>
    <div class="ghbar"><button type="button" class="btn gh primary" data-view="review">Help review</button></div>`;
  return true;
}

/* ---------- Scenarios view ---------- */
const state = { fam: "All", q: "", pick: {} };
const FINDER = [["mf", "Data", () => FAMS_ORDER, v => v], ["pt", "Decision speed", () => P.pt.values.map(v => v[0]), v => LBL.pt[v]],
  ["sup", "Labels available", () => P.sup.values.map(v => v[0]), v => LBL.sup[v]], ["adv", "Adversary", () => P.adv.values.map(v => v[0]), v => LBL.adv[v]],
  ["out", "Must also deliver", () => P.out.values.map(v => v[0]), v => LBL.out[v]]];
const FAMS_ORDER = ["Tabular", "Time series & signals", "Sequences & logs", "Vision", "Text & code", "Graphs", "Spatio-temporal"];
function appHas(a, k, v) { return k === "mf" ? a.mod.some(m => MF[m] === v) : k === "sup" ? a.sup[0] === v : vals(a, k).includes(v); }
function scenScore(s) {
  const picks = Object.entries(state.pick).filter(([, v]) => v);
  const q = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (q.length) {
    const text = [s.id, s.name, s.summary, s.family, ...s.members.map(i => BYID[i].name)].join(" ").toLowerCase();
    if (!q.every(t => text.includes(t))) return null;
  }
  if (!picks.length) return { share: 1, n: s.members.length };
  const n = s.members.filter(i => picks.every(([k, v]) => appHas(BYID[i], k, v))).length;
  return n ? { share: n / s.members.length, n } : null;
}
function renderScenarios() {
  $("#finder").innerHTML = `<label class="search" for="sq"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="sq" type="search" placeholder="Search scenarios or applications, e.g. fraud, MRI, telemetry" autocomplete="off" value="${esc(state.q)}"></label>
    <div class="pickers">${FINDER.map(([k, l, vs, lab]) => `<label class="selwrap" for="sf-${k}"><span>${esc(l)}</span><select id="sf-${k}" class="btn" data-sf="${k}"><option value="">Any</option>${vs().map(v => `<option value="${esc(v)}"${state.pick[k] === v ? " selected" : ""}>${esc(lab(v))}</option>`).join("")}</select></label>`).join("")}
    <button type="button" class="btn" id="sf-clear">Clear</button></div>`;
  const fams = ["All", ...families()];
  $("#fam-filter").innerHTML = fams.map(f => `<button type="button" data-fam="${esc(f)}" aria-pressed="${f === state.fam}">${esc(f)}</button>`).join("");
  drawScenarioList();
}
function drawScenarioList() {
  const active = state.q || Object.values(state.pick).some(Boolean);
  const scored = SC.map(s => [s, scenScore(s)]).filter(([, r]) => r);
  $("#fam-filter").hidden = !!active;
  if (active) {
    scored.sort((a, b) => b[1].share - a[1].share || b[1].n - a[1].n);
    $("#scen-result").textContent = scored.length ? `${scored.length} of ${SC.length} scenarios contain matching applications, best fit first.` : "No scenario contains an application with all of these properties.";
    $("#scen-list").innerHTML = `<div class="grid">${scored.map(([s, r]) => cardHTML(s, Object.values(state.pick).some(Boolean) ? r : null)).join("")}</div>`;
    return;
  }
  $("#scen-result").textContent = "";
  const fams = families().filter(f => state.fam === "All" || f === state.fam);
  $("#scen-list").innerHTML = fams.map(f => {
    const list = SC.filter(s => s.family === f);
    return `<div class="fam"><h3>${esc(f)}</h3><span>${list.length}</span></div>
      <div class="grid">${list.map(s => cardHTML(s)).join("")}</div>`;
  }).join("");
}
function cardHTML(s, r) {
  return `<button type="button" class="card" data-open-scen="${s.id}">
    <span class="meta"><span class="mono">${s.id}</span>${r ? `<span class="fit">${Math.round(100 * r.share)}% of its applications match</span>` : ""}</span>
    <h4>${esc(s.name)}</h4>
    <p>${esc(s.summary)}</p>
    <span class="sig">${sigTags(s.rule, true)}</span>
    <span class="foot"><span><b>${s.members.length}</b> applications · <b>${s.ds.length}</b> datasets</span><span>${esc(domSummary(s.members, 3))}</span></span>
  </button>`;
}

/* ---------- Detail sheet ---------- */
let stack = [], opener = null;
function openDetail(type, id, push = true) {
  if (!stack.length) opener = document.activeElement;
  if (push) stack.push({ type, id }); else stack = [{ type, id }];
  drawSheet();
}
function closeSheet() {
  stack = [];
  $("#sheet-root").innerHTML = "";
  document.body.style.overflow = "";
  if (opener && document.contains(opener)) opener.focus();
}
function drawSheet() {
  const top = stack[stack.length - 1];
  const body = top.type === "scen" ? scenDetail(SCID[top.id]) : top.type === "app" ? appDetail(BYID[top.id]) : top.type === "ds" ? dsDetail(DSID[top.id]) : top.html;
  $("#sheet-root").innerHTML = `<div class="scrim" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Details">
      <div class="sheet-bar">
        ${stack.length > 1 ? `<button class="btn" type="button" data-back>Back</button>` : ""}
        <span class="sp"></span>
        <button class="btn" type="button" data-close id="sheet-close">Close</button>
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.style.overflow = "hidden";
  $("#sheet-close").focus();
}
function profileBars(members, keys) {
  const n = members.length;
  return keys.map(k => {
    const m = countBy(members, a => vals(a, k));
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `<div class="pbar"><h4>${esc(P[k].label)}</h4>${top.map(([v, c]) =>
      `<div class="r"><span>${esc(LBL[k][v])}</span><span class="bar"><i style="width:${Math.max(4, Math.round(56 * c / n))}px"></i>${pct(c, n)}%</span></div>`).join("")}</div>`;
  }).join("");
}
function scenDetail(s) {
  const members = s.members.map(i => BYID[i]);
  const clauses = s.rule.map(cl => `<div class="clause">${Object.entries(cl).map(([k, c]) =>
    `<span class="tag k">${esc(P[k].label)}</span>${Object.entries(c).map(([op, vs]) =>
      `${OPWORD[op] ? `<span class="hint">${esc(OPWORD[op].trim())}</span>` : ""}${vs.map(v => `<span class="chip" title="${esc(DESC[k][v])}">${esc(LBL[k][v])}</span>`).join("")}`).join("")}`).join("")}</div>`)
    .join(`<span class="or">or</span>`);
  const doms = countBy(members, a => [a.dom]);
  const byDom = DOM_ORDER.filter(d => doms.has(d)).map(d =>
    members.filter(a => a.dom === d).map(a => `<button type="button" data-open-app="${a.id}"><span>${esc(a.name)}</span><span class="d">${esc(DOM[a.dom])}</span></button>`).join("")).join("");
  const G = [["Metrics", s.metrics], ["Evaluation protocol", s.protocol], ["Preprocessing constraints", s.preprocessing],
    ["Algorithm families that fit", s.algorithms], ["Likely unsuitable", s.avoid], ["Open gaps", s.gaps]];
  return `<div class="card-meta meta" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;color:var(--muted);font-size:12.5px">
      <span class="mono">${s.id}</span><span>${esc(s.family)}</span>${reviewBadge(s)}</div>
    <div><h2>${esc(s.name)}</h2></div>
    <p class="sum">${esc(s.summary)}</p>
    ${ghBar("scen", s)}
    ${evidenceHTML(s)}
    <div class="sec"><h3>Structural signature</h3>${clauses}
      <p class="hint">${s.members.length} applications from ${s.domains.length} domains match this rule.</p></div>
    <div class="sec"><h3>Evaluation guidance</h3><div class="guid">${G.map(([h, t]) => `<div class="g"><h4>${h}</h4><p>${esc(t)}</p></div>`).join("")}</div></div>
    <div class="sec"><h3>What the member applications need</h3><div class="profile">${profileBars(members, ["mod", "at", "sup", "pt", "ep", "out", "oc", "adv"])}</div></div>
    <div class="sec"><h3>Domains</h3><div class="chips">${[...doms.entries()].sort((a, b) => b[1] - a[1]).map(([d, c]) => `<span class="chip">${esc(DOM[d])}<span class="n">${c}</span></span>`).join("")}</div></div>
    ${scenDatasets(s)}
    <div class="sec"><h3>Applications (${members.length})</h3><div class="mlist">${byDom}</div></div>`;
}
function similar(a, n) {
  return APPS.filter(b => b !== a).map(b => {
    let inter = 0; a._set.forEach(x => { if (b._set.has(x)) inter++; });
    return [b, inter / (a._set.size + b._set.size - inter)];
  }).sort((x, y) => y[1] - x[1]).slice(0, n);
}
function kvRows(a, keys) {
  return keys.map(k => `<dt>${esc(P[k].label)}</dt><dd>${vals(a, k).length ? vals(a, k).map(v => `<span class="chip" title="${esc(DESC[k][v])}">${esc(LBL[k][v])}</span>`).join("") : `<span class="hint">none noted</span>`}</dd>`).join("");
}
function appDetail(a) {
  const sims = similar(a, 6);
  return `<div class="meta" style="display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:12.5px"><span class="mono">${a.id}</span><span>${esc(DOM[a.dom])} · ${esc(a.sub)}</span>${reviewBadge(a)}</div>
    <div><h2>${esc(a.name)}</h2></div>
    <p class="sum">${esc(a.desc)}</p>
    ${ghBar("app", a)}
    ${refsHTML(a.refs)}
    <div class="sec"><h3>Structural properties from the paper's Table 1</h3><dl class="kv">${kvRows(a, TABLE1)}</dl></div>
    <div class="sec"><h3>Extended properties</h3><dl class="kv">${kvRows(a, EXT)}</dl></div>
    ${evidenceHTML(a)}
    <div class="sec"><h3>Scenarios (${a.scen.length})</h3>${a.scen.length ? `<div class="mlist">${a.scen.map(id => `<button type="button" data-open-scen="${id}"><span>${esc(SCID[id].name)}</span><span class="d mono">${id}</span></button>`).join("")}</div>` : `<p class="hint">Not covered by a curated scenario yet. Try the scenario builder.</p>`}</div>
    <div class="sec"><h3>Datasets (${a.ds.length})</h3>${a.ds.length ? `<div class="mlist">${a.ds.map(i => dsButton(DSID[i])).join("")}</div>` : `<p class="hint">No public dataset found for this application. A candidate for new data collection.</p>`}</div>
    <div class="sec"><h3>Structurally closest applications</h3><p class="hint">Jaccard similarity over all structural property values. Close neighbors from other domains are candidates for shared benchmarks.</p>
      <div class="mlist">${sims.map(([b, j]) => `<button type="button" data-open-app="${b.id}"><span>${esc(b.name)}</span><span class="d">${esc(DOM[b.dom])} · ${Math.round(100 * j)}%</span></button>`).join("")}</div></div>`;
}

/* ---------- Scenario builder ---------- */
const BY = [
  ["mf", "Modality family", a => a.mf],
  ["mod1", "Primary modality", a => LBL.mod[a.mod[0]]],
  ["at1", "Primary anomaly type", a => LBL.at[a.at[0]]],
  ["unit1", "Primary detection unit", a => LBL.unit[a.unit[0]]],
  ["ar", "Anomaly ratio", a => LBL.ar[a.ar]],
  ["dim", "Dimensionality", a => LBL.dim[a.dim]],
  ["sup1", "Typical supervision", a => LBL.sup[a.sup[0]]],
  ["pt", "Processing time", a => LBL.pt[a.pt]],
  ["ep1", "Primary evaluation priority", a => LBL.ep[a.ep[0]]],
  ["adv", "Adversary", a => LBL.adv[a.adv]]
];
const BYMAP = Object.fromEntries(BY.map(b => [b[0], b]));
const FLAGS = [...P.out.values.map(v => ["out", v[0], v[1]]), ...P.oc.values.map(v => ["oc", v[0], v[1]])];
const FLAGLBL = Object.fromEntries(FLAGS.map(f => [f[0] + ":" + f[1], f[2]]));
const BDEFAULT = { by: ["mf", "pt", "sup1", "adv"], flags: [], minApps: 5, minDom: 2, weak: false };
const B = Object.assign({}, BDEFAULT, load("builder", {}));
B.by = (B.by || []).filter(k => BYMAP[k]);
B.flags = (B.flags || []).filter(f => FLAGLBL[f]);

function renderBuilder() {
  $("#b-controls").innerHTML = `
    <div class="fgroup"><h5>Group by</h5><div class="chips">${BY.map(([k, l]) => `<button type="button" class="chip" data-by="${k}" aria-pressed="${B.by.includes(k)}">${l}</button>`).join("")}</div></div>
    <div class="fgroup"><h5>Split on a required output</h5><div class="chips">${FLAGS.filter(f => f[0] === "out").map(f => `<button type="button" class="chip" data-flag="out:${f[1]}" aria-pressed="${B.flags.includes("out:" + f[1])}">${esc(f[2])}</button>`).join("")}</div></div>
    <div class="fgroup"><h5>Split on an operational constraint</h5><div class="chips">${FLAGS.filter(f => f[0] === "oc").map(f => `<button type="button" class="chip" data-flag="oc:${f[1]}" aria-pressed="${B.flags.includes("oc:" + f[1])}">${esc(f[2])}</button>`).join("")}</div></div>
    <div class="range"><label for="b-min">Minimum applications per scenario <output id="b-min-o">${B.minApps}</output></label><input type="range" id="b-min" min="1" max="25" value="${B.minApps}"></div>
    <div class="range"><label for="b-dom">Minimum distinct domains <output id="b-dom-o">${B.minDom}</output></label><input type="range" id="b-dom" min="1" max="8" value="${B.minDom}"></div>
    <label class="hint" style="display:flex;gap:8px;align-items:center" for="b-weak"><input type="checkbox" id="b-weak" ${B.weak ? "checked" : ""}> Show groups below the guardrail</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="b-reset">Reset</button><button class="btn" type="button" id="b-paper">Use all of Table 1</button></div>
    <p class="hint">"Use all of Table 1" groups by every property in the paper's Table 1 at once. It shows why the paper does not propose evaluating all combinations: most groups become too small.</p>`;
  drawBuilderResults();
}
function groupApps() {
  const g = new Map();
  APPS.forEach(a => {
    const parts = B.by.map(k => BYMAP[k][2](a));
    const fl = B.flags.map(f => { const [k, v] = f.split(":"); return a[k].includes(v); });
    const key = parts.join("|") + "#" + fl.map(x => (x ? 1 : 0)).join("");
    if (!g.has(key)) g.set(key, { parts, fl, members: [] });
    g.get(key).members.push(a);
  });
  return [...g.values()].map(x => {
    x.doms = new Set(x.members.map(a => a.dom));
    x.pass = x.members.length >= B.minApps && x.doms.size >= B.minDom;
    return x;
  }).sort((a, b) => b.members.length - a.members.length || b.doms.size - a.doms.size);
}
function closestScenario(members) {
  const ids = members.map(a => a.id);
  let best = null, bj = 0;
  SC.forEach(s => {
    let inter = 0; ids.forEach(i => { if (s._m.has(i)) inter++; });
    const j = inter / (ids.length + s.members.length - inter);
    if (j > bj) { bj = j; best = s; }
  });
  return best ? { s: best, j: bj } : null;
}
function drawBuilderResults() {
  const groups = groupApps();
  const pass = groups.filter(g => g.pass), weak = groups.filter(g => !g.pass);
  const covered = pass.reduce((n, g) => n + g.members.length, 0);
  $("#b-summary").innerHTML = `<b>${pass.length}</b> candidate scenario${pass.length === 1 ? "" : "s"} pass the guardrails and cover <b>${covered}</b> of ${APPS.length} applications (${pct(covered, APPS.length)}%). <b>${weak.length}</b> smaller group${weak.length === 1 ? "" : "s"} fall below them${B.by.length + B.flags.length ? "" : ". Select properties to start grouping"}.`;
  const show = B.weak ? groups : pass;
  window.__groups = show;
  $("#b-results").innerHTML = show.length ? show.map((g, i) => {
    const sig = B.by.map((k, j) => `<span class="tag" title="${esc(BYMAP[k][1])}">${esc(g.parts[j])}</span>`).join("") +
      B.flags.map((f, j) => g.fl[j] ? `<span class="tag">${esc(FLAGLBL[f])}</span>` : `<span class="tag k">no ${esc(FLAGLBL[f].toLowerCase())}</span>`).join("");
    const c = closestScenario(g.members);
    const doms = [...countBy(g.members, a => [a.dom]).entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${DOM[d]} ${n}`).join(" · ");
    const dsn = new Set(); g.members.forEach(a => a.ds.forEach(i => { if (DSID[i].counted) dsn.add(i); }));
    return `<div class="cand ${g.pass ? "" : "weak"}">
      <div class="head"><span class="chips">${sig || `<span class="tag">All applications</span>`}</span><b>${g.members.length} apps · ${g.doms.size} domains · ${dsn.size} datasets</b></div>
      <span class="hint">${esc(doms)}</span>
      ${c ? `<span class="hint">Closest curated scenario: <button type="button" class="chip" data-open-scen="${c.s.id}">${c.s.id} ${esc(c.s.name)}</button> ${Math.round(100 * c.j)}% overlap</span>` : ""}
      ${proposeButton(g, i)}
      <details><summary>Applications</summary><ul>${g.members.map(a => `<li><button type="button" data-open-app="${a.id}">${esc(a.name)}</button> <span class="hint" style="display:inline">${a.dom}</span></li>`).join("")}</ul></details>
    </div>`;
  }).join("") : `<div class="empty">No group meets the guardrails. Lower the minimums or remove a property.</div>`;
  store("builder", B);
}

/* ---------- Applications view ---------- */
const FKEYS = ["dom", "pt", "sup", "adv", "mod", "at", "out", "oc", "ep", "unit", "ar", "dim", "dq"];
const F = { q: "", scen: "", sel: {} };
FKEYS.forEach(k => { F.sel[k] = new Set(); });
function fvals(a, k) { return k === "dom" ? [a.dom] : vals(a, k); }
function fLabel(k) { return k === "dom" ? "Domain" : P[k].label; }
function vLabel(k, v) { return k === "dom" ? DOM[v] : LBL[k][v]; }
function fValues(k) { return k === "dom" ? DOM_ORDER : P[k].values.map(v => v[0]); }
function appMatch(a, except) {
  if (F.q) { const toks = F.q.toLowerCase().split(/\s+/).filter(Boolean); if (!toks.every(t => a._q.includes(t))) return false; }
  if (F.scen === "none" && a.scen.length) return false;
  if (F.scen && F.scen !== "none" && !a.scen.includes(F.scen)) return false;
  for (const k of FKEYS) {
    if (k === except || !F.sel[k].size) continue;
    if (!fvals(a, k).some(v => F.sel[k].has(v))) return false;
  }
  return true;
}
function filtered() { return APPS.filter(a => appMatch(a)); }
function renderApps() { drawFilters(); drawAppList(); }
function drawFilters() {
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
  const opts = [`<option value="">Any scenario</option>`, ...SC.map(s => `<option value="${s.id}" ${F.scen === s.id ? "selected" : ""}>${s.id} ${esc(s.name)}</option>`), `<option value="none" ${F.scen === "none" ? "selected" : ""}>Not in any scenario</option>`];
  $("#filters").innerHTML = `<div class="fgroup"><h5><label for="f-scen">Scenario</label></h5><select id="f-scen" class="btn" style="width:100%">${opts.join("")}</select></div>` +
    FKEYS.map(k => {
      const base = APPS.filter(a => appMatch(a, k));
      const cnt = countBy(base, a => fvals(a, k));
      const sel = F.sel[k];
      return `<div class="fgroup"><h5><span>${esc(fLabel(k))}</span>${sel.size ? `<button type="button" class="chip" data-clear="${k}" style="padding:0 8px;font-size:11px">clear</button>` : ""}</h5><div class="chips">${fValues(k).map(v =>
        `<button type="button" class="chip" data-f="${k}:${v}" aria-pressed="${sel.has(v)}" ${!cnt.get(v) && !sel.has(v) ? `style="opacity:.45"` : ""}>${esc(vLabel(k, v))}<span class="n">${cnt.get(v) || 0}</span></button>`).join("")}</div></div>`;
    }).join("");
  if (focusKey) { const el = document.querySelector(`[data-f="${CSS.escape(focusKey)}"]`); if (el) el.focus(); }
}
function drawAppList() {
  const list = filtered();
  const act = [];
  if (F.scen) act.push(`<button type="button" class="chip" data-rm="scen">Scenario: ${F.scen === "none" ? "none" : F.scen} ×</button>`);
  FKEYS.forEach(k => F.sel[k].forEach(v => act.push(`<button type="button" class="chip" data-rm="${k}:${v}">${esc(fLabel(k))}: ${esc(vLabel(k, v))} ×</button>`)));
  if (act.length) act.push(`<button type="button" class="chip" id="clear-all">Clear all</button>`);
  $("#active").innerHTML = act.join("");
  $("#result-line").textContent = `${list.length} of ${APPS.length} applications`;
  $("#app-list").innerHTML = list.length ? list.map(a => {
    const tags = [...a.mod.slice(0, 2).map(v => LBL.mod[v]), LBL.pt[a.pt], LBL.sup[a.sup[0]], ...(a.adv !== "no" ? [LBL.adv[a.adv]] : [])];
    const outs = a.out.slice(0, 3).map(v => LBL.out[v]);
    return `<button type="button" class="row" data-open-app="${a.id}">
      <span class="t"><strong>${esc(a.name)}</strong><span>${esc(DOM[a.dom])} · ${esc(a.sub)} · <span class="mono">${a.id}</span></span></span>
      <p>${esc(a.desc)}</p>
      <span class="tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}${outs.map(t => `<span class="tag k">${esc(t)}</span>`).join("")}</span>
    </button>`;
  }).join("") : `<div class="empty">No application matches these filters.</div>`;
}
function csvOf(list) {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["id", "domain", "subdomain", "application", "description", ...PROPS.map(p => p.label), "scenarios", "datasets", "cited in arXiv 2507.15584"];
  const rows = list.map(a => [a.id, DOM[a.dom], a.sub, a.name, a.desc, ...PROPS.map(p => vals(a, p.key).map(v => LBL[p.key][v]).join("; ")), a.scen.join("; "), a.ds.map(i => DSID[i].name).join("; "), refText(a.refs)]);
  return [head, ...rows].map(r => r.map(q).join(",")).join("\n");
}
function jsonOf(list) {
  return JSON.stringify(list.map(a => { const o = { id: a.id, domain: DOM[a.dom], subdomain: a.sub, name: a.name, description: a.desc }; PROPS.forEach(p => { o[p.key] = a[p.key]; }); o.scenarios = a.scen; o.datasets = a.ds.map(i => DSID[i].name); o.paperRefs = a.refs; return o; }), null, 1);
}
function copyText(text, label, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = t; }, 1600); };
  const fallback = () => {
    stack = [{ type: "html", html: `<div><h2>${esc(label)}</h2></div><p class="sum">Copying is blocked here. The text is selected below; copy it with your device's copy command.</p><textarea class="copybox" id="copybox" readonly>${esc(text)}</textarea>` }];
    drawSheet(); const ta = $("#copybox"); ta.focus(); ta.select();
  };
  try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
}

/* ---------- Taxonomy & matrix ---------- */
const HP = [["out", "Required outputs"], ["oc", "Operational constraints"], ["mod", "Data modality"], ["at", "Anomaly type"], ["pt", "Processing time"], ["sup", "Supervision"], ["ep", "Evaluation priority"], ["adv", "Adversary"], ["unit", "Detection unit"], ["dq", "Data characteristics"]];
let hp = load("hp", "out"); if (!P[hp]) hp = "out";
let cell = null;
function level(s) { return s === 0 ? 0 : Math.min(6, Math.ceil(s * 6)); }
function renderTaxonomy() {
  $("#heat-prop").innerHTML = HP.map(([k, l]) => `<button type="button" data-hp="${k}" aria-pressed="${k === hp}">${l}</button>`).join("");
  drawHeat();
  $("#heat-legend").innerHTML = `<span>0%</span><span class="ramp">${[0, 1, 2, 3, 4, 5, 6].map(i => `<i style="background:var(--h${i})"></i>`).join("")}</span><span>100% of the domain's applications</span>`;
  const counts = {};
  PROPS.forEach(p => { counts[p.key] = countBy(APPS, a => vals(a, p.key)); });
  $("#props").innerHTML = PROPS.map(p => {
    const max = Math.max(...p.values.map(v => counts[p.key].get(v[0]) || 0), 1);
    return `<div class="prop"><div class="ph"><h4>${esc(p.label)}</h4>${TABLE1.includes(p.key) ? `<span class="prov paper">Table 1: ${esc(p.paper)}</span>` : `<span class="prov">Extension</span>`}<span class="hint">${p.multi ? "several values per application" : "one value per application"}</span></div>
      <p>${esc(p.desc)}</p>
      <div class="vals">${p.values.map(([c, l, d]) => { const n = counts[p.key].get(c) || 0; return `<div class="val"><span class="vn">${esc(l)}<span class="mono">${c}</span></span><span class="vd">${esc(d)}</span><span class="bar"><i style="width:${Math.round(64 * n / max)}px"></i>${n}</span></div>`; }).join("")}</div></div>`;
  }).join("") + dsPropsHTML();
}
function drawHeat() {
  const values = P[hp].values;
  const rows = [...DOM_ORDER.map(d => [d, DOM[d], APPS.filter(a => a.dom === d)]), ["ALL", "All domains", APPS]];
  $("#heat").innerHTML = `<thead><tr><th scope="col">Domain</th>${values.map(v => `<th scope="col" title="${esc(v[2])}"><div>${esc(v[1])}</div></th>`).join("")}<th scope="col" class="tot"><div>apps</div></th></tr></thead>
    <tbody>${rows.map(([d, name, list]) => `<tr><th scope="row">${esc(name)}</th>${values.map(([c, l]) => {
      const n = list.filter(a => vals(a, hp).includes(c)).length, s = list.length ? n / list.length : 0;
      const label = `${name}: ${l}, ${n} of ${list.length} (${pct(n, list.length)}%)`;
      const on = cell && cell.d === d && cell.v === c;
      return `<td style="background:var(--h${level(s)})"><button type="button" data-cell="${d}|${c}" aria-pressed="${!!on}" aria-label="${esc(label)}" data-tip="${esc(label)}"></button></td>`;
    }).join("")}<td class="tot">${list.length}</td></tr>`).join("")}</tbody>`;
  drawCellInfo();
}
function drawCellInfo() {
  if (!cell || !LBL[hp][cell.v]) { $("#cellinfo").innerHTML = `<span class="hint">Select a cell to see its applications.</span>`; return; }
  const list = APPS.filter(a => (cell.d === "ALL" || a.dom === cell.d) && vals(a, hp).includes(cell.v));
  const name = cell.d === "ALL" ? "All domains" : DOM[cell.d];
  $("#cellinfo").innerHTML = `<span><strong>${esc(name)}</strong> · ${esc(P[hp].label)}: ${esc(LBL[hp][cell.v])}, ${list.length} application${list.length === 1 ? "" : "s"}</span>${list.length ? `<button type="button" class="btn primary" data-show-cell>Show in catalog</button>` : ""}`;
}

/* ---------- Events ---------- */
const RENDER = { scenarios: renderScenarios, builder: renderBuilder, apps: renderApps, datasets: renderDatasets, dist: renderPies, taxonomy: renderTaxonomy, contribute: renderContribute, review: renderReview };
document.addEventListener("click", e => {
  const t = e.target.closest("button, [data-close]");
  if (!t) return;
  const ds = t.dataset;
  if (ds.view) return setView(ds.view);
  if (t.id === "sf-clear") { state.q = ""; state.pick = {}; return renderScenarios(); }
  if (t.id === "t-more") { const open = t.getAttribute("aria-expanded") !== "true"; t.setAttribute("aria-expanded", String(open)); $("#subnav").hidden = !open && !SECONDARY.includes(current); return; }
  if (ds.fam) { state.fam = ds.fam; document.querySelectorAll("#fam-filter button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.fam === state.fam))); return drawScenarioList(); }
  if (ds.openScen) return openDetail("scen", ds.openScen, stack.length > 0);
  if (ds.openApp) return openDetail("app", ds.openApp, stack.length > 0);
  if ("close" in ds) return closeSheet();
  if ("back" in ds) { stack.pop(); return drawSheet(); }
  if (ds.by) { const i = B.by.indexOf(ds.by); if (i >= 0) B.by.splice(i, 1); else B.by.push(ds.by); t.setAttribute("aria-pressed", String(i < 0)); return drawBuilderResults(); }
  if (ds.flag) { const i = B.flags.indexOf(ds.flag); if (i >= 0) B.flags.splice(i, 1); else B.flags.push(ds.flag); t.setAttribute("aria-pressed", String(i < 0)); return drawBuilderResults(); }
  if (t.id === "b-reset") { Object.assign(B, JSON.parse(JSON.stringify(BDEFAULT))); return renderBuilder(); }
  if (t.id === "b-paper") { B.by = ["at1", "ar", "mod1", "dim", "sup1", "pt", "ep1"]; B.flags = ["oc:rob", "oc:fair", "oc:div"]; return renderBuilder(); }
  if (ds.f) { const [k, v] = ds.f.split(":"); F.sel[k].has(v) ? F.sel[k].delete(v) : F.sel[k].add(v); return renderApps(); }
  if (ds.clear) { F.sel[ds.clear].clear(); return renderApps(); }
  if (ds.rm) { if (ds.rm === "scen") F.scen = ""; else { const [k, v] = ds.rm.split(":"); F.sel[k].delete(v); } return renderApps(); }
  if (t.id === "clear-all") { F.scen = ""; F.q = ""; $("#q").value = ""; FKEYS.forEach(k => F.sel[k].clear()); return renderApps(); }
  if (t.id === "filters-open") { $("#rail").classList.add("open"); return; }
  if (t.id === "rail-close") { $("#rail").classList.remove("open"); return; }
  if (t.id === "copy-csv") return copyText(csvOf(filtered()), "CSV of the filtered applications", t);
  if (t.id === "copy-json") return copyText(jsonOf(filtered()), "JSON of the filtered applications", t);
  if (ds.hp) { hp = ds.hp; store("hp", hp); cell = null; document.querySelectorAll("#heat-prop button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.hp === hp))); return drawHeat(); }
  if (ds.cell) { const [d, v] = ds.cell.split("|"); cell = { d, v }; document.querySelectorAll("[data-cell]").forEach(b => b.setAttribute("aria-pressed", String(b === t))); return drawCellInfo(); }
  if ("showCell" in ds && cell) {
    F.scen = ""; F.q = ""; $("#q").value = ""; FKEYS.forEach(k => F.sel[k].clear());
    if (cell.d !== "ALL") F.sel.dom.add(cell.d);
    F.sel[hp].add(cell.v);
    setView("apps", { force: true });
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "q") { F.q = t.value.trim(); drawAppList(); drawFiltersSoon(); }
  if (t.id === "sq") { state.q = t.value.trim(); drawScenarioList(); }
  if (t.id === "b-min") { B.minApps = +t.value; $("#b-min-o").textContent = t.value; drawBuilderResults(); }
  if (t.id === "b-dom") { B.minDom = +t.value; $("#b-dom-o").textContent = t.value; drawBuilderResults(); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "f-scen") { F.scen = t.value; renderApps(); }
  if (t.dataset && t.dataset.sf) { state.pick[t.dataset.sf] = t.value; drawScenarioList(); }
  if (t.id === "b-weak") { B.weak = t.checked; drawBuilderResults(); }
});
let ftimer = null;
function drawFiltersSoon() { clearTimeout(ftimer); ftimer = setTimeout(drawFilters, 180); }
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (stack.length) closeSheet(); else $("#rail").classList.remove("open");
});
const tip = $("#tip");
document.addEventListener("pointerover", e => {
  const t = e.target.closest("[data-tip]");
  if (!t || e.pointerType !== "mouse") return;
  tip.textContent = t.dataset.tip; tip.hidden = false;
});
document.addEventListener("pointermove", e => {
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = e.clientY + 16;
  tip.style.left = x + "px"; tip.style.top = (y + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 10 : y) + "px";
});
document.addEventListener("pointerout", e => { if (e.target.closest("[data-tip]")) tip.hidden = true; });


/* ---------- Datasets: shared helpers ---------- */
const DSP = Object.fromEntries(TAX.dsprops.map(p => [p.key, p]));
const DL = {}, DD = {};
TAX.dsprops.forEach(p => { DL[p.key] = {}; DD[p.key] = {}; p.values.forEach(([c, l, d]) => { DL[p.key][c] = l; DD[p.key][c] = d; }); });
const TIERS = ["suite", "bench", "app", "generic"];
const TIER_PLURAL = { suite: "Benchmark suites", bench: "Benchmark datasets", app: "Application data", generic: "Generic collections" };
DS.forEach(d => {
  d._q = [d.id, d.name, d.desc, d.size, d.year, ...d.apps.map(i => BYID[i].name)].join(" ").toLowerCase();
  d.lnk = [];
  if (d.url) d.lnk.push("page");
  if (d.src.length) d.lnk.push("paper");
  if (d.chk || d.src.length) d.lnk.push("found");
  if (d.refs.length) d.lnk.push("cited");
  if (!d.url && !d.src.length) d.lnk.push("none");
});
function tierDot(t) { return `<i class="tdot t-${t}" aria-hidden="true"></i>`; }
function dsMeta(d) {
  return [DL.tier[d.tier], d.year, d.lab !== "full" ? DL.lab[d.lab].toLowerCase() : ""].filter(Boolean).join(" · ");
}
function dsButton(d) {
  return `<button type="button" data-open-ds="${d.id}"><span class="nm">${tierDot(d.tier)}${esc(d.name)}</span><span class="d">${esc(dsMeta(d))}</span></button>`;
}
function scholarUrl(d) {
  return "https://scholar.google.com/scholar?q=" + encodeURIComponent(`"${d.name.replace(/\s*\(.*?\)\s*/g, " ").trim()}" dataset`);
}
function scholarQ(text) {
  const m = /\)\.\s+(.+?)\.(\s|$)/.exec(text);
  return "https://scholar.google.com/scholar?q=" + encodeURIComponent(m ? m[1] : text);
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
function linkRow(label, u, status) {
  const st = status === "found" ? `<span class="ls ok">found in search</span>` : status === "unchecked" ? `<span class="ls">not checked</span>` : "";
  return `<a class="lk" href="${esc(u)}" target="_blank" rel="noopener"><span class="lt">${esc(label)}</span><span class="lh">${esc(hostOf(u))}</span>${st}</a>`;
}
function linksHTML(d) {
  const rows = [];
  if (d.url) rows.push(linkRow(/arxiv\.org/.test(d.url) ? "Paper (arXiv)" : "Dataset page", d.url, d.chk ? "found" : "unchecked"));
  d.src.forEach(([l, u]) => rows.push(linkRow(l, u, "found")));
  rows.push(linkRow("Search Google Scholar", scholarUrl(d), ""));
  const note = !d.url && !d.src.length ? "No direct link was collected for this dataset. The Scholar search usually finds its paper."
    : d.url && !d.chk ? "Links marked found in search appeared in search results while the catalog was built. The dataset page address comes from Claude's knowledge and was not checked individually."
    : "Links marked found in search appeared in search results while the catalog was built.";
  return `<div class="sec"><h3>Links</h3><div class="links">${rows.join("")}</div><p class="hint">${note}</p></div>`;
}
function refsHTML(refs) {
  if (!refs || !refs.length) return "";
  return `<div class="sec"><h3>In the paper (arXiv 2507.15584)</h3><div class="refs">${refs.map(r => `<div class="ref"><span class="rn mono">[${esc(r.n)}]</span><div class="rb"><p>${esc(r.t)}</p>${r.c ? `<p class="hint">${esc(r.c)}</p>` : ""}<a class="rl" href="${esc(r.u || scholarQ(r.t))}" target="_blank" rel="noopener">${r.u ? `Open on ${esc(hostOf(r.u))}` : "Search Google Scholar"}</a></div></div>`).join("")}</div></div>`;
}
function refText(refs) { return (refs || []).map(r => `[${r.n}] ${r.t}` + (r.u ? ` ${r.u}` : "")).join(" | "); }
function dsLinkTag(d) {
  const n = (d.url ? 1 : 0) + d.src.length;
  return n ? `<span class="tag k">${n} link${n === 1 ? "" : "s"}</span>` : `<span class="tag k">no direct link</span>`;
}
function needsText(s) {
  const parts = s.needs.map(cl => cl.map(alts => alts.map(c => c === "@multimod" ? "two or more modalities" : DL.ann[c].toLowerCase()).join(" or ")).join(", and ")).filter(Boolean);
  return [...new Set(parts)].join("; or ");
}
function scenTierCounts(s) {
  const c = { suite: 0, bench: 0, app: 0, generic: s.dsGeneric.length };
  s.ds.forEach(i => { c[DSID[i].tier]++; });
  return c;
}

/* ---------- Datasets inside the scenario sheet ---------- */
function scenDatasets(s) {
  const need = needsText(s);
  const groups = ["suite", "bench", "app"].map(t => {
    const l = s.ds.map(i => DSID[i]).filter(d => d.tier === t);
    return l.length ? `<div class="dsgroup"><h4>${tierDot(t)}${TIER_PLURAL[t]} <span class="n">${l.length}</span></h4><div class="mlist">${l.map(dsButton).join("")}</div></div>` : "";
  }).join("");
  const extra = (title, ids, note) => ids.length ? `<details class="more"><summary>${title} (${ids.length})</summary><p class="hint">${note}</p><div class="mlist">${ids.map(i => dsButton(DSID[i])).join("")}</div></details>` : "";
  const covered = s.appsWithData.length;
  return `<div class="sec"><h3>Datasets that qualify (${s.ds.length})</h3>
    <p class="hint">A dataset counts when it comes from a member application, has labels, matches the scenario's modality${need ? ` and provides ${esc(need)}` : ""}. ${covered} of ${s.members.length} member applications have at least one.</p>
    ${s.ds.length ? groups : `<p class="hint">No qualifying dataset yet.</p>`}
    ${extra("Generic collections with relevant parts", s.dsGeneric, "Aggregated benchmarks whose subsets fit this scenario. Not counted.")}
    ${extra("Unlabeled data you could annotate", s.dsUnlabeled, "Real data from member applications without anomaly labels. Not counted.")}
    ${extra("From member applications but missing required annotations", s.dsLacking, need ? `These datasets lack ${esc(need)}, or their modality does not fit, so they cannot evaluate what this scenario asks for.` : "Their modality does not fit this scenario's rule.")}
  </div>`;
}

/* ---------- Dataset sheet ---------- */
function dsDetail(d) {
  const chips = (k, list) => list.length ? list.map(v => `<span class="chip" title="${esc(DD[k][v])}">${esc(DL[k][v])}</span>`).join("") : `<span class="hint">binary labels only</span>`;
  const mods = d.mod.map(v => `<span class="chip" title="${esc(DESC.mod[v])}">${esc(LBL.mod[v])}</span>`).join("");
  const doms = d.dom.length ? d.dom.map(x => `<span class="chip">${esc(DOM[x])}</span>`).join("") : `<span class="hint">many unrelated applications</span>`;
  const note = d.tier === "generic" ? "Assigned by hand: parts of this collection fit these scenarios. Generic collections do not count toward scenario minimums."
    : d.lab === "none" ? "Unlabeled, so it does not count toward scenario minimums."
    : "Derived from the linked applications, the dataset's modality and its annotations.";
  return `<div class="meta" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;color:var(--muted);font-size:12.5px">
      <span class="mono">${d.id}</span><span class="tierlbl">${tierDot(d.tier)}${esc(DL.tier[d.tier])}</span>${d.year ? `<span>${d.year}</span>` : ""}${reviewBadge(d)}</div>
    <div><h2>${esc(d.name)}</h2></div>
    <p class="sum">${esc(d.desc)}</p>
    ${ghBar("ds", d)}
    ${linksHTML(d)}
    ${refsHTML(d.refs)}
    ${evidenceHTML(d)}
    <div class="sec"><h3>Properties</h3><dl class="kv">
      <dt>${esc(DSP.tier.label)}</dt><dd><span class="chip" title="${esc(DD.tier[d.tier])}">${esc(DL.tier[d.tier])}</span></dd>
      <dt>${esc(DSP.lab.label)}</dt><dd><span class="chip" title="${esc(DD.lab[d.lab])}">${esc(DL.lab[d.lab])}</span></dd>
      <dt>${esc(DSP.real.label)}</dt><dd><span class="chip" title="${esc(DD.real[d.real])}">${esc(DL.real[d.real])}</span></dd>
      <dt>Annotations</dt><dd>${chips("ann", d.ann)}</dd>
      <dt>Data modality</dt><dd>${mods}</dd>
      <dt>Size</dt><dd>${esc(d.size || "not stated")}</dd>
      <dt>Domains</dt><dd>${doms}</dd>
    </dl></div>
    <div class="sec"><h3>Scenarios (${d.scen.length})</h3><p class="hint">${note}</p>${d.scen.length ? `<div class="mlist">${d.scen.map(id => `<button type="button" data-open-scen="${id}"><span>${esc(SCID[id].name)}</span><span class="d mono">${id}</span></button>`).join("")}</div>` : `<p class="hint">No scenario: the dataset's modality or annotations do not match what its applications' scenarios require.</p>`}</div>
    ${d.apps.length ? `<div class="sec"><h3>Applications (${d.apps.length})</h3><div class="mlist">${d.apps.map(i => `<button type="button" data-open-app="${i}"><span>${esc(BYID[i].name)}</span><span class="d">${esc(DOM[BYID[i].dom])}</span></button>`).join("")}</div></div>` : ""}`;
}

/* ---------- Datasets view ---------- */
const DSTATE = { sort: load("dsSort", "id"), view: load("dsView", "chart") };
const FD = { q: "", scen: "", sel: {} };
const LNK = { page: "Dataset page", paper: "Paper or other source", found: "Link found in search", cited: "Cited in the paper", none: "Scholar search only" };
const FDKEYS = ["tier", "lnk", "lab", "real", "ann", "mod", "dom"];
FDKEYS.forEach(k => { FD.sel[k] = new Set(); });
function dvals(d, k) { return ["tier", "lab", "real"].includes(k) ? [d[k]] : d[k]; }
function dLabel(k) { return k === "lnk" ? "Links" : k === "dom" ? "Domain" : k === "mod" ? "Data modality" : k === "ann" ? "Annotations" : DSP[k].label; }
function dvLabel(k, v) { return k === "lnk" ? LNK[v] : k === "dom" ? DOM[v] : k === "mod" ? LBL.mod[v] : DL[k][v]; }
function dValues(k) { return k === "lnk" ? Object.keys(LNK) : k === "dom" ? DOM_ORDER : k === "mod" ? P.mod.values.map(v => v[0]) : DSP[k].values.map(v => v[0]); }
function dsMatch(d, except) {
  if (FD.q) { const toks = FD.q.toLowerCase().split(/\s+/).filter(Boolean); if (!toks.every(t => d._q.includes(t))) return false; }
  if (FD.scen === "none" && d.scen.length) return false;
  if (FD.scen && FD.scen !== "none" && !d.scen.includes(FD.scen)) return false;
  for (const k of FDKEYS) {
    if (k === except || !FD.sel[k].size) continue;
    if (!dvals(d, k).some(v => FD.sel[k].has(v))) return false;
  }
  return true;
}
function dsFiltered() { return DS.filter(d => dsMatch(d)); }

function renderDatasets() {
  const t = countBy(DS, d => [d.tier]), l = countBy(DS, d => [d.lab]);
  const counted = DS.filter(d => d.counted).length;
  const per = SC.map(s => s.ds.length).sort((a, b) => a - b);
  const med = per[Math.floor(per.length / 2)];
  const minS = SC.reduce((m, s) => (s.ds.length < m.ds.length ? s : m), SC[0]);
  const appsWith = APPS.filter(a => a.ds.some(i => DSID[i].counted)).length;
  $("#ds-facts").innerHTML = [
    [t.get("suite") || 0, "benchmark suites"], [t.get("bench") || 0, "benchmark datasets"], [t.get("app") || 0, "application datasets"],
    [t.get("generic") || 0, "generic collections"], [l.get("none") || 0, "unlabeled"]
  ].map(([n, x]) => `<span><b>${n}</b>${esc(x)}</span>`).join("");
  $("#ds-legend").innerHTML = ["suite", "bench", "app", "generic"].map(k =>
    `<span class="lg"><i class="sw t-${k}"></i>${k === "generic" ? "Generic collection (not counted)" : esc(DL.tier[k])}</span>`).join("") +
    `<span class="lg"><i class="sw-line"></i>Minimum of 3</span>`;
  drawCharts();
  drawDsFilters();
  drawDsList();
}
function niceMax(v) { const step = v > 60 ? 20 : v > 30 ? 10 : 5; return Math.ceil((v + 1) / step) * step; }
function barRows(rows, labelFn, tipName, minLine) {
  const max = niceMax(Math.max(...rows.map(r => r.c.suite + r.c.bench + r.c.app + r.c.generic), 3));
  const step = max > 60 ? 20 : max > 30 ? 10 : 5;
  const ticks = []; for (let v = 0; v <= max; v += step) ticks.push(v);
  const grid = ticks.map(v => `<i class="gl" style="left:${100 * v / max}%"></i>`).join("") + (minLine ? `<i class="minl" style="left:${100 * 3 / max}%"></i>` : "");
  const body = rows.map(r => {
    const segs = TIERS.filter(k => r.c[k]).map(k => `<span class="dseg t-${k}" style="width:${100 * r.c[k] / max}%" data-tip="${esc(tipName(r))} · ${k === "generic" ? "Generic collections (not counted)" : esc(TIER_PLURAL[k])}: ${r.c[k]}"></span>`).join("");
    const n = r.c.suite + r.c.bench + r.c.app;
    return `<div class="drow">${labelFn(r)}<div class="dtrack">${grid}<div class="dbar">${segs}</div></div><span class="dval"><b>${n}</b>${r.c.generic ? `<span class="g">+${r.c.generic}</span>` : ""}</span></div>`;
  }).join("");
  const axis = `<div class="drow axis"><span></span><div class="dtrack ticks">${ticks.map(v => `<span style="left:${100 * v / max}%">${v}</span>`).join("")}</div><span></span></div>`;
  return body + axis;
}
function drawCharts() {
  document.querySelectorAll("[data-dsort]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dsort === DSTATE.sort)));
  document.querySelectorAll("[data-dview]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dview === DSTATE.view)));
  let rows = SC.map(s => ({ s, c: scenTierCounts(s) }));
  const tot = r => r.c.suite + r.c.bench + r.c.app;
  if (DSTATE.sort === "most") rows.sort((a, b) => tot(b) - tot(a) || b.c.generic - a.c.generic);
  if (DSTATE.sort === "fewest") rows.sort((a, b) => tot(a) - tot(b) || a.c.generic - b.c.generic);
  const mrows = P.mod.values.map(([m]) => {
    const list = DS.filter(d => d.mod.includes(m) && d.lab !== "none");
    const c = { suite: 0, bench: 0, app: 0, generic: 0 };
    list.forEach(d => { c[d.tier]++; });
    return { m, c };
  }).filter(r => r.c.suite + r.c.bench + r.c.app + r.c.generic).sort((a, b) => (b.c.suite + b.c.bench + b.c.app) - (a.c.suite + a.c.bench + a.c.app));
  if (DSTATE.view === "table") {
    $("#ds-chart").innerHTML = `<div class="tbl-wrap"><table class="dtable"><thead><tr><th scope="col">Scenario</th><th scope="col">Suites</th><th scope="col">Benchmark datasets</th><th scope="col">Application data</th><th scope="col">Qualifying</th><th scope="col">Generic</th><th scope="col">Unlabeled</th><th scope="col">Applications with data</th></tr></thead><tbody>${rows.map(r =>
      `<tr><th scope="row"><button type="button" class="linkish" data-open-scen="${r.s.id}"><span class="mono">${r.s.id}</span> ${esc(r.s.name)}</button></th><td>${r.c.suite}</td><td>${r.c.bench}</td><td>${r.c.app}</td><td><b>${tot(r)}</b></td><td>${r.c.generic}</td><td>${r.s.dsUnlabeled.length}</td><td>${r.s.appsWithData.length}/${r.s.members.length}</td></tr>`).join("")}</tbody></table></div>`;
    $("#ds-mod-chart").innerHTML = `<div class="tbl-wrap"><table class="dtable"><thead><tr><th scope="col">Modality</th><th scope="col">Suites</th><th scope="col">Benchmark datasets</th><th scope="col">Application data</th><th scope="col">Generic</th></tr></thead><tbody>${mrows.map(r =>
      `<tr><th scope="row">${esc(LBL.mod[r.m])}</th><td>${r.c.suite}</td><td>${r.c.bench}</td><td>${r.c.app}</td><td>${r.c.generic}</td></tr>`).join("")}</tbody></table></div>`;
    return;
  }
  $("#ds-chart").innerHTML = barRows(rows,
    r => `<button type="button" class="dlabel" data-open-scen="${r.s.id}" title="${esc(r.s.name)}"><span class="mono">${r.s.id}</span><span class="nm">${esc(r.s.name)}</span></button>`,
    r => r.s.id, true);
  $("#ds-mod-chart").innerHTML = barRows(mrows,
    r => `<button type="button" class="dlabel" data-dmod="${r.m}" title="Show ${esc(LBL.mod[r.m])} datasets"><span class="nm">${esc(LBL.mod[r.m])}</span></button>`,
    r => LBL.mod[r.m], false);
}
function drawDsFilters() {
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.df : null;
  const opts = [`<option value="">Any scenario</option>`, ...SC.map(s => `<option value="${s.id}" ${FD.scen === s.id ? "selected" : ""}>${s.id} ${esc(s.name)}</option>`), `<option value="none" ${FD.scen === "none" ? "selected" : ""}>Not in any scenario</option>`];
  $("#d-filters").innerHTML = `<div class="fgroup"><h5><label for="df-scen">Scenario</label></h5><select id="df-scen" class="btn" style="width:100%">${opts.join("")}</select></div>` +
    FDKEYS.map(k => {
      const base = DS.filter(d => dsMatch(d, k));
      const cnt = countBy(base, d => dvals(d, k));
      const sel = FD.sel[k];
      const valsK = dValues(k).filter(v => cnt.get(v) || sel.has(v));
      return `<div class="fgroup"><h5><span>${esc(dLabel(k))}</span>${sel.size ? `<button type="button" class="chip" data-dclear="${k}" style="padding:0 8px;font-size:11px">clear</button>` : ""}</h5><div class="chips">${valsK.map(v =>
        `<button type="button" class="chip" data-df="${k}:${v}" aria-pressed="${sel.has(v)}">${k === "tier" ? tierDot(v) : ""}${esc(dvLabel(k, v))}<span class="n">${cnt.get(v) || 0}</span></button>`).join("")}</div>${k === "tier" ? `<dl class="defs">${DSP.tier.values.map(([c, l, d]) => `<dt>${tierDot(c)}${esc(l)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>` : ""}</div>`;
    }).join("");
  if (focusKey) { const el = document.querySelector(`[data-df="${CSS.escape(focusKey)}"]`); if (el) el.focus(); }
}
function drawDsList() {
  const list = dsFiltered();
  const act = [];
  if (FD.scen) act.push(`<button type="button" class="chip" data-drm="scen">Scenario: ${FD.scen === "none" ? "none" : FD.scen} ×</button>`);
  FDKEYS.forEach(k => FD.sel[k].forEach(v => act.push(`<button type="button" class="chip" data-drm="${k}:${v}">${esc(dLabel(k))}: ${esc(dvLabel(k, v))} ×</button>`)));
  if (act.length) act.push(`<button type="button" class="chip" id="d-clear-all">Clear all</button>`);
  $("#d-active").innerHTML = act.join("");
  $("#d-result-line").textContent = `${list.length} of ${DS.length} datasets`;
  $("#ds-list").innerHTML = list.length ? list.map(d => `<button type="button" class="row" data-open-ds="${d.id}">
      <span class="t"><strong>${tierDot(d.tier)}${esc(d.name)}</strong><span>${esc(dsMeta(d))} · <span class="mono">${d.id}</span></span></span>
      <p>${esc(d.desc)}</p>
      <span class="tags">${d.mod.map(v => `<span class="tag">${esc(LBL.mod[v])}</span>`).join("")}${d.size ? `<span class="tag k">${esc(d.size.length > 60 ? d.size.slice(0, 58) + "…" : d.size)}</span>` : ""}${d.ann.map(v => `<span class="tag k">${esc(DL.ann[v])}</span>`).join("")}${dsLinkTag(d)}<span class="tag k">${d.scen.length} scenario${d.scen.length === 1 ? "" : "s"}</span></span>
    </button>`).join("") : `<div class="empty">No dataset matches these filters.</div>`;
}
function dsCsv(list) {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["id", "dataset", "year", "readiness tier", "labels", "anomaly origin", "annotations", "modality", "size", "description", "dataset page", "dataset page found in search", "paper and source links", "cited in arXiv 2507.15584", "domains", "applications", "scenarios", "counts toward scenario minimum"];
  const rows = list.map(d => [d.id, d.name, d.year, DL.tier[d.tier], DL.lab[d.lab], DL.real[d.real], d.ann.map(v => DL.ann[v]).join("; "), d.mod.map(v => LBL.mod[v]).join("; "), d.size, d.desc, d.url, d.url ? (d.chk ? "yes" : "no") : "", d.src.map(l => `${l[0]}: ${l[1]}`).join("; "), refText(d.refs), d.dom.map(x => DOM[x]).join("; "), d.apps.map(i => BYID[i].name).join("; "), d.scen.join("; "), d.counted ? "yes" : "no"]);
  return [head, ...rows].map(r => r.map(q).join(",")).join("\n");
}
function dsJson(list) {
  return JSON.stringify(list.map(d => ({ id: d.id, name: d.name, year: d.year, tier: d.tier, labels: d.lab, origin: d.real, annotations: d.ann, modality: d.mod, size: d.size, description: d.desc, url: d.url, urlFoundInSearch: d.chk, sources: d.src.map(([label, url]) => ({ label, url })), paperRefs: d.refs, applications: d.apps.map(i => BYID[i].name), scenarios: d.scen, counted: d.counted })), null, 1);
}

/* ---------- Dataset properties in the taxonomy tab ---------- */
function dsPropsHTML() {
  return `<div class="fam"><h3>Dataset properties</h3><span>Used to sort datasets by readiness and to decide whether a dataset can evaluate a scenario.</span></div>` +
    TAX.dsprops.map(p => {
      const cnt = countBy(DS, d => (["tier", "lab", "real"].includes(p.key) ? [d[p.key]] : d[p.key]));
      const max = Math.max(...p.values.map(v => cnt.get(v[0]) || 0), 1);
      return `<div class="prop"><div class="ph"><h4>${esc(p.label)}</h4><span class="prov">Datasets</span></div>
        <div class="vals">${p.values.map(([c, l, d]) => { const n = cnt.get(c) || 0; return `<div class="val"><span class="vn">${p.key === "tier" ? tierDot(c) : ""}${esc(l)}<span class="mono">${c}</span></span><span class="vd">${esc(d)}</span><span class="bar"><i style="width:${Math.round(64 * n / max)}px"></i>${n}</span></div>`; }).join("")}</div></div>`;
    }).join("");
}

/* ---------- Dataset events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  if (d.openDs) return openDetail("ds", d.openDs, stack.length > 0);
  if (d.dsort) { DSTATE.sort = d.dsort; store("dsSort", DSTATE.sort); return drawCharts(); }
  if (d.dview) { DSTATE.view = d.dview; store("dsView", DSTATE.view); return drawCharts(); }
  if (d.dmod) { FDKEYS.forEach(k => FD.sel[k].clear()); FD.scen = ""; FD.sel.mod.add(d.dmod); drawDsFilters(); drawDsList(); $("#ds-catalog").scrollIntoView({ block: "start" }); return; }
  if (d.df) { const [k, v] = d.df.split(":"); FD.sel[k].has(v) ? FD.sel[k].delete(v) : FD.sel[k].add(v); drawDsFilters(); return drawDsList(); }
  if (d.dclear) { FD.sel[d.dclear].clear(); drawDsFilters(); return drawDsList(); }
  if (d.drm) { if (d.drm === "scen") FD.scen = ""; else { const [k, v] = d.drm.split(":"); FD.sel[k].delete(v); } drawDsFilters(); return drawDsList(); }
  if (t.id === "d-clear-all") { FD.scen = ""; FD.q = ""; $("#dq").value = ""; FDKEYS.forEach(k => FD.sel[k].clear()); drawDsFilters(); return drawDsList(); }
  if (t.id === "d-filters-open") { $("#d-rail").classList.add("open"); return; }
  if (t.id === "d-rail-close") { $("#d-rail").classList.remove("open"); return; }
  if (t.id === "d-copy-csv") return copyText(dsCsv(dsFiltered()), "CSV of the filtered datasets", t);
  if (t.id === "d-copy-json") return copyText(dsJson(dsFiltered()), "JSON of the filtered datasets", t);
});
let dtimer = null;
document.addEventListener("input", e => {
  if (e.target.id === "dq") { FD.q = e.target.value.trim(); drawDsList(); clearTimeout(dtimer); dtimer = setTimeout(drawDsFilters, 180); }
});
document.addEventListener("change", e => {
  if (e.target.id === "df-scen") { FD.scen = e.target.value; drawDsFilters(); drawDsList(); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !stack.length) { const r = $("#d-rail"); if (r) r.classList.remove("open"); }
});
