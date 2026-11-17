#!/usr/bin/env sh
# Runs the visual regression tests in the same container image as CI's Browser job, so the screenshots
# match the committed baselines (docs/visual-testing.md).
#
#   sh scripts/visual.sh            compare with the baselines
#   sh scripts/visual.sh --update   rewrite the baselines in test/visual/__screenshots__
#
# Needs Docker. The repository is copied into the container (without node_modules), so the host's
# node_modules are left alone; only the baselines are copied back, and only with --update.
set -eu

# Keep in step with the Browser job's container image in .github/workflows/ci.yml.
IMAGE="mcr.microsoft.com/playwright:v1.65.1-noble"
FONTS="fonts-crosextra-carlito fonts-crosextra-caladea"
SHOTS="packages/react-xlsx-viewer/test/visual/__screenshots__"
UPDATE=""
[ "${1:-}" = "--update" ] && UPDATE="--update"

cd "$(dirname "$0")/.."
docker run --rm --ipc=host --platform linux/amd64 -v "$PWD":/src:rw -w /work -e UPDATE="$UPDATE" -e SHOTS="$SHOTS" -e FONTS="$FONTS" "$IMAGE" bash -eu -c '
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends $FONTS >/dev/null
  tar -C /src --exclude=./node_modules --exclude="./*/*/node_modules" --exclude=./.git -cf - . | tar -xf -
  npm ci --no-audit --no-fund --loglevel=error
  npm -w react-xlsx-viewer exec -- playwright install --only-shell chromium
  status=0
  npm run -w react-xlsx-viewer test:visual -- $UPDATE || status=$?
  if [ -n "$UPDATE" ]; then rm -rf "/src/$SHOTS" && cp -r "$SHOTS" "/src/$SHOTS"; fi
  exit $status
'
