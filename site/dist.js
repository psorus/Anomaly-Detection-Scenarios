
/* ---------- Distributions: pie charts ---------- */
const FAMS = ["Tabular", "Time series & signals", "Sequences & logs", "Vision", "Text & code", "Graphs", "Spatio-temporal"];
const FAM_MODS = {};
Object.entries(MF).forEach(([m, f]) => { (FAM_MODS[f] = FAM_MODS[f] || []).push(m); });
const PSTATE = { count: load("pieCount", "primary") === "all" ? "all" : "primary", scope: "", open: new Set(), closed: new Set() };
{ const sc = load("pieScope", ""); if (sc && SCID[sc]) PSTATE.scope = sc; }
const OTHER = "_other";
const uniq = xs => [...new Set(xs)];
/* One item's values: "primary" keeps the first listed value; an empty list becomes the property's "none" value. */
function pick(list, mode, none) { return !list.length ? (none ? [none] : []) : mode === "primary" ? [list[0]] : uniq(list); }
const famOf = mods => uniq(mods.map(m => MF[m]));
/* A scope can leave any two colored slices side by side, so the pies use only the palette slots that stay
   distinguishable in every pairing, in light and dark mode and under color-vision deficiency: three hues. */
const MAX_HUES = 3;

const PIE_GROUPS = [
  ["t1", "Properties from the paper's Table 1", "The structural properties the paper uses to define scenarios."],
  ["ext", "Extended properties", "Added in this atlas because they change which algorithms and metrics fit."],
  ["ctx", "Context", "Contextual, so it never defines a scenario."],
  ["ds", "Dataset properties", "Properties of the datasets themselves, so there is no application chart."],
];
const NONE_LABEL = { out: "Score only", oc: "No special constraints", dq: "No special characteristics" };
function appProp(k, group, short, q, extra) {
  const none = NONE_LABEL[k] ? "_none" : null;
  return Object.assign({
    k, group, short, q, kind: "app", label: P[k].label, values: P[k].values.map(v => v[0]), lab: v => LBL[k][v],
    specials: none ? [{ v: none, label: NONE_LABEL[k], cls: "none" }] : [],
    appVals: (a, m) => pick(vals(a, k), m, none), appFilter: v => [k, [v]],
  }, extra || {});
}
function dsProp(k, short, q, extra) {
  return Object.assign({
    k, group: "ds", short, q, kind: "ds", label: DSP[k].label, values: DSP[k].values.map(v => v[0]), lab: v => DL[k][v],
    specials: [], dsVals: d => [d[k]], dsFilter: v => [k, [v]],
  }, extra || {});
}
/* kind: "app" = application property that datasets inherit; "own" = both have it; "ds" = datasets only. */
const PIE_PROPS = [
  { k: "fam", group: "t1", kind: "own", short: "Modality families", label: "Data modality, by family", q: "The form of the raw data, grouped into families.",
    values: FAMS, lab: v => v, specials: [], appVals: (a, m) => pick(famOf(a.mod), m), dsVals: (d, m) => pick(famOf(d.mod), m),
    appFilter: v => ["mod", FAM_MODS[v]], dsFilter: v => ["mod", FAM_MODS[v]] },
  { k: "mod", group: "t1", kind: "own", short: "Modalities", label: "Data modality, individual", q: "The same property, split into single modalities.",
    values: P.mod.values.map(v => v[0]), lab: v => LBL.mod[v], specials: [], appVals: (a, m) => pick(a.mod, m), dsVals: (d, m) => pick(d.mod, m),
    appFilter: v => ["mod", [v]], dsFilter: v => ["mod", [v]] },
  appProp("pt", "t1", "Processing time", "How fast a decision is needed.", { ordinal: { hrt: "o3", on: "o2", bat: "o1" } }),
  appProp("sup", "t1", "Supervision", "Which labels are realistically available. The first listed is the most common."),
  appProp("at", "t1", "Anomaly type", "How anomalies differ from normal data."),
  appProp("ep", "t1", "Evaluation priority", "Which error matters most. The first listed is the primary one."),
  appProp("ar", "t1", "Anomaly ratio", "Typical share of anomalies in the data.", { ordinal: { vl: "o1", lo: "o2", mo: "o3" } }),
  appProp("dim", "t1", "Dimensionality", "Features or channels per unit after preprocessing.", { ordinal: { lo: "o1", me: "o2", hi: "o3" } }),
  appProp("oc", "t1", "Constraints", "What the deployment imposes on the detector."),
  appProp("out", "ext", "Outputs", "What users need beyond an anomaly flag."),
  appProp("unit", "ext", "Detection unit", "What the detector scores."),
  appProp("adv", "ext", "Adversary", "Whether an agent produces the anomalies and hides them.", { ordinal: { no: "o1", conc: "o2", adapt: "o3" } }),
  appProp("dq", "ext", "Data characteristics", "Data properties that constrain preprocessing and algorithms."),
  { k: "dom", group: "ctx", kind: "app", short: "Domain", label: "Domain", q: "The field the application comes from.",
    values: DOM_ORDER, lab: v => DOM[v], specials: [], appVals: a => [a.dom], appFilter: v => ["dom", [v]], dsFilter: v => ["dom", [v]] },
  dsProp("tier", "Readiness tier", "How ready the dataset is for benchmarking.", { values: TIERS, ordinal: { suite: "o3", bench: "o2", app: "o1", generic: "hatch" } }),
  dsProp("lab", "Labels", "How complete the anomaly labels are.", { ordinal: { full: "o3", partial: "o2", weak: "o1", none: "hatch" } }),
  dsProp("real", "Anomaly origin", "Whether the anomalies are real, injected or simulated.", { ordinal: { real: "o3", semi: "o2", sim: "o1" } }),
  dsProp("ann", "Annotations", "What the labels say beyond normal or anomalous.", {
    label: "Annotations", specials: [{ v: "_bin", label: "Binary labels only", cls: "none" }, { v: "_nolab", label: "No labels", cls: "hatch" }],
    dsVals: (d, m) => d.ann.length ? pick(d.ann, m) : [d.lab === "none" ? "_nolab" : "_bin"],
    dsFilter: v => v === "_bin" || v === "_nolab" ? null : ["ann", [v]] }),
];
PIE_PROPS.forEach(p => { p.spec = Object.fromEntries(p.specials.map(s => [s.v, s])); });
function labOf(p, v) { return p.spec[v] ? p.spec[v].label : p.lab(v); }

