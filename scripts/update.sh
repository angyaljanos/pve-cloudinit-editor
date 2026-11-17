#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TARGET=${1:-"$HOME/.local/share/pve-cloudinit-editor"}

cd "$ROOT"
npm ci
npm run build
mkdir -p "$TARGET"
cp -R dist/. "$TARGET/"
printf 'Extension updated at %s\nReload it in chrome://extensions to apply the update.\n' "$TARGET"
