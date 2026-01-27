#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/src"
bun --version
bun install
bun build --compile --minify inject-inline.mjs --outfile ../dist/inline-test-injection