/* Applications a dataset inherits application properties from. Inside a scenario, only its member applications. */
function inheritFrom(d, mode) {
  let ids = d.apps;
  if (PSTATE.scope) { const mem = SCID[PSTATE.scope]._m; const inS = ids.filter(i => mem.has(i)); if (inS.length) ids = inS; }
  return (mode === "primary" ? ids.slice(0, 1) : ids).map(i => BYID[i]);
}
function itemVals(p, side, x, mode) {
  if (side === "app") return p.appVals(x, mode);
  if (p.kind !== "app") return p.dsVals(x, mode);
  const vs = uniq(inheritFrom(x, mode).flatMap(a => p.appVals(a, mode)));
  return vs.length > 1 ? vs.filter(v => !p.spec[v]) : vs;
}

/* Fixed slice set and colors per property, chosen once on the whole catalog so a value keeps its color in every view.
   At most six segments: up to three colored values, then "Other" in gray, then the special values. */
PIE_PROPS.forEach(p => {
  p.color = {};
  p.specials.forEach(s => { p.color[s.v] = s.cls; });
  if (p.ordinal) { p.named = p.values.slice(); Object.assign(p.color, p.ordinal); return; }
  const share = new Map();
  const add = (list, side) => list.length && ["primary", "all"].forEach(m => {
    countBy(list, x => itemVals(p, side, x, m)).forEach((n, v) => share.set(v, Math.max(share.get(v) || 0, n / list.length)));
  });
  if (p.kind !== "ds") add(APPS, "app");
  add(p.kind === "app" ? DS.filter(d => d.apps.length) : DS, "ds");
  const cands = p.values.filter(v => share.get(v));
  const nSpec = p.specials.filter(s => share.get(s.v)).length;
  const cap = Math.min(MAX_HUES, 5 - nSpec);
  let named = cands;
  if (cands.length > cap) {
    const top = new Set(cands.slice().sort((a, b) => share.get(b) - share.get(a)).slice(0, cap));
    named = cands.filter(v => top.has(v));
  }
  p.named = named;
  named.forEach((v, i) => { p.color[v] = "c" + (i + 1); });
});

