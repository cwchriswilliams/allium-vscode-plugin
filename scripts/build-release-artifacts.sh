#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$ROOT_DIR/artifacts}"
CACHE_DIR="$ROOT_DIR/.npm-cache"
mkdir -p "$CACHE_DIR"

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR"/*.vsix "$ARTIFACT_DIR"/*.tgz "$ARTIFACT_DIR"/*.tar.gz "$ARTIFACT_DIR"/*.tar.gz "$ARTIFACT_DIR"/SHA256SUMS.txt

VERSION="$(node -p "require('./extensions/allium/package.json').version")"

echo "Building LSP server..."
npm run --workspace packages/allium-lsp build

echo "Building Tree-sitter grammar..."
# We allow wasm build failure if emcc is missing, but generate/native must pass
npm run --workspace packages/tree-sitter-allium generate
npm run --workspace packages/tree-sitter-allium build:native
npm run --workspace packages/tree-sitter-allium build:wasm || echo "Warning: tree-sitter-allium wasm build failed (emcc missing?), skipping wasm."

echo "Building extension (with bundled LSP binary) and CLI..."
npm run --workspace extensions/allium build:release
npm run --workspace packages/allium-cli build

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

echo "Packaging allium-lsp binary..."
LSP_TARBALL="allium-lsp-${VERSION}.tar.gz"
(
  cd "$ROOT_DIR/packages/allium-lsp"
  mkdir -p /tmp/allium-lsp-release
  cp dist/bin.js /tmp/allium-lsp-release/allium-lsp
  chmod +x /tmp/allium-lsp-release/allium-lsp
  tar -czf "$ARTIFACT_DIR/$LSP_TARBALL" -C /tmp/allium-lsp-release allium-lsp
  rm -rf /tmp/allium-lsp-release
)

echo "Packaging tree-sitter artifacts..."
(
  cd "$ROOT_DIR/packages/tree-sitter-allium"
  cp dist/tree-sitter-allium.node "$ARTIFACT_DIR/"
  if [ -f dist/tree-sitter-allium.wasm ]; then
    cp dist/tree-sitter-allium.wasm "$ARTIFACT_DIR/"
  fi
)

echo "Generating checksums..."
(
  cd "$ARTIFACT_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum ./*.vsix ./*.tgz ./*.tar.gz ./*.node ./*.wasm > SHA256SUMS.txt 2>/dev/null || true
    # Re-run to catch everything without erroring on missing wasm
    sha256sum ./*.vsix ./*.tgz ./*.tar.gz ./*.node > SHA256SUMS.txt
    if [ -f ./*.wasm ]; then sha256sum ./*.wasm >> SHA256SUMS.txt; fi
  else
    shasum -a 256 ./*.vsix ./*.tgz ./*.tar.gz ./*.node > SHA256SUMS.txt
    if ls ./*.wasm >/dev/null 2>&1; then shasum -a 256 ./*.wasm >> SHA256SUMS.txt; fi
  fi
)

echo "Release artifacts created in $ARTIFACT_DIR:"
ls -1 "$ARTIFACT_DIR"
