"""Shared code for the atlas: loading the YAML records, validating them, deriving every number, writing YAML.

Everything the website shows is computed here from the files under data/. Nothing derived is stored in the
repository, so a pull request only ever changes primary facts (property codings, rules, links, evidence), and
the effect of that change on every count can be recomputed by anyone with `python scripts/atlas.py report`.
"""
from __future__ import annotations

import json
import os
import re
from collections import OrderedDict

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
KINDS = {"applications": "application", "datasets": "dataset", "scenarios": "scenario"}
REVIEW_STATUS = ("draft", "reviewed")
RULE_OPS_SINGLE = ("in",)
RULE_OPS_MULTI = ("any", "all", "first", "none")
MULTIMOD = "@multimod"
PROP_ALIASES = {}  # reserved for renamed properties


# ---------------------------------------------------------------- YAML in

class _Loader(yaml.SafeLoader):
    """YAML 1.2 style booleans only: codes such as `no` (no adversary) or `on` (online) stay strings."""


_Loader.yaml_implicit_resolvers = {k: [r for r in v if r[0] != "tag:yaml.org,2002:bool"]
                                   for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()}
_Loader.add_implicit_resolver("tag:yaml.org,2002:bool", re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"),
                              list("tTfF"))


def read_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.load(f, Loader=_Loader)


# ---------------------------------------------------------------- YAML out

_PLAIN_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.,()/+&'%-]*$")
_RESERVED = {"true", "false", "null", "yes", "no", "on", "off", "y", "n", "~"}


