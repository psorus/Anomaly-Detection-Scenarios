# Contributing

Anyone with a GitHub account can change anything in the atlas. There are four ways, from least to most effort.

## 1. Discuss

Every record on the website links to its GitHub Discussions thread (search by id) and can start a new one. Use
Discussions for questions such as "should S07 require temporal localization?" or "is card-present fraud really hard
real-time?". Start the title with the record's id, for example `S07: drop the early-warning clause`.

## 2. Report a problem or propose a record with a form

The **Contribute** tab on the website and the repository's *New issue* page have forms for a new application, dataset
or scenario, and for corrections. A maintainer reviews the proposal and adds the `accepted` label; a workflow then
writes the YAML file and opens the pull request for you.

## 3. Edit a file in the browser

Click **Edit on GitHub** on any record. GitHub forks the repository, opens the file in its editor and turns your
commit into a pull request. Within a few minutes the checks run and a bot comments with what your change does:
numbers that change, applications that join or leave scenarios, datasets that start or stop qualifying. If a check
fails, the *Files changed* tab marks the exact line.

## 4. Work locally

`pip install -r requirements.txt`, then `python scripts/atlas.py check` and `build`; see the README.

## The files

All codes are defined in `data/taxonomy/`. The checks reject unknown codes and list the allowed ones.

### Applications: `data/applications/<ID>.yaml`

```yaml
id: FIN-001                 # domain code + number; the number is unique across all domains
name: Card-present (POS) fraud
domain: FIN
subdomain: Payments & cards
description: In-store card transactions scored at authorization. ...
properties:                 # every property in data/taxonomy/properties.yaml
  mod: [tab, st]            # multi-valued: a list, most important first
  pt: hrt                   # single-valued: one code
  ...
evidence:                   # property code (or `general`) -> sources supporting that coding
  pt:
    - source: "Author et al. (2024). Title. Venue, Section 3."
      url: "https://doi.org/..."
      note: "Authorization decisions within 100 ms."
references: []              # papers that describe the application (optional)
review:
  status: draft             # draft | reviewed
  reviewers: []             # GitHub handles of people who checked every property against evidence
  note: "..."
```

Order matters in multi-valued properties: "first listed value" counts and rules with the `first` operator use it.

### Datasets: `data/datasets/<ID>.yaml`

`applications` links the dataset to the applications it comes from, most representative first; this is how a
dataset reaches scenarios. `extra_scenarios` is only for generic collections (ADBench, TSB-AD) whose parts fit a
scenario without a single application. `links.page.found_in_search` records whether the address was confirmed.

### Scenarios: `data/scenarios/<ID>.yaml`

```yaml
rule:                        # an application is a member if it matches ANY clause
  - match:                   # ... and a clause matches if ALL its conditions hold
      mod: {any: [vid]}      # any: at least one listed value      first: the first value is one of these
      out: {any: [loc]}      # all: every listed value is present   none: no listed value is present
      pt:  {in: [hrt, on]}   # in: for single-valued properties
    datasets_need:           # annotations a dataset needs to evaluate this clause
      - [loc, rul]           # each line: alternatives (loc OR rul); several lines must all hold
```

A condition may combine operators, for example `out: {all: [sev], none: [xai]}`. The scenario builder on the website
writes rules for you: group applications, then click **Propose as a scenario on GitHub**.

## What makes a change mergeable

- **Evidence for codings.** A changed property value needs a source under `evidence`. Text, link and typo fixes do not.
- **Reviewed means checked.** Set `review.status: reviewed` only after checking every property against evidence, and
  add your handle to `review.reviewers`. A second person's review is welcome; reviews by the record's author count less.
- **Rules and taxonomy changes are discussed first.** They change what every number means; see GOVERNANCE.md.
- **No derived numbers in files.** Counts and memberships are computed; do not add them.

Contributions are licensed under CC BY 4.0 (data) and MIT (code).
