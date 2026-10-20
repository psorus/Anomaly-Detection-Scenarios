"""Tests for validation, derivation, the impact report and issue-form parsing. Run: python -m unittest discover -s tests"""
import io
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))
import atlas  # noqa: E402
import atlaslib as L  # noqa: E402


def copy_repo():
    d = tempfile.mkdtemp()
    shutil.copytree(os.path.join(L.ROOT, "data"), os.path.join(d, "data"))
    shutil.copy(os.path.join(L.ROOT, "atlas.yaml"), d)
    return d


def swap_pt(path, to=None):
    """Changes an application's processing time to a different valid code, whatever it is now."""
    with open(path, encoding="utf-8") as f:
        s = f.read()
    cur = L.read_yaml(path)["properties"]["pt"]
    new = to or next(c for c in ("bat", "on", "hrt") if c != cur)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s.replace(f"  pt: {cur}", f"  pt: {new}", 1))
    return cur, new


def edit(path, old, new):
    with open(path, encoding="utf-8") as f:
        s = f.read()
    assert old in s, (path, old)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s.replace(old, new, 1))


class TestAtlas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tax, cls.recs, cls.meta = L.load_all()
        cls.cat = L.derive(cls.tax, cls.recs, cls.meta)

    def test_repository_validates(self):
        self.assertEqual(L.validate(self.tax, self.recs).errors, [])

    def test_yaml_codes_are_not_booleans(self):
        self.assertEqual(L.yaml.load("adv: no\npt: on\nx: true", Loader=L._Loader), {"adv": "no", "pt": "on", "x": True})

    def test_every_application_matches_its_scenarios(self):
        A = {a["id"]: a for a in self.cat["apps"]}
        for s in self.cat["scenarios"]:
            self.assertTrue(s["members"], s["id"])
            for i in s["members"]:
                self.assertIn(s["id"], A[i]["scen"])

    def test_counted_datasets_qualify(self):
        D = {d["id"]: d for d in self.cat["datasets"]}
        for s in self.cat["scenarios"]:
            for i in s["ds"]:
                self.assertTrue(D[i]["counted"])
                self.assertIn(s["id"], D[i]["scen"])

    def test_validation_reports_bad_edits(self):
        d = copy_repo()
        try:
            swap_pt(os.path.join(d, "data/applications/FIN-001.yaml"), to="realtime")
            edit(os.path.join(d, "data/datasets/D295.yaml"), "applications: [AER-259]", "applications: [AER-999]")
            edit(os.path.join(d, "data/scenarios/S07.yaml"), "any: [vid]", "most: [vid]")
            shutil.copy(os.path.join(d, "data/applications/FIN-002.yaml"), os.path.join(d, "data/applications/FIN-9999.yaml"))
            tax, recs, _ = L.load_all(d)
            msgs = " | ".join(m for _, _, _, m in L.validate(tax, recs).errors)
            self.assertIn("realtime", msgs)
            self.assertIn("AER-999", msgs)
            self.assertIn("operator `most`", msgs)
            self.assertIn("file name must be `FIN-002.yaml`", msgs)
            self.assertIn("Duplicate id FIN-002", msgs)
        finally:
            shutil.rmtree(d)

    def test_rule_change_moves_members_and_report_shows_it(self):
        d = copy_repo()
        try:
            swap_pt(os.path.join(d, "data/applications/FIN-001.yaml"))
            tax, recs, meta = L.load_all(d)
            cat = L.derive(tax, recs, meta)
            before = {s["id"]: set(s["members"]) for s in self.cat["scenarios"]}
            after = {s["id"]: set(s["members"]) for s in cat["scenarios"]}
            self.assertNotEqual(before, after)
            out = io.StringIO()
            old_root = L.ROOT
            try:
                L.ROOT = d
                with redirect_stdout(out):
                    atlas.main(["report", "--base", old_root])
            finally:
                L.ROOT = old_root
            text = out.getvalue()
            self.assertIn("Edited **FIN-001**", text)
            self.assertIn("Scenario membership", text)
        finally:
            shutil.rmtree(d)

    def test_issue_form_becomes_valid_file(self):
        P = {p["key"]: p for p in self.tax["properties"]}
        parts = ["### Name\n\nPump cavitation detection", "### Domain\n\nManufacturing & industry (MFG)",
                 "### Subdomain\n\nPumps", "### Description\n\nVibration and acoustic monitoring of centrifugal pumps."]
        for k, p in P.items():
            first = p["values"][0]
            if p.get("multi"):
                opts = [f"- [{'X' if i == 0 else ' '}] {v['label']} ({v['code']})" for i, v in enumerate(p["values"])]
                parts.append(f"### {p['label']}\n\n" + "\n".join(opts))
            else:
                parts.append(f"### {p['label']}\n\n{first['label']} ({first['code']})")
        parts += ["### Evidence\n\nSmith (2020), Section 2", "### Datasets\n\n_No response_"]
        form = atlas.parse_issue_form("\n\n".join(parts))
        f = atlas.issue_to_fields("application", form, self.tax)
        rec = atlas.template("application", self.tax, self.recs, fields=f)
        self.assertTrue(rec["id"].startswith("MFG-"))
        d = copy_repo()
        try:
            path = os.path.join(d, "data/applications", rec["id"] + ".yaml")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(atlas.render("application", rec, self.tax))
            tax, recs, _ = L.load_all(d)
            self.assertEqual(L.validate(tax, recs).errors, [])
            self.assertEqual(L.read_yaml(path)["properties"]["mod"], [P["mod"]["values"][0]["code"]])
        finally:
            shutil.rmtree(d)

    def test_review_batch_is_applied(self):
        d = copy_repo()
        old = L.DATA
        try:
            L.DATA = os.path.join(d, "data")
            body = ('### Reviews\n\n```yaml\n'
                    '- {"id":"FIN-001","verdict":"correct","sources":["Smith (2020). A paper. https://doi.org/10.1/x"],"note":""}\n'
                    '- {"id":"S07","verdict":"needs-fix","sources":[],"note":"Too broad."}\n'
                    '- {"id":"NOPE-1","verdict":"correct","sources":[],"note":""}\n```\n')
            entries = atlas.parse_review_batch(body)
            done, unknown, _ = atlas.apply_reviews(entries, "someone", 5, self.tax)
            self.assertEqual(unknown, ["NOPE-1"])
            app = L.read_yaml(os.path.join(d, "data/applications/FIN-001.yaml"))
            self.assertEqual(app["review"]["status"], "reviewed")
            self.assertIn("someone", app["review"]["reviewers"])
            self.assertEqual(app["evidence"]["general"][-1]["url"], "https://doi.org/10.1/x")
            sc = L.read_yaml(os.path.join(d, "data/scenarios/S07.yaml"))
            self.assertEqual(sc["review"]["concerns"][-1]["note"], "Too broad.")
            tax, recs, _ = L.load_all(d)
            self.assertEqual(L.validate(tax, recs).errors, [])
        finally:
            L.DATA = old
            shutil.rmtree(d)

    def test_issue_forms_are_current(self):
        for name, text in atlas.build_forms(self.tax).items():
            path = os.path.join(L.ROOT, ".github", "ISSUE_TEMPLATE", name)
            with open(path, encoding="utf-8") as fh:
                self.assertEqual(fh.read(), text, name)


if __name__ == "__main__":
    unittest.main()