def _scalar(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    if (_PLAIN_OK.match(s) and s.lower() not in _RESERVED and not re.match(r"^[\d.+-]", s)
            and not s.endswith(" ") and ": " not in s and " #" not in s):
        return s
    return json.dumps(s, ensure_ascii=False)


def _flowable(lst):
    return all(not isinstance(x, (dict, list)) for x in lst) and sum(len(_scalar(x)) + 2 for x in lst) < 90


def dump_yaml(obj, header=None, comments=None):
    """Block-style YAML with short scalar lists in flow style and optional `# comment` after chosen keys.

    comments maps a dotted key path (e.g. "properties.mod") to a comment string."""
    comments = comments or {}
    out = []
    if header:
        out += [("# " + line).rstrip() for line in header.strip().splitlines()]

    def emit(o, ind, path):
        pad = "  " * ind
        for k, v in o.items():
            p = f"{path}.{k}" if path else k
            c = f"  # {comments[p]}" if p in comments else ""
            if isinstance(v, dict):
                if not v:
                    out.append(f"{pad}{k}: {{}}{c}")
                else:
                    out.append(f"{pad}{k}:{c}")
                    emit(v, ind + 1, p)
            elif isinstance(v, list):
                if not v:
                    out.append(f"{pad}{k}: []{c}")
                elif _flowable(v):
                    out.append(f"{pad}{k}: [{', '.join(_scalar(x) for x in v)}]{c}")
                else:
                    out.append(f"{pad}{k}:{c}")
                    emit_list(v, ind + 1, p)
            else:
                out.append(f"{pad}{k}: {_scalar(v)}{c}")

    def emit_list(lst, ind, path):
        pad = "  " * ind
        for x in lst:
            if isinstance(x, dict) and x:
                first = True
                for k, v in x.items():
                    lead = f"{pad}- " if first else f"{pad}  "
                    first = False
                    if isinstance(v, (dict, list)) and v and not (isinstance(v, list) and _flowable(v)):
                        out.append(f"{lead}{k}:")
                        (emit if isinstance(v, dict) else emit_list)(v, ind + 2, path)
                    elif isinstance(v, list):
                        out.append(f"{lead}{k}: [{', '.join(_scalar(y) for y in v)}]")
                    elif isinstance(v, dict):
                        out.append(f"{lead}{k}: {{}}")
                    else:
                        out.append(f"{lead}{k}: {_scalar(v)}")
            elif isinstance(x, list):
                out.append(f"{pad}- [{', '.join(_scalar(y) for y in x)}]" if _flowable(x) else f"{pad}- []")
            else:
                out.append(f"{pad}- {_scalar(x)}")

    emit(obj, 0, "")
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------- loading

class Problems:
    """Collects validation errors and warnings with file and line, printed as GitHub annotations in CI."""

    def __init__(self):
        self.items = []

    def add(self, level, path, msg, key=None):
        self.items.append((level, os.path.relpath(path, ROOT) if path else "", _line_of(path, key), msg))

    def error(self, path, msg, key=None):
        self.add("error", path, msg, key)

    def warning(self, path, msg, key=None):
        self.add("warning", path, msg, key)

    @property
    def errors(self):
        return [x for x in self.items if x[0] == "error"]

    def print(self, warnings=True):
        gha = os.environ.get("GITHUB_ACTIONS") == "true"
        for level, path, line, msg in self.items:
            if level == "warning" and not warnings:
                continue
            if gha:
                loc = f" file={path}" + (f",line={line}" if line else "") if path else ""
                print(f"::{level}{loc}::{msg}")
            else:
                print(f"{level.upper()}: {path}{':' + str(line) if line else ''}: {msg}")


def _line_of(path, key):
    if not path or not key or not os.path.exists(path):
        return None
    pat = re.compile(r"^\s*-?\s*" + re.escape(key.split(".")[-1]) + r"\s*:")
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            if pat.match(line):
                return i
    return None


def load_taxonomy(root=None):
    tdir = os.path.join(root or DATA, "taxonomy")
    props = read_yaml(os.path.join(tdir, "properties.yaml"))["properties"]
    dsprops = read_yaml(os.path.join(tdir, "dataset-properties.yaml"))["properties"]
    domains = read_yaml(os.path.join(tdir, "domains.yaml"))["domains"]
    return {"properties": props, "dsprops": dsprops, "domains": domains}


def _num(rec_id):
    m = re.search(r"(\d+)$", str(rec_id))
    return int(m.group(1)) if m else 10 ** 9


def load_records(root=None):
    """Returns {kind: [(path, record), ...]} sorted by the number in the id."""
    base = root or DATA
    out = {}
    for kind in KINDS:
        d = os.path.join(base, kind)
        files = sorted(f for f in os.listdir(d) if f.endswith((".yaml", ".yml"))) if os.path.isdir(d) else []
        recs = []
        for f in files:
            p = os.path.join(d, f)
            try:
                r = read_yaml(p)
            except yaml.YAMLError as e:
                recs.append((p, {"__error__": f"YAML syntax error: {e}"}))
                continue
            recs.append((p, r if isinstance(r, dict) else {"__error__": "file must contain a YAML mapping"}))
        recs.sort(key=lambda pr: (_num(pr[1].get("id")), pr[0]))
        out[kind] = recs
    return out


# ---------------------------------------------------------------- validation

def _is_url(u):
    return isinstance(u, str) and re.match(r"^https?://\S+$", u) is not None


def validate(tax, recs):
    pb = Problems()
    P = {p["key"]: p for p in tax["properties"]}
    codes = {k: [v["code"] for v in p["values"]] for k, p in P.items()}
    DSP = {p["key"]: [v["code"] for v in p["values"]] for p in tax["dsprops"]}
    doms = [d["code"] for d in tax["domains"]]
    ids = {}

    def need_text(path, r, key):
        if not isinstance(r.get(key), str) or not r[key].strip():
            pb.error(path, f"`{key}` is required and must be text.", key)

    def check_refs(path, r):
        for i, ref in enumerate(r.get("references") or []):
            if not isinstance(ref, dict) or not isinstance(ref.get("citation"), str):
                pb.error(path, f"references[{i}] needs a `citation` text.", "references")
            elif ref.get("url") and not _is_url(ref["url"]):
                pb.error(path, f"references[{i}].url is not an http(s) address.", "references")

    def check_review(path, r):
        rv = r.get("review")
        if not isinstance(rv, dict) or rv.get("status") not in REVIEW_STATUS:
            pb.error(path, f"`review.status` must be one of {', '.join(REVIEW_STATUS)}.", "review")
            return
        if rv["status"] == "reviewed" and not rv.get("reviewers"):
            pb.error(path, "A reviewed record must list at least one GitHub handle under `review.reviewers`.", "reviewers")

    def check_id(path, r, kind, pattern, example):
        rid = r.get("id")
        stem = os.path.splitext(os.path.basename(path))[0]
        if not isinstance(rid, str) or not re.match(pattern, rid):
            pb.error(path, f"`id` must look like {example}.", "id")
            return None
        if stem != rid:
            pb.error(path, f"The file name must be `{rid}.yaml` to match the id.", "id")
        if rid in ids:
            pb.error(path, f"Duplicate id {rid}; also used in {os.path.relpath(ids[rid], ROOT)}.", "id")
        ids[rid] = path
        return rid

    for kind, lst in recs.items():
        for path, r in lst:
            if "__error__" in r:
                pb.error(path, r["__error__"])

    apps = [(p, r) for p, r in recs["applications"] if "__error__" not in r]
    dss = [(p, r) for p, r in recs["datasets"] if "__error__" not in r]
    scs = [(p, r) for p, r in recs["scenarios"] if "__error__" not in r]
    nums = {}
    for path, r in apps:
        rid = check_id(path, r, "application", r"^[A-Z]{3}-\d{3,}$", "FIN-001 (domain code, dash, number)")
        if rid:
            n = _num(rid)
            if n in nums:
                pb.error(path, f"The number in {rid} is already used by {nums[n]}; application numbers are unique across domains.", "id")
            nums[n] = rid
        for key in ("name", "description", "subdomain"):
            need_text(path, r, key)
        if r.get("domain") not in doms:
            pb.error(path, f"`domain` must be one of {', '.join(doms)}.", "domain")
        elif rid and not rid.startswith(r["domain"] + "-"):
            pb.error(path, f"The id prefix must be the domain code {r['domain']}.", "id")
        props = r.get("properties")
        if not isinstance(props, dict):
            pb.error(path, "`properties` must be a mapping of property codes.", "properties")
            props = {}
        for k in props:
            if k not in P:
                pb.error(path, f"Unknown property `{k}`. Known: {', '.join(P)}.", k)
        for k, p in P.items():
            v = props.get(k)
            label = p["label"]
            if p.get("multi"):
                if v is None:
                    v = []
                if not isinstance(v, list):
                    pb.error(path, f"`{k}` ({label}) must be a list, for example [{codes[k][0]}].", k)
                    continue
                bad = [x for x in v if x not in codes[k]]
                if bad:
                    pb.error(path, f"`{k}` ({label}) has unknown value(s) {', '.join(map(str, bad))}. Allowed: {', '.join(codes[k])}.", k)
                if len(set(map(str, v))) != len(v):
                    pb.error(path, f"`{k}` ({label}) lists a value twice.", k)
                if not v and not p.get("may_be_empty"):
                    pb.error(path, f"`{k}` ({label}) needs at least one value.", k)
            else:
                if v not in codes[k]:
                    pb.error(path, f"`{k}` ({label}) must be one of {', '.join(codes[k])}; got {v!r}.", k)
        ev = r.get("evidence") or {}
        if not isinstance(ev, dict):
            pb.error(path, "`evidence` must map property codes to lists of sources.", "evidence")
            ev = {}
        for k, items in ev.items():
            if k not in P and k != "general":
                pb.error(path, f"evidence for unknown property `{k}`.", "evidence")
            for i, it in enumerate(items if isinstance(items, list) else [None]):
                if not isinstance(it, dict) or not (it.get("source") or it.get("url")):
                    pb.error(path, f"evidence.{k}[{i}] needs a `source` (citation or DOI) or a `url`.", "evidence")
                elif it.get("url") and not _is_url(it["url"]):
                    pb.error(path, f"evidence.{k}[{i}].url is not an http(s) address.", "evidence")
        check_refs(path, r)
        check_review(path, r)

    app_ids = {r.get("id") for _, r in apps}
    sc_ids = {r.get("id") for _, r in scs}
    for path, r in dss:
        check_id(path, r, "dataset", r"^D\d{3,}$", "D123")
        for key in ("name", "description"):
            need_text(path, r, key)
        if r.get("year") is not None and not re.match(r"^\d{4}$", str(r["year"])):
            pb.error(path, "`year` must be a four-digit year.", "year")
        for key, tk in (("tier", "tier"), ("labels", "lab"), ("anomaly_origin", "real")):
            if r.get(key) not in DSP[tk]:
                pb.error(path, f"`{key}` must be one of {', '.join(DSP[tk])}; got {r.get(key)!r}.", key)
        ann = r.get("annotations") or []
        if not isinstance(ann, list) or any(a not in DSP["ann"] for a in ann):
            pb.error(path, f"`annotations` must be a list drawn from {', '.join(DSP['ann'])}.", "annotations")
        mod = r.get("modality")
        if not isinstance(mod, list) or not mod or any(m not in codes["mod"] for m in mod):
            pb.error(path, f"`modality` must be a non-empty list drawn from {', '.join(codes['mod'])}.", "modality")
        la = r.get("applications") or []
        if not isinstance(la, list):
            pb.error(path, "`applications` must be a list of application ids.", "applications")
            la = []
        for a in la:
            if a not in app_ids:
                pb.error(path, f"`applications` refers to {a}, which does not exist.", "applications")
        if len(set(la)) != len(la):
            pb.error(path, "`applications` lists an id twice.", "applications")
        for s in r.get("extra_scenarios") or []:
            if s not in sc_ids:
                pb.error(path, f"`extra_scenarios` refers to {s}, which does not exist.", "extra_scenarios")
        if r.get("extra_scenarios") and r.get("tier") != "generic":
            pb.error(path, "`extra_scenarios` is only for generic collections; other datasets reach scenarios through their applications.", "extra_scenarios")
        links = r.get("links") or {}
        page = (links.get("page") or {}) if isinstance(links, dict) else {}
        if page.get("url") and not _is_url(page["url"]):
            pb.error(path, "`links.page.url` is not an http(s) address.", "url")
        for i, l in enumerate(links.get("other") or [] if isinstance(links, dict) else []):
            if not isinstance(l, dict) or not l.get("label") or not _is_url(l.get("url")):
                pb.error(path, f"links.other[{i}] needs a `label` and an http(s) `url`.", "other")
        if not la and r.get("tier") != "generic":
            pb.warning(path, "This dataset is not linked to any application, so it reaches no scenario.", "applications")
        check_refs(path, r)
        check_review(path, r)

    for path, r in scs:
        check_id(path, r, "scenario", r"^S\d{2,}$", "S12")
        for key in ("name", "family", "summary", "metrics", "protocol", "preprocessing", "algorithms", "avoid", "gaps"):
            need_text(path, r, key)
        rule = r.get("rule")
        if not isinstance(rule, list) or not rule:
            pb.error(path, "`rule` must be a list with at least one clause.", "rule")
            continue
        for ci, cl in enumerate(rule):
            if not isinstance(cl, dict) or not isinstance(cl.get("match"), dict) or not cl["match"]:
                pb.error(path, f"rule[{ci}] needs a non-empty `match` mapping.", "match")
                continue
            for k, cond in cl["match"].items():
                if k not in P:
                    pb.error(path, f"rule[{ci}] uses unknown property `{k}`.", k)
                    continue
                if not isinstance(cond, dict) or not cond:
                    pb.error(path, f"rule[{ci}].{k} must name an operator, e.g. {{any: [{codes[k][0]}]}}.", k)
                    continue
                allowed = RULE_OPS_MULTI if P[k].get("multi") else RULE_OPS_SINGLE
                for op, vs in cond.items():
                    if op not in allowed:
                        pb.error(path, f"rule[{ci}].{k}: operator `{op}` is not allowed here; use {' or '.join(allowed)}.", k)
                    if not isinstance(vs, list) or not vs or any(v not in codes[k] for v in vs):
                        pb.error(path, f"rule[{ci}].{k}.{op}: values must be a non-empty list drawn from {', '.join(codes[k])}.", k)
            for gi, alts in enumerate(cl.get("datasets_need") or []):
                if not isinstance(alts, list) or not alts or any(a not in DSP["ann"] + [MULTIMOD] for a in alts):
                    pb.error(path, f"rule[{ci}].datasets_need[{gi}] must list annotation codes ({', '.join(DSP['ann'])}) or {MULTIMOD}.", "datasets_need")
        check_review(path, r)
    return pb


# ---------------------------------------------------------------- derivation

def _vals(app, k, single):
    v = app["properties"].get(k)
    if k in single:
        return [v] if v not in (None, "") else []
    return list(v or [])


def _op(vs, op, arg):
    if op in ("in", "any"):
        return any(v in arg for v in vs)
    if op == "all":
        return all(a in vs for a in arg)
    if op == "first":
        return bool(vs) and vs[0] in arg
    if op == "none":
        return not any(v in arg for v in vs)
    raise ValueError(op)


def _cond(vs, cond):
    """A condition is one or more operators on one property; all of them must hold."""
    return all(_op(vs, op, arg) for op, arg in cond.items())


def derive(tax, recs, meta):
    """Turns the records into the catalog the site renders. Every count on the site comes from here."""
    single = {p["key"] for p in tax["properties"] if not p.get("multi")}
    apps = [r for _, r in recs["applications"]]
    dss = [r for _, r in recs["datasets"]]
    scs = [r for _, r in recs["scenarios"]]
    A = {a["id"]: a for a in apps}

    def clause_ok(a, cl):
        return all(_cond(_vals(a, k, single), c) for k, c in cl["match"].items())

    def mod_ok(d, cl):
        """A dataset fits a clause's modality condition if it has one of the named modalities (any order)."""
        c = cl["match"].get("mod")
        if not c:
            return True
        return all(_op(d["modality"], "any" if op == "first" else op, arg) for op, arg in c.items())

    def needs_ok(d, groups):
        for alts in groups:
            if not any((len(d["modality"]) >= 2) if c == MULTIMOD else (c in (d.get("annotations") or [])) for c in alts):
                return False
        return True

    def counted(d):
        return d["tier"] != "generic" and d["labels"] != "none"

    out_apps, out_ds, out_sc = [], [], []
    app_ds_all = {}
    for d in dss:
        for i in d.get("applications") or []:
            app_ds_all.setdefault(i, []).append(d["id"])
    members = {s["id"]: [a["id"] for a in apps if any(clause_ok(a, cl) for cl in s["rule"])] for s in scs}
    app_scen = {a["id"]: [s["id"] for s in scs if a["id"] in set(members[s["id"]])] for a in apps}
    ds_scen, ds_scend = {d["id"]: [] for d in dss}, {d["id"]: [] for d in dss}
    for s in scs:
        mem = set(members[s["id"]])
        q, lack = [], []
        for d in dss:
            explicit = s["id"] in (d.get("extra_scenarios") or [])
            linked = [A[i] for i in (d.get("applications") or []) if i in mem]
            if not linked and not explicit:
                continue
            ok = False
            for cl in s["rule"]:
                if linked and not explicit and not any(clause_ok(a, cl) for a in linked):
                    continue
                if mod_ok(d, cl) and needs_ok(d, cl.get("datasets_need") or []):
                    ok = True
            if linked:
                ds_scend[d["id"]].append(s["id"])
            if ok:
                q.append(d)
                ds_scen[d["id"]].append(s["id"])
            elif counted(d):
                lack.append(d["id"])
        main = [d["id"] for d in q if counted(d)]
        main_set = set(main)
        out_sc.append({
            "id": s["id"], "family": s["family"], "paper": s.get("paper") or "", "name": s["name"], "summary": s["summary"],
            "rule": [cl["match"] for cl in s["rule"]],
            **{k: s[k] for k in ("metrics", "protocol", "preprocessing", "algorithms", "avoid", "gaps")},
            "members": members[s["id"]],
            "domains": sorted({A[i]["domain"] for i in members[s["id"]]}),
            "needs": [cl.get("datasets_need") or [] for cl in s["rule"]],
            "ds": main,
            "dsGeneric": [d["id"] for d in q if d["tier"] == "generic"],
            "dsUnlabeled": [d["id"] for d in q if d["tier"] != "generic" and d["labels"] == "none"],
            "dsLacking": lack,
            "appsWithData": [i for i in members[s["id"]] if main_set.intersection(app_ds_all.get(i, []))],
            "review": (s.get("review") or {}).get("status", "draft"),
            "_file": "data/scenarios/" + s["id"] + ".yaml",
        })
    app_ds = {a["id"]: [] for a in apps}
    for d in dss:
        for i in d.get("applications") or []:
            if i in app_ds:
                app_ds[i].append(d["id"])
    for a in apps:
        o = {"id": a["id"], "dom": a["domain"], "sub": a["subdomain"], "name": a["name"], "desc": a["description"]}
        for p in tax["properties"]:
            v = a["properties"].get(p["key"])
            o[p["key"]] = (list(v or []) if p.get("multi") else (v or ""))
        o["scen"] = app_scen[a["id"]]
        o["ds"] = app_ds[a["id"]]
        o["refs"] = [_ref_out(x) for x in a.get("references") or []]
        o["evidence"] = a.get("evidence") or {}
        o["review"] = (a.get("review") or {}).get("status", "draft")
        o["reviewers"] = (a.get("review") or {}).get("reviewers") or []
        o["_file"] = "data/applications/" + a["id"] + ".yaml"
        out_apps.append(o)
    for d in dss:
        links = d.get("links") or {}
        page = links.get("page") or {}
        o = {"id": d["id"], "name": d["name"], "year": str(d.get("year") or ""), "tier": d["tier"], "lab": d["labels"],
             "real": d["anomaly_origin"], "ann": list(d.get("annotations") or []), "mod": list(d["modality"]),
             "size": d.get("size") or "", "desc": d["description"], "url": page.get("url") or "",
             "chk": bool(page.get("url") and page.get("found_in_search")),
             "src": [[l["label"], l["url"]] for l in links.get("other") or []],
             "refs": [_ref_out(x) for x in d.get("references") or []],
             "apps": list(d.get("applications") or []), "scenx": list(d.get("extra_scenarios") or []),
             "dom": sorted({A[i]["domain"] for i in d.get("applications") or [] if i in A}),
             "scen": ds_scen[d["id"]], "counted": counted(d),
             "review": (d.get("review") or {}).get("status", "draft"),
             "_file": "data/datasets/" + d["id"] + ".yaml"}
        out_ds.append(o)
    taxonomy = {
        "properties": [{"key": p["key"], "label": p["label"], "multi": bool(p.get("multi")), "paper": p.get("paper") or "",
                        "desc": p["desc"], "values": [[v["code"], v["label"], v["desc"]] for v in p["values"]]}
                       for p in tax["properties"]],
        "domains": [[x["code"], x["label"]] for x in tax["domains"]],
        "dsprops": [{"key": p["key"], "label": p["label"], "values": [[v["code"], v["label"], v["desc"]] for v in p["values"]]}
                    for p in tax["dsprops"]],
    }
    return {"taxonomy": taxonomy, "apps": out_apps, "scenarios": out_sc, "datasets": out_ds, "paper": meta["paper"]}


def _ref_out(x):
    o = {"n": str(x.get("ref") or "").strip("[]"), "t": x.get("citation", ""), "c": x.get("context", "")}
    if x.get("url"):
        o["u"] = x["url"]
    return o


def stats(cat):
    apps, ds, sc = cat["apps"], cat["datasets"], cat["scenarios"]
    return OrderedDict([
        ("applications", len(apps)), ("domains", len(cat["taxonomy"]["domains"])), ("scenarios", len(sc)),
        ("datasets", len(ds)),
        ("applications_in_a_scenario", sum(1 for a in apps if a["scen"])),
        ("applications_with_a_dataset", sum(1 for a in apps if a["ds"])),
        ("datasets_counting_toward_scenarios", sum(1 for d in ds if d["counted"])),
        ("scenarios_with_at_least_3_datasets", sum(1 for s in sc if len(s["ds"]) >= 3)),
        ("datasets_with_a_direct_link", sum(1 for d in ds if d["url"] or d["src"])),
        ("reviewed_applications", sum(1 for a in apps if a["review"] == "reviewed")),
        ("reviewed_datasets", sum(1 for d in ds if d["review"] == "reviewed")),
        ("reviewed_scenarios", sum(1 for s in sc if s["review"] == "reviewed")),
        ("applications_with_evidence", sum(1 for a in apps if a["evidence"])),
    ])


def load_all(repo_root=None):
    """Loads taxonomy, records and atlas.yaml from a checkout (default: this one)."""
    root = repo_root or ROOT
    data = os.path.join(root, "data")
    return load_taxonomy(data), load_records(data), read_yaml(os.path.join(root, "atlas.yaml"))
