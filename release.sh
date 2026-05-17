#!/usr/bin/env bash
set -euo pipefail

REPO="andrewmarconi/GoogleDriveFolderLink"
BASE_BRANCH="main"
DEV_BRANCH="develop"

# --- Helpers ---

die() { echo "ERROR: $1" >&2; exit 1; }

current_version() {
  jq -r '.version' manifest.json
}

bump_version() {
  local ver="$1" part="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$ver"
  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *) die "Unknown bump type: $part" ;;
  esac
}

set_version() {
  local new_ver="$1"
  # Update manifest.json
  jq --arg v "$new_ver" '.version = $v' manifest.json > manifest.json.tmp \
    && mv manifest.json.tmp manifest.json
  # Update package.json and package-lock.json via npm (no git tag)
  npm version "$new_ver" --no-git-tag-version --allow-same-version > /dev/null 2>&1
  # Upsert versions.json: map plugin version -> current minAppVersion
  local min_app
  min_app=$(jq -r '.minAppVersion' manifest.json)
  jq --arg v "$new_ver" --arg m "$min_app" '. + {($v): $m}' versions.json \
    > versions.json.tmp && mv versions.json.tmp versions.json
}

# --- Preflight checks ---

command -v jq  >/dev/null 2>&1 || die "jq is required but not installed"
command -v gh  >/dev/null 2>&1 || die "gh (GitHub CLI) is required but not installed"
command -v npm >/dev/null 2>&1 || die "npm is required but not installed"

current_branch=$(git branch --show-current)
[[ "$current_branch" == "$DEV_BRANCH" ]] || die "Must be on '$DEV_BRANCH' branch (currently on '$current_branch')"

if [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree is dirty. Commit or stash changes first."
fi

# --- Step 1: Lint ---

echo "Running linter..."
if ! npm run lint; then
  die "Linting failed. Fix errors before releasing."
fi
echo "Lint passed."
echo

# --- Step 2: Version ---

ver=$(current_version)
echo "Current version: $ver"
echo
echo "How would you like to version this release?"
echo "  1) patch  ($(bump_version "$ver" patch))"
echo "  2) minor  ($(bump_version "$ver" minor))"
echo "  3) major  ($(bump_version "$ver" major))"
echo "  4) keep   ($ver)"
echo
read -rp "Choice [1-4]: " choice

case "$choice" in
  1) new_ver=$(bump_version "$ver" patch) ;;
  2) new_ver=$(bump_version "$ver" minor) ;;
  3) new_ver=$(bump_version "$ver" major) ;;
  4) new_ver="$ver" ;;
  *) die "Invalid choice" ;;
esac

if [[ "$new_ver" != "$ver" ]]; then
  echo "Bumping version: $ver -> $new_ver"
  set_version "$new_ver"
  git add manifest.json versions.json package.json package-lock.json
  git commit -m "chore: bump version to $new_ver"
else
  echo "Keeping version: $ver"
fi
echo

# --- Step 3: Build (verify only — CI rebuilds for the release) ---

echo "Building (local verification)..."
npm run build || die "Build failed."
echo "Build succeeded."
echo

# --- Step 4: Push and create PR ---

echo "Pushing $DEV_BRANCH to origin..."
git push -u origin "$DEV_BRANCH"
echo

echo "Creating pull request: $DEV_BRANCH -> $BASE_BRANCH"
pr_url=$(gh pr create \
  --base "$BASE_BRANCH" \
  --head "$DEV_BRANCH" \
  --title "Release $new_ver" \
  --body "$(cat <<EOF
## Release $new_ver

Merge \`$DEV_BRANCH\` into \`$BASE_BRANCH\` for release $new_ver.
EOF
)" 2>&1) || {
  # PR may already exist
  existing=$(gh pr list --base "$BASE_BRANCH" --head "$DEV_BRANCH" --json url -q '.[0].url' 2>/dev/null)
  if [[ -n "$existing" ]]; then
    pr_url="$existing"
    echo "PR already exists: $pr_url"
  else
    die "Failed to create PR: $pr_url"
  fi
}

echo
echo "============================================"
echo "  PR created: $pr_url"
echo "============================================"
echo
echo "Please review, approve, and merge the PR."
read -rp "Press Enter once the PR has been merged..."

# --- Step 5: Verify merge ---

pr_state=$(gh pr view "$pr_url" --json state -q '.state' 2>/dev/null)
if [[ "$pr_state" != "MERGED" ]]; then
  die "PR is not merged (state: $pr_state). Aborting release."
fi
echo "PR merged. Tagging release..."
echo

# --- Step 6: Push tag (triggers the release workflow) ---

git fetch origin "$BASE_BRANCH"
merge_sha=$(git rev-parse "origin/$BASE_BRANCH")

if git rev-parse -q --verify "refs/tags/$new_ver" >/dev/null; then
  die "Tag '$new_ver' already exists locally. Aborting."
fi
if git ls-remote --tags origin "refs/tags/$new_ver" | grep -q .; then
  die "Tag '$new_ver' already exists on origin. Aborting."
fi

git tag -a "$new_ver" "$merge_sha" -m "Release $new_ver"
git push origin "$new_ver"

run_url="https://github.com/$REPO/actions"
echo
echo "============================================"
echo "  Tag $new_ver pushed. Release workflow running."
echo "  Watch: $run_url"
echo "============================================"
