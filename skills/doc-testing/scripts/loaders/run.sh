#!/bin/bash
# Bash loader for WASM-based validation
#
# Usage:
#   ./run.sh <test-file.json>
#   ./run.sh --stdin < test-spec.json
#
# Exit codes:
#   0 - Validation passed
#   1 - Validation failed
#   2 - Usage/input error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$(dirname "$SCRIPT_DIR")/dist"
WASM_MODULE="$DIST_DIR/validate-test.wasm"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
RUNTIME_DIR="$REPO_ROOT/runtimes"

# Detect platform
detect_wasmtime() {
    local os arch platform
    
    os=$(uname -s)
    arch=$(uname -m)
    
    case "$os" in
        Linux)
            case "$arch" in
                x86_64) platform="linux-x64" ;;
                aarch64|arm64) platform="linux-arm64" ;;
                *) platform="" ;;
            esac
            ;;
        Darwin)
            case "$arch" in
                x86_64) platform="darwin-x64" ;;
                arm64) platform="darwin-arm64" ;;
                *) platform="" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            case "$arch" in
                x86_64) platform="windows-x64" ;;
                aarch64|arm64) platform="windows-arm64" ;;
                *) platform="" ;;
            esac
            ;;
        *)
            platform=""
            ;;
    esac
    
    # Check bundled runtime first
    if [ -n "$platform" ]; then
        local bundled_path="$RUNTIME_DIR/$platform/wasmtime"
        if [[ "$platform" == windows-* ]]; then
            bundled_path="$RUNTIME_DIR/$platform/wasmtime.exe"
        fi
        
        if [ -x "$bundled_path" ]; then
            echo "$bundled_path"
            return 0
        fi
    fi
    
    # Fall back to system wasmtime
    if command -v wasmtime &> /dev/null; then
        echo "wasmtime"
        return 0
    fi
    
    return 1
}

usage() {
    cat << EOF
Usage: $(basename "$0") <test-file.json>
       $(basename "$0") --stdin < test-spec.json

Validates a Doc Detective test specification.

Arguments:
  test-file.json    Path to JSON test specification file

Options:
  --stdin           Read test specification from stdin
  --help, -h        Show this help message

Exit codes:
  0 - Validation passed
  1 - Validation failed
  2 - Usage/input error
EOF
}

# Parse arguments
if [ $# -eq 0 ]; then
    usage
    exit 2
fi

case "$1" in
    --help|-h)
        usage
        exit 0
        ;;
    --stdin)
        INPUT_MODE="stdin"
        ;;
    --*)
        echo "Error: Unknown option: $1" >&2
        usage >&2
        exit 2
        ;;
    *)
        INPUT_MODE="file"
        INPUT_FILE="$1"
        ;;
esac

# Check WASM module exists
if [ ! -f "$WASM_MODULE" ]; then
    echo "Error: WASM module not found: $WASM_MODULE" >&2
    echo "Run build-wasm.sh to build the module." >&2
    exit 2
fi

# Get wasmtime path
WASMTIME=$(detect_wasmtime) || {
    echo "Error: wasmtime not found. Install wasmtime or run build-wasm.sh to download bundled runtime." >&2
    exit 2
}

# Prepare input
if [ "$INPUT_MODE" = "file" ]; then
    if [ ! -f "$INPUT_FILE" ]; then
        echo "Error: File not found: $INPUT_FILE" >&2
        exit 2
    fi
    
    # Read file and wrap in action format
    SPEC=$(cat "$INPUT_FILE")
    INPUT=$(echo "{\"action\":\"validate\",\"spec\":$SPEC}")
else
    # Read from stdin and wrap
    SPEC=$(cat)
    INPUT=$(echo "{\"action\":\"validate\",\"spec\":$SPEC}")
fi

# Run WASM module
# Capture stdout and stderr separately
set +e
STDOUT_FILE=$(mktemp)
STDERR_FILE=$(mktemp)
echo "$INPUT" | "$WASMTIME" run "$WASM_MODULE" > "$STDOUT_FILE" 2> "$STDERR_FILE"
WASM_EXIT=$?
set -e

OUTPUT=$(cat "$STDOUT_FILE")
STDERR_OUT=$(cat "$STDERR_FILE")
rm -f "$STDOUT_FILE" "$STDERR_FILE"

# Extract exit code from JSON output
if echo "$OUTPUT" | grep -q '"exitCode"'; then
    EXIT_CODE=$(echo "$OUTPUT" | grep -oP '"exitCode"\s*:\s*\d+' | grep -oP '\d+$')
else
    EXIT_CODE=$WASM_EXIT
fi

# Output the result (stdout to stdout, stderr to stderr)
echo "$OUTPUT"
if [ -n "$STDERR_OUT" ]; then
    echo "$STDERR_OUT" >&2
fi

exit "${EXIT_CODE:-0}"
