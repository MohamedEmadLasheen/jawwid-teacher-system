#!/usr/bin/env bash
# Runs the schedule timeline/free-capacity and acceptance assertions against
# the real source in src/features/scheduling/utils. No test-runner dependency
# is added to the project: the esbuild binary that Vite already installs
# bundles the two pure util modules to ESM, and plain Node runs the assertions.
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Separate invocations on purpose: esbuild derives its output base from the
# common parent of the entry points, so mixing utils/, constants/ and lib/ in
# one call would nest the results into subdirectories and break the flat
# imports below.
node_modules/esbuild/bin/esbuild \
  src/features/scheduling/utils/timelineGeometry.ts \
  src/features/scheduling/utils/computeRowLayout.ts \
  src/features/scheduling/utils/buildScheduleRoster.ts \
  src/features/scheduling/utils/deriveScheduleRows.ts \
  src/features/scheduling/utils/timeGrid.ts \
  src/features/scheduling/utils/lessonTimeOptions.ts \
  src/features/scheduling/utils/sameTimeSlot.ts \
  src/features/scheduling/utils/bulkEditPreflight.ts \
  src/features/scheduling/utils/studentWeeklySchedule.ts \
  src/features/scheduling/utils/responsibleAdmins.ts \
  src/features/scheduling/utils/studentValidation.ts \
  src/features/scheduling/utils/lessonColor.ts \
  src/features/scheduling/utils/studentAdminAssignment.ts \
  src/features/scheduling/utils/lessonDuration.ts \
  --bundle --format=esm --platform=node \
  --outdir="$OUT" --out-extension:.js=.mjs >/dev/null

node_modules/esbuild/bin/esbuild \
  src/features/scheduling/constants/schedulingConstants.ts \
  --bundle --format=esm --platform=node \
  --outdir="$OUT" --out-extension:.js=.mjs >/dev/null

# Third invocation for the same reason: searchText lives under src/lib, so
# bundling it with the scheduling entries would raise the common output base
# to src/ and nest every result one directory deeper.
node_modules/esbuild/bin/esbuild \
  src/lib/searchText.ts \
  --bundle --format=esm --platform=node \
  --outdir="$OUT" --out-extension:.js=.mjs >/dev/null

# Fourth invocation, same output-base reason: the students mapper lives under
# src/services. It is the DB<->domain boundary that carries student ownership,
# and it is a separate module from students.service.ts precisely so it can be
# bundled here — the service itself imports the Supabase client, which reads
# import.meta.env and cannot be loaded under plain Node.
node_modules/esbuild/bin/esbuild \
  src/services/scheduling/students.mapper.ts \
  --bundle --format=esm --platform=node \
  --outdir="$OUT" --out-extension:.js=.mjs >/dev/null

cp scripts/schedule-geometry-tests/timeline.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/acceptance.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/roster.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/viewport.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/quickactions.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/sametimeslot.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/studentweekly.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/searchtext.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/filters.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/studentadmin.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/scheduleadmin.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/midnight.test.mjs "$OUT/"
cp scripts/schedule-geometry-tests/duration.test.mjs "$OUT/"

status=0
node "$OUT/timeline.test.mjs"   || status=1
echo
node "$OUT/acceptance.test.mjs" || status=1
echo
node "$OUT/roster.test.mjs"     || status=1
echo
node "$OUT/viewport.test.mjs"   || status=1
echo
node "$OUT/quickactions.test.mjs" || status=1
echo
node "$OUT/sametimeslot.test.mjs" || status=1
echo
node "$OUT/studentweekly.test.mjs" || status=1
echo
node "$OUT/searchtext.test.mjs" || status=1
echo
node "$OUT/filters.test.mjs" || status=1
echo
node "$OUT/studentadmin.test.mjs" || status=1
echo
node "$OUT/scheduleadmin.test.mjs" || status=1
echo
node "$OUT/midnight.test.mjs" || status=1
echo
node "$OUT/duration.test.mjs" || status=1

# Static policy check — reads the real .tsx sources, so it runs against the
# repository rather than the bundled output directory.
echo
REPO_ROOT="$PWD" node scripts/schedule-geometry-tests/selectors.test.mjs || status=1
exit $status
