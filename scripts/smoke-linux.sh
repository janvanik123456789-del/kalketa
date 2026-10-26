#!/usr/bin/env bash
# The checks under Linux (WSL Ubuntu), started from Windows by `npm run smoke:linux`:
# the working tree (saved or not) is copied to a Linux folder of its own, where
# typecheck, unit tests and the smoke test with real input run on a virtual
# display. With --appimage the AppImage and the .deb are built and smoke-tested too.
#
# Needs in Ubuntu: Node 24 in ~/.local/node (see linux-env.sh), git, rsync, xvfb.
set -e
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/linux-env.sh"
source_dir="$(dirname "$here")"
work="$HOME/kalketa"
# The smoke results (screenshots, result.json) where they stay: /tmp of WSL is emptied between its starts.
export TMPDIR="$HOME/kalketa-smoke"
mkdir -p "$TMPDIR"
find "$TMPDIR" -maxdepth 1 -name "kalketa-smoke-run-*" -mtime +2 -exec rm -rf {} + 2>/dev/null || true

mkdir -p "$work"
rsync -a --delete --exclude node_modules --exclude dist --exclude release --exclude '*.tsbuildinfo' --exclude .git "$source_dir/" "$work/"
cd "$work"
# Dependencies again only when the lock file changed.
if ! cmp -s package-lock.json node_modules/.package-lock.json 2>/dev/null; then
  npm ci --no-audit --no-fund > /tmp/kalketa-npm.log 2>&1 || { tail -20 /tmp/kalketa-npm.log; exit 1; }
  node node_modules/electron/install.js > /dev/null
fi

echo "linux: typecheck"
npm run typecheck > /tmp/kalketa-typecheck.log 2>&1 || { grep -i error /tmp/kalketa-typecheck.log | head -20; exit 1; }
echo "linux: unit tests"
npx vitest run 2>&1 | grep -E "Tests |FAIL" | head -20
echo "linux: smoke"
npm run build:desktop > /tmp/kalketa-build.log 2>&1 || { tail -20 /tmp/kalketa-build.log; exit 1; }
xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/smoke.mjs 2>&1 | tail -2

if [ "$1" = "--appimage" ]; then
  echo "linux: AppImage"
  # Builds of an older version stay there otherwise, and the first found would be tested.
  rm -rf "$work/packages/desktop/release"
  npm run dist:linux --workspace @kalketa/desktop > /tmp/kalketa-dist.log 2>&1 || { tail -20 /tmp/kalketa-dist.log; exit 1; }
  image="$(ls "$work"/packages/desktop/release/*.AppImage | head -1)"
  KALKETA_SMOKE_EXE="$image" xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/smoke.mjs 2>&1 | tail -2
  mkdir -p "$source_dir/packages/desktop/release"
  cp "$image" "$source_dir/packages/desktop/release/"
  echo "linux: $(basename "$image") copied to packages/desktop/release"
  # The .deb as installed: unpacked (no root needed), its program smoke-tested.
  deb="$(ls "$work"/packages/desktop/release/*.deb | head -1)"
  rm -rf /tmp/kalketa-deb && dpkg-deb -x "$deb" /tmp/kalketa-deb
  echo "linux: deb"
  KALKETA_SMOKE_EXE="$(ls /tmp/kalketa-deb/opt/*/kalketa | head -1)" xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/smoke.mjs 2>&1 | tail -2
  cp "$deb" "$source_dir/packages/desktop/release/"
  echo "linux: $(basename "$deb") copied to packages/desktop/release"
fi
