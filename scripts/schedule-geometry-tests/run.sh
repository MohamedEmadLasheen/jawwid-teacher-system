#!/usr/bin/env bash
# Runs the schedule timeline/free-capacity and acceptance assertions against
# the real source in src/features/scheduling/utils. No test-runner dependency
# is added to the project: the esbuild binary that Vite already installs
# bundles the two pure util modules to ESM, and plain Node runs the assertions.
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

node_modules/esbuild/bin/esbuild \
  src/features/scheduling/utils/timelineGeometry.ts \
  src/features/scheduling/utils/computeRowLayout.ts \
  --bundle --format=esm --platform=node \
  --outdir="$OUT" --out-extension:.js=.mjs >/dev/null

cp scripts/schedule-geometry-tests/timeline.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/acceptance.test.mjs "$OUT/"

status=0
node "$OUT/timeline.test.mjs"   || status=1
echo
node "$OUT/acceptance.test.mjs" || status=1
exit $status
