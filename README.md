# Anomaly Detection Scenario Atlas

A community catalog of anomaly detection **applications**, the structural **properties** that decide which algorithms,
metrics and protocols fit them, **scenarios** defined by rules over those properties, and the **datasets** that can
evaluate each scenario. It implements the call to action of
[*We Need to Rethink Benchmarking in Anomaly Detection*](https://arxiv.org/abs/2507.15584) (arXiv 2507.15584):
benchmark per scenario, and agree on the scenarios together.

**Website:** https://OWNER.github.io/REPO/ (rebuilt from this repository after every merged pull request)

## How it works

```
data/                        primary facts, one small YAML file per record
  applications/FIN-001.yaml  how one application is coded, with evidence
  datasets/D295.yaml         one dataset: properties, links, the applications it comes from
  scenarios/S07.yaml         one scenario: its rule and evaluation guidance
  taxonomy/                  the properties and their allowed values
scripts/atlaslib.py          validation and the derivation of every number on the site
scripts/atlas.py             command line: check, build, report, new, issue, forms
site/                        the web page (HTML, CSS, JavaScript; no framework)
.github/workflows/           check pull requests, comment their impact, deploy the site, turn proposals into PRs
```

Only primary facts are stored. Scenario membership, dataset qualification and every count are computed by
`scripts/atlaslib.py`, so a number on the site can always be traced to the files and commits that produced it:

- an application belongs to a scenario if it matches any clause of the scenario's `rule`;
- a dataset qualifies for a scenario if one of its `applications` is a member (or, for generic collections, the
  scenario is listed under `extra_scenarios`), its modality fits the clause, and it has the annotations the clause
  lists under `datasets_need`;
- a qualifying dataset counts toward a scenario's minimum unless it is a generic collection or unlabeled.

Every pull request gets an automatic comment with the numbers that change, the applications that join or leave each
scenario, and the datasets that start or stop qualifying.

## Contributing

No local setup is needed. On the website, every scenario, application and dataset has **Edit on GitHub**,
**Discussions**, **Report a problem** and **History** buttons, and the **Contribute** tab has forms for new records.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the file format and [GOVERNANCE.md](GOVERNANCE.md) for how changes are
decided.

The initial content (447 applications, 442 datasets, 37 scenarios) was drafted with Claude (Anthropic) in October 2026
and is marked `review: {status: draft}` throughout. Reviewing records against sources, and recording that evidence, is
the most valuable contribution right now.

## Working locally

```bash
pip install -r requirements.txt
python scripts/atlas.py check                     # validate all files (what CI runs)
python scripts/atlas.py build --out _site         # build the site; open _site/index.html
python scripts/atlas.py report --base ../main-checkout   # what your branch changes, as Markdown
python scripts/atlas.py new application FIN --write      # new file with the next free id
python -m unittest discover -s tests
```

## Setting up the repository (maintainers, once)

1. Create the repository on GitHub and push this folder to `main`.
2. Run `scripts/setup_repository.sh OWNER/REPO @maintainer1 @maintainer2` with the GitHub CLI logged in. It fills
   in the repository name and code owners, creates the labels, enables Discussions and switches GitHub Pages to
   GitHub Actions. Commit and push the files it edited.
3. In the web interface: create the Discussions categories *Scenarios*, *Applications* and *Datasets*, and protect
   `main` (require the `check` status and one review; code owners for `data/scenarios/` and `data/taxonomy/`).
4. Optional: add a token as the secret `ATLAS_BOT_TOKEN` so pull requests opened from issue forms run checks.

## Citing

Cite the paper, and the tagged release of the atlas you used; its `catalog.json` (also on the website) contains the
commit and reproduces every number. See [CITATION.cff](CITATION.cff).

Code: MIT ([LICENSE](LICENSE)). Data: CC BY 4.0 ([LICENSE-DATA.md](LICENSE-DATA.md)).