function pieLists() {
  const s = PSTATE.scope ? SCID[PSTATE.scope] : null;
  const apps = s ? s.members.map(i => BYID[i]) : APPS;
  const ds = s ? DS.filter(d => d.scen.includes(s.id)) : DS;
  return { s, apps, ds, linked: ds.filter(d => d.apps.length) };
}
function sideList(p, side, L) { return side === "app" ? L.apps : p.kind === "app" ? L.linked : L.ds; }
function sideCounts(p, list, side, mode) {
  const per = list.map(x => itemVals(p, side, x, mode));
  const c = new Map();
  per.forEach(vs => vs.forEach(v => c.set(v, (c.get(v) || 0) + 1)));
  return { c, per, items: list.length };
}
/* Values folded into "Other" in the current view. */
function restOf(p, A, Dd) {
  const named = new Set(p.named);
  return p.values.filter(v => !named.has(v) && !p.spec[v] && ((A && A.c.get(v)) || Dd.c.get(v)));
}
/* Table rows shared by both charts: named values, then Other (with its values as sub-rows), then the special values.
   n = items in the row; w = slice weight (equal to n, except "Other" in every-value mode, where it is the number of listings). */
function pieRows(p, A, Dd) {
  const side = (S, v) => S ? { n: S.c.get(v) || 0, w: S.c.get(v) || 0 } : null;
  const rows = p.named.map(v => ({ v, label: p.lab(v), cls: p.color[v], a: side(A, v), d: side(Dd, v) }))
    .filter(r => (r.a ? r.a.n : 0) + r.d.n > 0);
  const rest = restOf(p, A, Dd);
  if (rest.length === 1) rows.push({ v: rest[0], label: p.lab(rest[0]), cls: "po", a: side(A, rest[0]), d: side(Dd, rest[0]) });
  else if (rest.length) {
    const set = new Set(rest);
    const agg = S => S ? { n: S.per.filter(vs => vs.some(v => set.has(v))).length, w: rest.reduce((n, v) => n + (S.c.get(v) || 0), 0) } : null;
    rows.push({ v: OTHER, label: `Other (${rest.length} values)`, cls: "po", a: agg(A), d: agg(Dd), sub: rest.map(v => ({ v, label: p.lab(v), a: side(A, v), d: side(Dd, v) })) });
  }
  p.specials.forEach(s => {
    const r = { v: s.v, label: s.label, cls: s.cls, a: side(A, s.v), d: side(Dd, s.v) };
    if ((r.a ? r.a.n : 0) + r.d.n > 0) rows.push(r);
  });
  return rows;
}
function arcPath(cx, cy, r0, r1, a0, a1) {
  const pt = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  if (a1 - a0 >= 2 * Math.PI - 1e-6) {
    const e = 2 * Math.PI - 1e-4;
    return `M${pt(r1, 0)} A${r1} ${r1} 0 1 1 ${pt(r1, Math.PI)} A${r1} ${r1} 0 1 1 ${pt(r1, e)} Z M${pt(r0, 0)} A${r0} ${r0} 0 1 0 ${pt(r0, Math.PI)} A${r0} ${r0} 0 1 0 ${pt(r0, e)} Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
}
function sliceTip(r, s, items, what, mode) {
  if (mode === "primary") return `${r.label}: ${s.n} of ${items} ${what} (${pct(s.n, items)}%)`;
  if (r.sub) return `${r.label}: ${s.n} of ${items} ${what} list at least one of these values (${s.w} listings)`;
  return `${r.label}: listed for ${s.n} of ${items} ${what} (${pct(s.n, items)}%)`;
}
function donut(p, rows, side, items, what, mode) {
  const live = rows.filter(r => r[side] && r[side].w > 0);
  const sum = live.reduce((n, r) => n + r[side].w, 0);
  let a = 0;
  const paths = live.map(r => {
    const s = r[side], a1 = a + 2 * Math.PI * s.w / sum;
    const d = arcPath(80, 80, 47, 76, a, a1); a = a1;
    return `<path class="slice f-${r.cls}" d="${d}" data-pslice="${side}|${p.k}|${esc(r.v)}" data-tip="${esc(sliceTip(r, s, items, what, mode))}"></path>`;
  }).join("");
  const aria = `${p.label}, ${what}: ` + (live.length ? live.map(r => `${r.label} ${r[side].n}`).join(", ") : "none");
  return `<svg viewBox="0 0 160 160" class="donut" role="img" aria-label="${esc(aria)}">${paths || `<circle cx="80" cy="80" r="61.5" class="empty-ring"></circle>`}<text x="80" y="76" class="dn">${items}</text><text x="80" y="96" class="dl">${what}</text></svg>`;
}
function pieCell(p, side, r, items, mode) {
  const s = r[side];
  if (!s) return "";
  if (!s.n) return `<td><span class="pn z">0</span><span class="pp"></span></td>`;
  const what = side === "a" ? "applications" : "datasets";
  return `<td><button type="button" class="pbtn" data-pslice="${side}|${p.k}|${esc(r.v)}" aria-label="List ${s.n} ${what}: ${esc(r.label)}">${s.n}</button><span class="pp">${pct(s.n, items)}%</span></td>`;
}
function pieCard(p, L, mode) {
  const hasApps = p.kind !== "ds";
  const A = hasApps ? sideCounts(p, L.apps, "app", mode) : null;
  const Dd = sideCounts(p, sideList(p, "ds", L), "ds", mode);
  const rows = pieRows(p, A, Dd);
  const dsCap = p.kind === "app" ? "Datasets, via their applications" : "Datasets";
  const figs = (hasApps ? `<figure class="pfig">${donut(p, rows, "a", A.items, "applications", mode)}<figcaption>Applications</figcaption></figure>` : "")
    + `<figure class="pfig">${donut(p, rows, "d", Dd.items, "datasets", mode)}<figcaption>${dsCap}</figcaption></figure>`;
  const other = rows.find(r => r.sub);
  const big = other && rows.every(r => (other.a ? other.a.n : other.d.n) >= (r.a ? r.a.n : r.d.n));
  const open = other && !PSTATE.closed.has(p.k) && (PSTATE.open.has(p.k) || other.sub.length <= 3 || big);
  const tr = r => `<tr><th scope="row"><span class="vcell"><i class="sw f-${r.cls}" aria-hidden="true"></i>${r.sub
      ? `<button type="button" class="ptoggle" data-ptoggle="${p.k}" aria-expanded="${!!open}">${esc(r.label)}</button>` : esc(r.label)}</span></th>${
      hasApps ? pieCell(p, "a", r, A.items, mode) : ""}${pieCell(p, "d", r, Dd.items, mode)}</tr>`
    + (r.sub ? r.sub.map(s => `<tr class="sub" data-psub="${p.k}"${open ? "" : " hidden"}><th scope="row">${esc(s.label)}</th>${
      hasApps ? pieCell(p, "a", s, A.items, mode) : ""}${pieCell(p, "d", s, Dd.items, mode)}</tr>`).join("") : "");
  const left = L.ds.length - L.linked.length;
  const note = p.kind === "app" ? `<p class="hint">Datasets take this from ${mode === "primary" ? "their first linked application" : "all their linked applications"}${
    PSTATE.scope ? " in this scenario" : ""}.${left ? ` ${left} generic ${left === 1 ? "collection" : "collections"} without applications ${left === 1 ? "is" : "are"} left out.` : ""}</p>` : "";
  return `<article class="pcard" id="pc-${p.k}">
    <div class="ph"><h4>${esc(p.label)}</h4><span class="prov${p.group === "t1" ? " paper" : ""}">${p.group === "t1" ? "Table 1" : p.group === "ext" ? "Extension" : p.group === "ctx" ? "Context" : "Dataset"}</span></div>
    <p class="q">${esc(p.q)}</p>
    <div class="pbody">
      <div class="pduo${hasApps ? "" : " single"}">${figs}</div>
      <div class="tbl-wrap"><table class="ptable" aria-label="${esc(p.label)}: counts"><thead><tr><th scope="col">Value</th>${hasApps ? `<th scope="col">Applications</th>` : ""}<th scope="col">Datasets</th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>
    </div>
    ${note}
  </article>`;
}
function renderPies() {
  $("#p-scope").innerHTML = `<option value="">All applications and datasets</option>` + SC.map(s => `<option value="${s.id}"${PSTATE.scope === s.id ? " selected" : ""}>${s.id} ${esc(s.name)}</option>`).join("");
  $("#p-jump").innerHTML = PIE_PROPS.map(p => `<button type="button" class="chip" data-pjump="${p.k}">${esc(p.short)}</button>`).join("");
  drawPies();
}
function drawPies() {
  const L = pieLists(), mode = PSTATE.count;
  document.querySelectorAll("[data-pcount]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pcount === mode)));
  $("#p-hint").textContent = mode === "primary"
    ? "Each application and dataset counts once, under its first listed value, so every pie adds up to the whole. Select a slice or a count to list what is in it."
    : "Every listed value counts, so an application with both tabular data and text appears in both slices. Slices show shares of all listed values; table percentages are shares of applications or datasets and can add up to more than 100%.";
  $("#p-note").innerHTML = L.s
    ? `<span><b>${L.apps.length}</b>member applications</span><span><b>${L.ds.length}</b>mapped datasets</span><span><b>${L.s.ds.length}</b>qualifying datasets</span><span>${esc(L.s.id)} ${esc(L.s.name)}</span>`
    : `<span><b>${L.apps.length}</b>applications</span><span><b>${L.ds.length}</b>datasets</span><span><b>${L.linked.length}</b>datasets linked to an application</span>`;
  $("#pies").innerHTML = PIE_GROUPS.map(([g, title, sub]) => `<div class="fam"><h3>${esc(title)}</h3><span>${esc(sub)}</span></div>
    <div class="pgrid">${PIE_PROPS.filter(p => p.group === g).map(p => pieCard(p, L, mode)).join("")}</div>`).join("");
}
/* The items behind one slice or count, in the current scope and counting mode. */
function sliceItems(p, side, v) {
  const L = pieLists(), mode = PSTATE.count, sd = side === "a" ? "app" : "ds";
  const list = sideList(p, sd, L);
  let match;
  if (v === OTHER) {
    const A = p.kind !== "ds" ? sideCounts(p, L.apps, "app", mode) : null, Dd = sideCounts(p, sideList(p, "ds", L), "ds", mode);
    const set = new Set(restOf(p, A, Dd));
    match = vs => vs.some(x => set.has(x));
  } else match = vs => vs.includes(v);
  return { L, mode, sd, items: list.filter(x => match(itemVals(p, sd, x, mode))) };
}
/* The catalog can show the same list only when its filter returns exactly these items. */
function catalogSpec(p, sd, v, items) {
  if (v === OTHER || p.spec[v]) return null;
  const f = sd === "app" ? p.appFilter : p.dsFilter;
  const spec = f ? f(v) : null;
  if (!spec) return null;
  const [fk, fv] = spec, sc = PSTATE.scope;
  const hit = sd === "app"
    ? APPS.filter(a => (!sc || a.scen.includes(sc)) && fvals(a, fk).some(x => fv.includes(x)))
    : DS.filter(d => (!sc || d.scen.includes(sc)) && dvals(d, fk).some(x => fv.includes(x)));
  const want = new Set(items.map(x => x.id));
  return hit.length === want.size && hit.every(x => want.has(x.id)) ? `${sd}|${p.k}|${v}` : null;
}
function openSlice(side, k, v) {
  const p = PIE_PROPS.find(x => x.k === k);
  const { L, mode, sd, items } = sliceItems(p, side, v);
  const what = sd === "app" ? "applications" : "datasets";
  const label = v === OTHER ? "Other values" : labOf(p, v);
  const how = v === OTHER
    ? (mode === "primary" ? "whose first listed value is one of the values folded into Other" : "that list at least one of the values folded into Other")
    : mode === "primary"
      ? (sd === "ds" && p.kind === "app" ? "whose first linked application has this as its first listed value" : "with this as the first listed value")
      : (sd === "ds" && p.kind === "app" ? "linked to an application that lists this value" : "that list this value");
  const go = catalogSpec(p, sd, v, items);
  const btns = items.map(x => sd === "app"
    ? `<button type="button" data-open-app="${x.id}"><span>${esc(x.name)}</span><span class="d">${esc(DOM[x.dom])}</span></button>`
    : dsButton(x)).join("");
  const html = `<div class="meta" style="display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:12.5px"><span>${esc(p.label)}</span>${L.s ? `<span class="mono">${esc(L.s.id)}</span>` : ""}</div>
    <div><h2>${esc(label)}</h2></div>
    <p class="sum">${items.length} ${what} ${how}${L.s ? `, among ${L.s.id} ${esc(L.s.name)}` : ""}.</p>
    ${go ? `<div class="linkrow"><button type="button" class="btn" data-pgo="${esc(go)}">Show these in the ${sd === "app" ? "application" : "dataset"} catalog</button></div>` : ""}
    <div class="sec"><h3>${what} (${items.length})</h3>${items.length ? `<div class="mlist">${btns}</div>` : `<p class="hint">None in this view.</p>`}</div>`;
  if (!stack.length) opener = document.activeElement;
  stack.push({ type: "html", html });
  drawSheet();
}
function pieGo(sd, k, v) {
  const p = PIE_PROPS.find(x => x.k === k);
  const [fk, fv] = (sd === "app" ? p.appFilter : p.dsFilter)(v);
  closeSheet();
  if (sd === "app") {
    F.q = ""; F.scen = PSTATE.scope; FKEYS.forEach(x => F.sel[x].clear()); fv.forEach(x => F.sel[fk].add(x));
    const q = $("#q"); if (q) q.value = "";
    setView("apps", { force: true });
  } else {
    FD.q = ""; FD.scen = PSTATE.scope; FDKEYS.forEach(x => FD.sel[x].clear()); fv.forEach(x => FD.sel[fk].add(x));
    const q = $("#dq"); if (q) q.value = "";
    setView("datasets", { force: true });
    $("#ds-catalog").scrollIntoView({ block: "start" });
  }
}
document.addEventListener("click", e => {
  const s = e.target.closest("[data-pslice]");
  if (s) { const [side, k, v] = s.dataset.pslice.split("|"); return openSlice(side, k, v); }
  const t = e.target.closest("button");
  if (!t) return;
  const b = t.dataset;
  if (b.pcount) { PSTATE.count = b.pcount; store("pieCount", PSTATE.count); return drawPies(); }
  if (b.pgo) { const [sd, k, v] = b.pgo.split("|"); return pieGo(sd, k, v); }
  if (b.pjump) { const el = document.getElementById("pc-" + b.pjump); if (el) el.scrollIntoView({ block: "start" }); return; }
  if (b.ptoggle) {
    const k = b.ptoggle, open = t.getAttribute("aria-expanded") !== "true";
    t.setAttribute("aria-expanded", String(open));
    if (open) { PSTATE.open.add(k); PSTATE.closed.delete(k); } else { PSTATE.closed.add(k); PSTATE.open.delete(k); }
    document.querySelectorAll(`tr[data-psub="${k}"]`).forEach(r => { r.hidden = !open; });
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "p-scope") { PSTATE.scope = e.target.value; store("pieScope", PSTATE.scope); drawPies(); }
});
