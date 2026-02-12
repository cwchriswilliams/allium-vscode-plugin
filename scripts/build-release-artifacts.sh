#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$ROOT_DIR/artifacts}"
CACHE_DIR="$ROOT_DIR/.npm-cache"
mkdir -p "$CACHE_DIR"

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR"/*.vsix "$ARTIFACT_DIR"/*.tgz "$ARTIFACT_DIR"/*.tar.gz "$ARTIFACT_DIR"/SHA256SUMS.txt

echo "Building extension and standalone CLI workspaces..."
npm run --workspace extensions/allium build
npm run --workspace packages/allium-cli build

VERSION="$(node -p "require('./extensions/allium/package.json').version")"
VSIX_NAME="allium-vscode-${VERSION}.vsix"

echo "Packaging VSIX artifact..."
(
  cd "$ROOT_DIR/extensions/allium"
  npx @vscode/vsce package --allow-missing-repository --no-dependencies --out "$ARTIFACT_DIR/$VSIX_NAME"
)

echo "Packaging standalone CLI npm artifact..."
(
  cd "$ROOT_DIR/packages/allium-cli"
  HOME="$ROOT_DIR" npm_config_cache="$CACHE_DIR" NPM_CONFIG_CACHE="$CACHE_DIR" npm pack --pack-destination "$ARTIFACT_DIR"
)

echo "Generating checksums..."
(
  cd "$ARTIFACT_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum ./*.vsix ./*.tgz > SHA256SUMS.txt
  else
    shasum -a 256 ./*.vsix ./*.tgz > SHA256SUMS.txt
  fi
)

echo "Release artifacts created in $ARTIFACT_DIR:"
ls -1 "$ARTIFACT_DIR"
