#!/usr/bin/env python3
"""Command line for the atlas.

  python scripts/atlas.py check                      validate every file under data/ (CI runs this on each pull request)
  python scripts/atlas.py build [--out _site]        validate, derive all numbers, write the website and downloads
  python scripts/atlas.py report --base DIR          Markdown summary of what a change does to scenarios and counts
  python scripts/atlas.py new application FIN        print the next free id and a template file
  python scripts/atlas.py issue --body-file F --kind application --number 12
                                                     turn a submitted issue form into a data file (used by a workflow)
  python scripts/atlas.py apply-reviews --body-file F --author LOGIN --number 7
                                                     apply a batch of verdicts sent from the Review tab
  python scripts/atlas.py forms [--check]            regenerate the GitHub issue forms from the taxonomy
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlaslib as L  # noqa: E402


def _load_valid(repo=None, quiet=False):
    tax, recs, meta = L.load_all(repo)
    pb = L.validate(tax, recs)
    if not quiet:
        pb.print()
    return tax, recs, meta, pb


def cmd_check(args):
    tax, recs, meta, pb = _load_valid()
    n = {k: len(v) for k, v in recs.items()}
    errs, warns = len(pb.errors), len(pb.items) - len(pb.errors)
    print(f"Checked {n['applications']} applications, {n['datasets']} datasets, {n['scenarios']} scenarios: "
          f"{errs} error(s), {warns} warning(s).")
    return 1 if errs else 0


def _git(*a):
    try:
        return subprocess.run(["git", *a], cwd=L.ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return ""


def site_config(meta):
    repo = os.environ.get("GITHUB_REPOSITORY") or meta.get("repository") or "OWNER/REPO"
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    branch = meta.get("branch") or "main"
    sha = os.environ.get("GITHUB_SHA") or _git("rev-parse", "HEAD")
    owner, _, name = repo.partition("/")
    return {"repo": repo, "repoUrl": f"{server}/{repo}", "branch": branch, "sha": sha,
            "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "siteUrl": f"https://{owner.lower()}.github.io/{name}/" if owner and name else "",
            "discussions": meta.get("discussions") or {}, "title": meta.get("title"), "paper": meta.get("paper")}


def write_csvs(cat, out):
    tax = cat["taxonomy"]
    labels = {p["key"]: {v[0]: v[1] for v in p["values"]} for p in tax["properties"]}
    dl = {p["key"]: {v[0]: v[1] for v in p["values"]} for p in tax["dsprops"]}
    doms = dict(tax["domains"])
    names = {s["id"]: s["name"] for s in cat["scenarios"]}
    dsname = {d["id"]: d["name"] for d in cat["datasets"]}
    appname = {a["id"]: a["name"] for a in cat["apps"]}
    single = {p["key"] for p in tax["properties"] if not p["multi"]}
    vals = lambda a, k: ([a[k]] if a[k] else []) if k in single else a[k]
    ref_txt = lambda refs: " | ".join(f"[{r['n']}] {r['t']}" + (f" {r['u']}" if r.get("u") else "") for r in refs)
    with open(os.path.join(out, "applications.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "domain", "subdomain", "application", "description"] + [p["label"] for p in tax["properties"]]
                   + ["scenarios", "datasets", "references", "review status", "file"])
        for a in cat["apps"]:
            w.writerow([a["id"], doms[a["dom"]], a["sub"], a["name"], a["desc"]]
                       + ["; ".join(labels[p["key"]][x] for x in vals(a, p["key"])) for p in tax["properties"]]
                       + ["; ".join(f"{i} {names[i]}" for i in a["scen"]), "; ".join(dsname[i] for i in a["ds"]),
                          ref_txt(a["refs"]), a["review"], a["_file"]])
    with open(os.path.join(out, "datasets.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "dataset", "year", "readiness tier", "labels", "anomaly origin", "annotations", "modality", "size",
                    "description", "dataset page", "page found in search", "other links", "references", "domains",
                    "applications", "scenarios", "counts toward scenario minimum", "review status", "file"])
        for d in cat["datasets"]:
            w.writerow([d["id"], d["name"], d["year"], dl["tier"][d["tier"]], dl["lab"][d["lab"]], dl["real"][d["real"]],
                        "; ".join(dl["ann"][x] for x in d["ann"]), "; ".join(labels["mod"][x] for x in d["mod"]), d["size"],
                        d["desc"], d["url"], "yes" if d["chk"] else ("no" if d["url"] else ""),
                        "; ".join(f"{l[0]}: {l[1]}" for l in d["src"]), ref_txt(d["refs"]),
                        "; ".join(doms[x] for x in d["dom"]), "; ".join(appname[x] for x in d["apps"]),
                        "; ".join(f"{i} {names[i]}" for i in d["scen"]), "yes" if d["counted"] else "no", d["review"], d["_file"]])
    with open(os.path.join(out, "scenarios.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "scenario", "family", "from the paper", "applications", "domains", "qualifying datasets",
                    "generic collections", "unlabeled datasets", "applications with data", "review status", "file"])
        for s in cat["scenarios"]:
            w.writerow([s["id"], s["name"], s["family"], s["paper"], len(s["members"]), len(s["domains"]), len(s["ds"]),
                        len(s["dsGeneric"]), len(s["dsUnlabeled"]), len(s["appsWithData"]), s["review"], s["_file"]])


def cmd_build(args):
    tax, recs, meta, pb = _load_valid()
    if pb.errors:
        print(f"Build stopped: {len(pb.errors)} validation error(s).", file=sys.stderr)
        return 1
    sugg = L.load_suggestions()
    full = L.derive(tax, recs, meta, sugg)
    cat = L.derive(tax, L.reviewed_only(recs), meta, sugg)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    cfg = site_config(meta)
    st = L.stats(full)
    st.update({"published_" + k: v for k, v in L.stats(cat).items() if k in ("applications", "scenarios", "datasets")})
    cfg["stats"] = st
    site = os.path.join(L.ROOT, "site")
    rd = lambda n: open(os.path.join(site, n), encoding="utf-8").read()
    payload = json.dumps(cat, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    review_payload = json.dumps({k: full[k] for k in ("apps", "scenarios", "datasets")}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    cfg_json = json.dumps(cfg, ensure_ascii=False).replace("</", "<\\/")
    js = rd("main.js") + rd("dist.js") + rd("gh.js") + rd("init.js")
    title = html.escape(meta.get("title") or "Anomaly Detection Scenario Atlas")
    desc = html.escape(meta.get("description") or "")
    page = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            f"<meta name=\"description\" content=\"{desc}\">\n<meta property=\"og:title\" content=\"{title}\">\n"
            f"<meta property=\"og:description\" content=\"{desc}\">\n"
            "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='13' fill='none' stroke='%232f7f90' stroke-width='3' stroke-dasharray='2 4'/%3E%3Ccircle cx='18' cy='18' r='3.5' fill='%23d95926'/%3E%3C/svg%3E\">\n"
            + rd("head.html") + "\n</head>\n<body>\n" + rd("body.html")
            + f'\n<script type="application/json" id="atlas-config">{cfg_json}</script>'
            + f'\n<script type="application/json" id="atlas-data">{payload}</script>'
            + f'\n<script type="application/json" id="atlas-review">{review_payload}</script>\n<script>\n{js}\n</script>\n</body>\n</html>\n')
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    with open(os.path.join(out, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump({"built": cfg["built"], "commit": cfg["sha"], "stats": st, **cat}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(out, "stats.json"), "w", encoding="utf-8") as f:
        json.dump({"built": cfg["built"], "commit": cfg["sha"], **st}, f, indent=2)
    with open(os.path.join(out, "catalog-all.json"), "w", encoding="utf-8") as f:
        json.dump({"built": cfg["built"], "commit": cfg["sha"], "note": "Includes entries that are not reviewed yet.", **full}, f, ensure_ascii=False, indent=1)
    write_csvs(cat, out)
    open(os.path.join(out, ".nojekyll"), "w").close()
    print(f"Built {out}/index.html ({len(page) // 1024} KB) from commit {cfg['sha'][:7] or 'unknown'}.")
    for k, v in st.items():
        print(f"  {k.replace('_', ' ')}: {v}")
    return 0


# ---------------------------------------------------------------- impact report for pull requests

def _catalog(repo):
    tax, recs, meta = L.load_all(repo)
    pb = L.validate(tax, recs)
    if pb.errors:
        return None, pb
    return L.derive(tax, recs, meta), pb


def _field_changes(old, new, skip):
    return [k for k in sorted(set(old) | set(new)) if k not in skip and old.get(k) != new.get(k)]


def cmd_report(args):
    head, pbh = _catalog(None)
    base, _ = _catalog(os.path.abspath(args.base))
    lines = ["## Atlas impact report", ""]
    if head is None:
        lines += [f"This change does not pass validation ({len(pbh.errors)} error(s)), so its effect cannot be computed yet.", ""]
        lines += [f"- `{p}`{':' + str(l) if l else ''}: {m}" for lv, p, l, m in pbh.errors[:40]]
        _emit(args, lines)
        return 0
    if base is None:
        lines += ["The base branch does not validate, so only the new numbers are shown.", ""]
        base = {"apps": [], "datasets": [], "scenarios": [], "taxonomy": head["taxonomy"]}
    sb, sh = L.stats(base) if base["apps"] else {}, L.stats(head)
    lines += ["| Number on the site | Before | After |", "|---|---:|---:|"]
    changed = False
    for k, v in sh.items():
        b = sb.get(k, "–")
        mark = " **(changed)**" if b != v else ""
        changed |= b != v
        lines.append(f"| {k.replace('_', ' ').capitalize()} | {b} | {v}{mark} |")
    lines.append("")
    derived = {"scen", "ds", "members", "domains", "dsGeneric", "dsUnlabeled", "dsLacking", "appsWithData", "dom", "counted", "_file"}
    for kind, label in (("apps", "Applications"), ("datasets", "Datasets"), ("scenarios", "Scenarios")):
        B = {x["id"]: x for x in base[kind]}
        H = {x["id"]: x for x in head[kind]}
        added = [i for i in H if i not in B]
        removed = [i for i in B if i not in H]
        edited = [(i, _field_changes(B[i], H[i], derived)) for i in H if i in B]
        edited = [(i, f) for i, f in edited if f]
        if added or removed or edited:
            lines += [f"### {label}", ""]
            lines += [f"- Added **{i}** {H[i]['name']}" for i in added]
            lines += [f"- Removed **{i}** {B[i]['name']}" for i in removed]
            lines += [f"- Edited **{i}** {H[i]['name']}: {', '.join(f)}" for i, f in edited]
            lines.append("")
    B = {s["id"]: s for s in base["scenarios"]}
    rows = []
    for s in head["scenarios"]:
        o = B.get(s["id"], {"members": [], "ds": [], "dsGeneric": []})
        ja, la = sorted(set(s["members"]) - set(o["members"])), sorted(set(o["members"]) - set(s["members"]))
        jd, ld = sorted(set(s["ds"]) - set(o["ds"])), sorted(set(o["ds"]) - set(s["ds"]))
        if ja or la or jd or ld:
            rows.append(f"| {s['id']} {s['name']} | {len(o['members'])} → {len(s['members'])} | {_ids(ja, '+')} {_ids(la, '−')} "
                        f"| {len(o['ds'])} → {len(s['ds'])} | {_ids(jd, '+')} {_ids(ld, '−')} |")
            if len(s["ds"]) < 3 <= len(o["ds"]):
                rows.append(f"| ⚠ {s['id']} now has fewer than 3 qualifying datasets | | | | |")
    if rows:
        lines += ["### Scenario membership", "", "| Scenario | Applications | Joined / left | Qualifying datasets | Joined / left |",
                  "|---|---|---|---|---|"] + rows + [""]
    elif not changed:
        lines += ["No number on the site changes. The edit only affects text, links, evidence or review status.", ""]
    warn = [x for x in pbh.items if x[0] == "warning"]
    if warn:
        lines += ["<details><summary>Warnings</summary>", ""] + [f"- `{p}`: {m}" for _, p, _, m in warn[:50]] + ["", "</details>", ""]
    _emit(args, lines)
    return 0


def _ids(ids, sign):
    if not ids:
        return ""
    shown = ", ".join(ids[:8]) + (f" and {len(ids) - 8} more" if len(ids) > 8 else "")
    return f"{sign}{shown}"


def _emit(args, lines):
    text = "\n".join(lines) + "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
    print(text)


# ---------------------------------------------------------------- new records

def _next_ids(recs):
    na = max([L._num(r.get("id")) for _, r in recs["applications"]] + [0]) + 1
    nd = max([L._num(r.get("id")) for _, r in recs["datasets"]] + [0]) + 1
    ns = max([L._num(r.get("id")) for _, r in recs["scenarios"]] + [0]) + 1
    return na, nd, ns


def template(kind, tax, recs, domain=None, fields=None):
    """Skeleton record. `fields` (from an issue form) fills it in."""
    f = fields or {}
    na, nd, ns = _next_ids(recs)
    review = {"status": "draft", "reviewers": [], "note": f.get("note") or "Proposed by a contributor; not yet reviewed."}
    if kind == "application":
        dom = domain or f.get("domain") or tax["domains"][0]["code"]
        props = {}
        for p in tax["properties"]:
            v = f.get("properties", {}).get(p["key"])
            props[p["key"]] = (v if v is not None else []) if p.get("multi") else (v if v is not None else p["values"][0]["code"])
        return {"id": f"{dom}-{na:03d}", "name": f.get("name") or "Short name of the application", "domain": dom,
                "subdomain": f.get("subdomain") or "Subdomain", "description": f.get("description") or "Two or three sentences: what is scored, what counts as an anomaly, who acts on it.",
                "properties": props, "evidence": f.get("evidence") or {}, "references": f.get("references") or [], "review": review}
    if kind == "dataset":
        rec = {"id": f"D{nd:03d}", "name": f.get("name") or "Dataset name"}
        if f.get("year"):
            rec["year"] = str(f["year"])
        rec.update({"tier": f.get("tier") or "app", "labels": f.get("labels") or "full", "anomaly_origin": f.get("anomaly_origin") or "real",
                    "annotations": f.get("annotations") or [], "modality": f.get("modality") or ["tab"], "size": f.get("size") or "",
                    "description": f.get("description") or "What the data is, where it comes from and how anomalies are labeled.",
                    "applications": f.get("applications") or [],
                    "links": {"page": {"url": f["url"], "found_in_search": False} if f.get("url") else {}, "other": f.get("links") or []},
                    "references": f.get("references") or [], "review": review})
        return rec
    rule = f.get("rule") or [{"match": {"pt": {"in": ["on"]}, "mod": {"any": ["mts"]}}, "datasets_need": []}]
    rec = {"id": f"S{ns:02d}", "name": f.get("name") or "Scenario name", "family": f.get("family") or "Sequential monitoring",
           "paper": "", "summary": f.get("summary") or "One paragraph: the shared structure of the member applications.", "rule": rule}
    for k in ("metrics", "protocol", "preprocessing", "algorithms", "avoid", "gaps"):
        rec[k] = f.get(k) or "To be discussed."
    rec["review"] = review
    return rec


HEADERS = {
    "application": "Application {id}. Edit any field and open a pull request (see CONTRIBUTING.md).\nAllowed property values: data/taxonomy/properties.yaml. Scenario membership is computed, never written here.",
    "dataset": "Dataset {id}. `applications` lists the applications it comes from, most representative first.\nScenario membership is computed from those applications, the modality and the annotations.",
    "scenario": "Scenario {id}. An application belongs to this scenario if it matches ANY clause under `rule`;\nwithin a clause, ALL conditions must hold. Operators: `in` (single-valued properties), `any`, `all`, `first`, `none`.\n`datasets_need` lists annotation groups a dataset must have to evaluate this clause; each group is a list of alternatives.",
}


def render(kind, rec, tax):
    comments = {}
    if kind == "application":
        comments = {f"properties.{p['key']}": p["label"] for p in tax["properties"]}
    elif kind == "dataset":
        comments = {"tier": "generic | suite | bench | app", "labels": "full | partial | weak | none", "anomaly_origin": "real | semi | sim"}
    return L.dump_yaml(rec, header=HEADERS[kind].format(id=rec["id"]), comments=comments)


def cmd_new(args):
    tax, recs, meta = L.load_all()
    rec = template(args.kind, tax, recs, domain=args.domain)
    folder = {"application": "applications", "dataset": "datasets", "scenario": "scenarios"}[args.kind]
    path = os.path.join(L.DATA, folder, rec["id"] + ".yaml")
    text = render(args.kind, rec, tax)
    if args.write:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Wrote {os.path.relpath(path, L.ROOT)}")
    else:
        print(f"# {os.path.relpath(path, L.ROOT)}\n{text}")
    return 0


# ---------------------------------------------------------------- issue forms -> files

def parse_issue_form(body):
    """GitHub renders issue forms as '### Label' sections. Returns {label: text}; '_No response_' becomes ''."""
    out, cur, buf = {}, None, []
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        m = re.match(r"^###\s+(.+?)\s*$", line)
        if m:
            if cur is not None:
                out[cur] = "\n".join(buf).strip()
            cur, buf = m.group(1), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        out[cur] = "\n".join(buf).strip()
    return {k: ("" if v == "_No response_" else v) for k, v in out.items()}


def _codes(text, allowed):
    """Accepts codes or labels, separated by commas or new lines, or checkbox lists ('- [X] Label (code)')."""
    if not text:
        return []
    items = []
    for line in re.split(r"[\n,;]+", text):
        line = line.strip()
        if not line:
            continue
        cb = re.match(r"^- \[( |x|X)\]\s*(.+)$", line)
        if cb:
            if cb.group(1) == " ":
                continue
            line = cb.group(2)
        m = re.search(r"\(([^()]+)\)\s*$", line)
        cand = [m.group(1).strip()] if m else []
        cand += [line.strip().strip("`")]
        for c in cand:
            if c in allowed:
                items.append(c)
                break
            hit = [k for k, lab in allowed.items() if lab.lower() == c.lower()]
            if hit:
                items.append(hit[0])
                break
    return list(dict.fromkeys(items))


ISSUE_FIELDS = {  # issue form label -> record field
    "application": {"Name": "name", "Domain": "domain", "Subdomain": "subdomain", "Description": "description"},
    "dataset": {"Name": "name", "Year": "year", "Dataset page": "url", "Size": "size", "Description": "description"},
    "scenario": {"Name": "name", "Family": "family", "Summary": "summary", "Metrics": "metrics", "Evaluation protocol": "protocol",
                 "Preprocessing constraints": "preprocessing", "Algorithm families that fit": "algorithms",
                 "Likely unsuitable": "avoid", "Open gaps": "gaps"},
}


def issue_to_fields(kind, form, tax):
    P = {p["key"]: p for p in tax["properties"]}
    f = {}
    for label, key in ISSUE_FIELDS[kind].items():
        if form.get(label):
            f[key] = form[label].strip()
    if kind == "application":
        doms = {d["code"]: d["label"] for d in tax["domains"]}
        d = _codes(form.get("Domain", ""), doms)
        f["domain"] = d[0] if d else None
        props = {}
        for k, p in P.items():
            allowed = {v["code"]: v["label"] for v in p["values"]}
            vs = _codes(form.get(p["label"], ""), allowed)
            props[k] = vs if p.get("multi") else (vs[0] if vs else None)
        f["properties"] = props
        ev = form.get("Evidence", "")
        if ev:
            f["evidence"] = {"general": [{"source": line.strip("- ").strip()} for line in ev.splitlines() if line.strip()]}
    elif kind == "dataset":
        DSP = {p["key"]: {v["code"]: v["label"] for v in p["values"]} for p in tax["dsprops"]}
        for label, key, tk in (("Readiness tier", "tier", "tier"), ("Labels", "labels", "lab"), ("Anomaly origin", "anomaly_origin", "real")):
            v = _codes(form.get(label, ""), DSP[tk])
            f[key] = v[0] if v else None
        f["annotations"] = _codes(form.get("Annotations", ""), DSP["ann"])
        f["modality"] = _codes(form.get("Data modality", ""), {v["code"]: v["label"] for v in P["mod"]["values"]})
        f["applications"] = re.findall(r"\b[A-Z]{3}-\d{3,}\b", form.get("Applications", ""))
        if f.get("year"):
            m = re.search(r"\d{4}", f["year"])
            f["year"] = m.group(0) if m else None
    else:
        txt = form.get("Rule (YAML)", "")
        txt = re.sub(r"^```\w*\s*|\s*```$", "", txt.strip())
        try:
            rule = L.yaml.load(txt, Loader=L._Loader) if txt else None
        except Exception:
            rule = None
        f["rule"] = rule if isinstance(rule, list) else None
    return f


def cmd_issue(args):
    tax, recs, meta = L.load_all()
    body = open(args.body_file, encoding="utf-8").read()
    form = parse_issue_form(body)
    fields = issue_to_fields(args.kind, form, tax)
    fields["note"] = f"Proposed in issue #{args.number}" + (f" by @{args.author}" if args.author else "") + "; not yet reviewed."
    rec = template(args.kind, tax, recs, fields=fields)
    folder = {"application": "applications", "dataset": "datasets", "scenario": "scenarios"}[args.kind]
    path = os.path.join(L.DATA, folder, rec["id"] + ".yaml")
    with open(path, "w", encoding="utf-8") as f:
        f.write(render(args.kind, rec, tax))
    tax2, recs2, _ = L.load_all()
    pb = L.validate(tax2, recs2)
    mine = [x for x in pb.errors if x[1].endswith(rec["id"] + ".yaml")]
    with open(args.summary or os.devnull, "w", encoding="utf-8") as f:
        f.write(json.dumps({"id": rec["id"], "path": os.path.relpath(path, L.ROOT), "name": rec["name"],
                            "errors": [m for _, _, _, m in mine]}))
    print(f"Wrote {os.path.relpath(path, L.ROOT)} with {len(mine)} validation error(s).")
    return 0


# ---------------------------------------------------------------- review batches from the website

FOLDERS = {"application": "applications", "dataset": "datasets", "scenario": "scenarios"}


def _kind_of(rid):
    if re.match(r"^[A-Z]{3}-\d+$", rid):
        return "application"
    if re.match(r"^D\d+$", rid):
        return "dataset"
    if re.match(r"^S\d+$", rid):
        return "scenario"
    return None


def _source_entry(text):
    text = str(text).strip()[:500]
    m = re.search(r"https?://\S+", text)
    if not m:
        return {"source": text}
    url = m.group(0).rstrip(").,;")
    rest = (text[:m.start()] + text[m.end():]).strip(" -·,;")
    return {"source": rest or url, "url": url}


def parse_review_batch(body):
    form = parse_issue_form(body)
    txt = form.get("Reviews", body or "")
    txt = re.sub(r"^```\w*\s*|\s*```\s*$", "", txt.strip())
    try:
        data = L.yaml.load(txt, Loader=L._Loader)
    except Exception as e:
        raise ValueError(f"The reviews block is not valid YAML: {e}")
    if isinstance(data, dict):
        data = data.get("reviews")
    if not isinstance(data, list):
        raise ValueError("The reviews block must be a list of entries.")
    out = []
    for x in data[:500]:
        if isinstance(x, dict) and x.get("id"):
            out.append({"id": str(x["id"]).strip(), "verdict": str(x.get("verdict", "")).strip(),
                        "sources": [str(s) for s in (x.get("sources") or []) if str(s).strip()][:10],
                        "note": str(x.get("note") or "").strip()[:2000]})
    return out


def apply_reviews(entries, author, number, tax):
    done, unknown, changed = [], [], []
    for e in entries:
        kind = _kind_of(e["id"])
        path = os.path.join(L.DATA, FOLDERS.get(kind, "_"), e["id"] + ".yaml") if kind else None
        if not path or not os.path.exists(path) or e["verdict"] not in ("correct", "needs-fix"):
            unknown.append(e["id"])
            continue
        rec = L.read_yaml(path)
        rv = rec.setdefault("review", {"status": "draft", "reviewers": []})
        srcs = [_source_entry(s) for s in e["sources"]]
        if e["verdict"] == "correct":
            rv["status"] = "reviewed"
            rv["reviewers"] = list(dict.fromkeys((rv.get("reviewers") or []) + [author]))
            if srcs:
                ev = rec.get("evidence") or {}
                have = {json.dumps(x, sort_keys=True) for x in ev.get("general", [])}
                ev["general"] = (ev.get("general") or []) + [x for x in srcs if json.dumps(x, sort_keys=True) not in have]
                rec["evidence"] = ev
            rv["note"] = e["note"] or f"Reviewed by @{author} in #{number}."
        else:
            c = {"by": author, "note": e["note"] or "Flagged without a note.", "issue": int(number)}
            if srcs:
                c["sources"] = srcs
            rv["concerns"] = (rv.get("concerns") or []) + [c]
        # keep a stable key order: review last
        rec = {k: v for k, v in rec.items() if k != "review"} | {"review": rv}
        if "evidence" in rec and kind != "application":
            order = [k for k in rec if k not in ("evidence", "review")]
            rec = {k: rec[k] for k in order} | {"evidence": rec["evidence"], "review": rv}
        with open(path, "w", encoding="utf-8") as f:
            f.write(render(kind, rec, tax))
        done.append((e["id"], e["verdict"]))
        changed.append(os.path.relpath(path, L.ROOT))
    return done, unknown, changed


def cmd_apply_reviews(args):
    tax, _, _ = L.load_all()
    body = open(args.body_file, encoding="utf-8").read()
    try:
        entries = parse_review_batch(body)
        done, unknown, changed = apply_reviews(entries, args.author, args.number, tax)
        err = ""
    except ValueError as e:
        done, unknown, changed, err = [], [], [], str(e)
    tax2, recs2, _ = L.load_all()
    pb = L.validate(tax2, recs2)
    ok = sum(1 for _, v in done if v == "correct")
    lines = [f"Reviews from @{args.author} in #{args.number}: {ok} marked correct, {len(done) - ok} flagged."]
    if unknown:
        lines.append(f"Skipped (unknown id or verdict): {', '.join(unknown[:30])}.")
    if err:
        lines.append(f"Could not read the batch: {err}")
    if pb.errors:
        lines.append(f"{len(pb.errors)} validation error(s) after applying; see the checks.")
    flagged = [i for i, v in done if v == "needs-fix"]
    if flagged:
        lines.append("Flagged entries: " + ", ".join(flagged[:50]) + ".")
    summary = {"n": len(done), "correct": ok, "flagged": len(done) - ok, "paths": "\n".join(changed), "text": "\n\n".join(lines)}
    if args.summary:
        with open(args.summary, "w", encoding="utf-8") as f:
            json.dump(summary, f)
    print(summary["text"])
    return 0 if not err else 1


# ---------------------------------------------------------------- issue forms generated from the taxonomy

def _form_yaml(name, description, title, labels, body):
    return L.dump_yaml({"name": name, "description": description, "title": title, "labels": labels, "body": body},
                       header="Generated by `python scripts/atlas.py forms` from data/taxonomy. Do not edit by hand.")


def _md(text):
    return {"type": "markdown", "attributes": {"value": text}}


def _input(label, desc, required=False, placeholder="", multiline=False, fid=None):
    o = {"type": "textarea" if multiline else "input"}
    if fid:
        o["id"] = fid
    o["attributes"] = {"label": label, "description": desc}
    if placeholder:
        o["attributes"]["placeholder"] = placeholder
    o["validations"] = {"required": required}
    return o


def _dropdown(label, desc, options, required=True):
    return {"type": "dropdown", "attributes": {"label": label, "description": desc, "options": options}, "validations": {"required": required}}


def _checks(label, desc, options):
    return {"type": "checkboxes", "attributes": {"label": label, "description": desc, "options": [{"label": o} for o in options]}}


def build_forms(tax):
    P = {p["key"]: p for p in tax["properties"]}
    opt = lambda p: [f"{v['label']} ({v['code']})" for v in p["values"]]
    DSP = {p["key"]: p for p in tax["dsprops"]}
    app_body = [_md("Propose an application of anomaly detection. A maintainer checks the proposal, adds the `accepted` label, and a workflow opens a pull request with the file. You can also [write the file directly](../tree/main/data/applications)."),
                _input("Name", "Short name, as practitioners would say it.", True, "Card-present (POS) fraud"),
                _dropdown("Domain", "The field the application comes from.", [f"{d['label']} ({d['code']})" for d in tax["domains"]]),
                _input("Subdomain", "A finer area within the domain.", True, "Payments & cards"),
                _input("Description", "Two or three sentences: what is scored, what counts as an anomaly, who acts on it.", True, multiline=True)]
    for k, p in P.items():
        desc = p["desc"] + (" Tick every value that applies; the most important first in the description if it matters." if p.get("multi") else "")
        app_body.append(_checks(p["label"], desc, opt(p)) if p.get("multi") else _dropdown(p["label"], desc, opt(p)))
    app_body += [_input("Evidence", "Sources that support the coding: papers, standards, operator reports. One per line, with section or page.", True, multiline=True),
                 _input("Datasets", "Public datasets for this application, if any (names or links).", multiline=True)]
    ds_body = [_md("Propose a dataset. Link it to the applications it comes from (their ids are shown on the site, for example `FIN-001`), because scenario membership is derived from them."),
               _input("Name", "", True), _input("Year", "Year of the paper or release.", placeholder="2024"),
               _input("Dataset page", "Where the data can be downloaded.", True, "https://"),
               _dropdown("Readiness tier", DSP["tier"].get("label", ""), opt(DSP["tier"])),
               _dropdown("Labels", "How complete the anomaly labels are.", opt(DSP["lab"])),
               _dropdown("Anomaly origin", "Whether the anomalies are real, injected or simulated.", opt(DSP["real"])),
               _checks("Annotations", "What the labels say beyond normal or anomalous.", opt(DSP["ann"])),
               _checks("Data modality", "The form of the data.", opt(P["mod"])),
               _input("Applications", "Ids of the applications this dataset comes from, most representative first.", True, "MFG-159, MFG-161"),
               _input("Size", "Samples, channels, duration or number of sub-datasets.", placeholder="12 machines, 3 months at 1 Hz"),
               _input("Description", "What the data is, where it comes from and how anomalies are labeled.", True, multiline=True)]
    sc_body = [_md("Propose a scenario: a group of applications that share the structural properties deciding which algorithms, metrics and protocols fit. The rule is written in the same YAML as the scenario files; see any file in `data/scenarios` or use the scenario builder on the site, which writes the rule for you."),
               _input("Name", "", True), _input("Family", "An existing family name from the site, or a new one.", True, "Sequential monitoring"),
               _input("Summary", "What the member applications have in common.", True, multiline=True),
               {"type": "textarea", "attributes": {"label": "Rule (YAML)", "description": "One or more clauses; an application is a member if it matches any clause.", "render": "yaml",
                "value": "- match:\n    pt: {in: [on]}\n    mod: {any: [mts, sig]}\n  datasets_need: []\n"}, "validations": {"required": True}}]
    for lab in ("Metrics", "Evaluation protocol", "Preprocessing constraints", "Algorithm families that fit", "Likely unsuitable", "Open gaps"):
        sc_body.append(_input(lab, "", lab == "Metrics", multiline=True))
    change = [_md("Point out something that is wrong or missing. Corrections backed by a source are merged fastest."),
              _input("Record", "The id and name shown on the site, for example `S07 Video event anomaly detection`.", True, fid="record"),
              _input("What is wrong", "", True, multiline=True), _input("Proposed change", "", True, multiline=True),
              _input("Evidence", "Papers, documentation or experience that support the change.", True, multiline=True)]
    return {
        "new-application.yml": _form_yaml("Propose an application", "Add an anomaly detection application to the atlas.", "[New application] ", ["new application"], app_body),
        "new-dataset.yml": _form_yaml("Propose a dataset", "Add a dataset and link it to applications.", "[New dataset] ", ["new dataset"], ds_body),
        "new-scenario.yml": _form_yaml("Propose a scenario", "Add a benchmark scenario defined by a rule over structural properties.", "[New scenario] ", ["new scenario"], sc_body),
        "review.yml": _form_yaml("Send reviews", "Verdicts from the Review tab of the website, sent as one batch.", "Review: ", ["review"], [
            _md("This form is filled in by the **Review** tab of the website. Check the list below and select **Create**. A workflow turns it into one pull request; a maintainer merges it."),
            {"type": "textarea", "id": "reviews", "attributes": {"label": "Reviews", "description": "One line per entry, as written by the website.", "render": "yaml"},
             "validations": {"required": True}}]),
        "change-request.yml": _form_yaml("Request a correction", "Something in an application, dataset, scenario or the taxonomy is wrong.", "[Correction] ", ["change request"], change),
    }


def cmd_forms(args):
    tax, _, _ = L.load_all()
    d = os.path.join(L.ROOT, ".github", "ISSUE_TEMPLATE")
    os.makedirs(d, exist_ok=True)
    stale = []
    for name, text in build_forms(tax).items():
        path = os.path.join(d, name)
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != text:
            stale.append(name)
            if not args.check:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
    if args.check and stale:
        for n in stale:
            print(f"::warning file=.github/ISSUE_TEMPLATE/{n}::Issue form is out of date with the taxonomy; run `python scripts/atlas.py forms`.")
        return 1
    print("Issue forms up to date." if not stale else f"Wrote {', '.join(stale)}.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    b = sub.add_parser("build")
    b.add_argument("--out", default="_site")
    r = sub.add_parser("report")
    r.add_argument("--base", required=True, help="path to a checkout of the base branch")
    r.add_argument("--out")
    n = sub.add_parser("new")
    n.add_argument("kind", choices=["application", "dataset", "scenario"])
    n.add_argument("domain", nargs="?")
    n.add_argument("--write", action="store_true")
    i = sub.add_parser("issue")
    i.add_argument("--body-file", required=True)
    i.add_argument("--kind", required=True, choices=["application", "dataset", "scenario"])
    i.add_argument("--number", required=True)
    i.add_argument("--author")
    i.add_argument("--summary")
    ar = sub.add_parser("apply-reviews")
    ar.add_argument("--body-file", required=True)
    ar.add_argument("--author", required=True)
    ar.add_argument("--number", required=True)
    ar.add_argument("--summary")
    fo = sub.add_parser("forms")
    fo.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    return {"apply-reviews": cmd_apply_reviews, "forms": cmd_forms, "check": cmd_check, "build": cmd_build, "report": cmd_report, "new": cmd_new, "issue": cmd_issue}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
