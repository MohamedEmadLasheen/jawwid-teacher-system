#!/usr/bin/env bash
# Runs the teacher-evaluation assertions against the real source in src/lib.
# No test-runner dependency is added to the project: the esbuild binary Vite
# already installs bundles the two pure modules under test to ESM, and plain
# Node runs the assertions — the same mechanism as
# scripts/schedule-geometry-tests/run.sh.
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Both entry points live in src/lib, so one invocation keeps the output flat
# and the imports in the test file simple.
node_modules/esbuild/bin/esbuild \
  src/lib/evaluationCriteria.ts \
  src/lib/searchText.ts \
  --bundle --format=esm --platform=node \
  --outdir="$OUT" --out-extension:.js=.mjs >/dev/null

cp scripts/evaluation-tests/criteria.test.mjs "$OUT/"

status=0
node "$OUT/criteria.test.mjs" || status=1

# Static policy check — reads the real .tsx source, so it runs against the
# repository rather than the bundled output directory.
echo
REPO_ROOT="$PWD" node scripts/evaluation-tests/form.test.mjs || status=1
exit $status
