#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$ROOT_DIR/artifacts}"

mkdir -p "$ARTIFACT_DIR"
rm -f "$ARTIFACT_DIR"/*.vsix "$ARTIFACT_DIR"/*.tar.gz

echo "Building extension workspace..."
npm run --workspace extensions/allium build

VERSION="$(node -p "require('./extensions/allium/package.json').version")"
VSIX_NAME="allium-vscode-${VERSION}.vsix"

echo "Packaging VSIX artifact..."
(
  cd "$ROOT_DIR/extensions/allium"
  npx @vscode/vsce package --allow-missing-repository --no-dependencies --out "$ARTIFACT_DIR/$VSIX_NAME"
)

echo "Packaging standalone CLI archive..."
CLI_DIR_NAME="allium-cli-${VERSION}"
CLI_DIR="$ARTIFACT_DIR/$CLI_DIR_NAME"
rm -rf "$CLI_DIR"
mkdir -p "$CLI_DIR/dist" "$CLI_DIR/bin"
cp -R "$ROOT_DIR/extensions/allium/dist/src" "$CLI_DIR/dist/"

cat >"$CLI_DIR/bin/allium-check" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$SCRIPT_DIR/dist/src/check.js" "$@"
EOF

cat >"$CLI_DIR/bin/allium-format" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$SCRIPT_DIR/dist/src/format.js" "$@"
EOF

chmod +x "$CLI_DIR/bin/allium-check" "$CLI_DIR/bin/allium-format"

cat >"$CLI_DIR/README.txt" <<EOF
Allium standalone CLI bundle
Version: ${VERSION}

Usage:
  ./bin/allium-check --help
  ./bin/allium-format --help
EOF

tar -czf "$ARTIFACT_DIR/${CLI_DIR_NAME}.tar.gz" -C "$ARTIFACT_DIR" "$CLI_DIR_NAME"
rm -rf "$CLI_DIR"

echo "Release artifacts created in $ARTIFACT_DIR:"
ls -1 "$ARTIFACT_DIR"
