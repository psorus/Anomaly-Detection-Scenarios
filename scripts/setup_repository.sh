#!/usr/bin/env bash
# One-time setup of a fresh GitHub repository for the atlas, using the GitHub CLI (gh auth login first).
# Usage: scripts/setup_repository.sh OWNER/REPO
set -euo pipefail
REPO="${1:?usage: $0 OWNER/REPO [@maintainer ...]}"
shift
MAINTAINERS="${*:-@${REPO%%/*}}"
cd "$(dirname "$0")/.."

# Fill in the repository name and maintainers in the files that need them; commit and push the result.
OWNER="${REPO%%/*}"; NAME="${REPO#*/}"
sed -i.bak -e "s#OWNER\.github\.io/REPO#$OWNER.github.io/$NAME#g" -e "s#OWNER/REPO#$REPO#g" atlas.yaml CITATION.cff README.md .github/ISSUE_TEMPLATE/config.yml && rm -f ./*.bak .github/ISSUE_TEMPLATE/*.bak
sed -i.bak "s#@OWNER#$MAINTAINERS#g" .github/CODEOWNERS && rm -f .github/CODEOWNERS.bak

# Labels used by the issue forms and workflows.
while IFS='|' read -r name color desc; do
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force
done <<'LABELS'
new application|1d76db|Proposal for a new application
new dataset|0e8a16|Proposal for a new dataset
new scenario|5319e7|Proposal for a new scenario
change request|fbca04|Correction to an existing record
accepted|0b4d5c|Maintainer approved; the workflow turns the proposal into a pull request
from proposal|c5def5|Pull request written from an issue form
needs evidence|d93f0b|Change needs a source before it can be merged
scenario rule|b60205|Changes which applications belong to a scenario
taxonomy|b60205|Changes a property or its values
review|0e8a16|Batch of reviews sent from the website
LABELS

# GitHub Pages built by the deploy workflow, and Discussions.
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || gh api -X PUT "repos/$REPO/pages" -f build_type=workflow
gh repo edit "$REPO" --enable-discussions --enable-issues

echo "Done. Commit and push the edited files (atlas.yaml, CITATION.cff, README.md, CODEOWNERS, issue config)."
echo "Two steps need the web interface:"
echo "  1. Discussions -> categories: create 'Scenarios', 'Applications' and 'Datasets' (slugs scenarios, applications, datasets)."
echo "  2. Settings -> Branches: protect main, require the 'check' status and one approving review (code owners for scenarios/taxonomy)."
echo "Optional: add a fine-grained token with contents and pull-requests write access as the secret ATLAS_BOT_TOKEN,"
echo "so pull requests opened from issue forms run their checks automatically."
