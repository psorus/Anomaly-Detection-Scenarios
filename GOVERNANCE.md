# Governance

The atlas aims for a consensus that can be audited: every decision is a pull request with its evidence and review,
and every number on the website is recomputed from the merged files.

## Roles

- **Contributors**: anyone with a GitHub account. They open discussions, issues and pull requests, and review others'
  pull requests. Reviews from any contributor are visible and weighed.
- **Maintainers**: listed in `.github/CODEOWNERS`. They merge pull requests, add the `accepted` label to proposals, and
  moderate Discussions. New maintainers are proposed in a discussion and added by existing maintainers.

## What each kind of change needs

| Change | Needs before merge |
|---|---|
| Typo, wording, a broken or missing link | One maintainer approval |
| A property value of an application or dataset | A source in `evidence`; one maintainer approval |
| Marking a record `reviewed` | The reviewer's handle in `review.reviewers`; one approval by someone else |
| New application or dataset | Complete file passing the checks; one maintainer approval |
| New scenario, or a change to a scenario rule | A linked discussion open for at least 7 days; two approvals, one by a maintainer |
| Taxonomy (adding, removing or redefining a property or value) | A discussion labeled `taxonomy` open for at least 14 days; two maintainer approvals; all affected files updated in the same pull request |

The impact report on each pull request shows exactly which scenario memberships and counts a change moves. A change
that moves many numbers deserves more scrutiny than its diff suggests.

## Disagreements

Disagreements are settled by evidence first: published deployment studies, standards and operator documentation
outweigh opinion. When evidence is mixed, prefer the most common deployment and add a second application for the
other setup (for example inline scoring versus batch investigation) rather than averaging them. If a discussion does
not converge, maintainers decide and record the reasoning in the pull request.

## Releases

Maintainers tag releases (for example `v1.0` for the paper's camera-ready version). A release fixes every number;
cite the release, not the moving website.

## AI-assisted content

The initial version was drafted with Claude (Anthropic) and is marked `draft`. AI-assisted contributions are welcome
under the same rules: they must be checked by a person and backed by evidence before they are marked `reviewed`.
