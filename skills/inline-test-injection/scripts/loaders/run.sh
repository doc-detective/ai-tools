#!/usr/bin/env bash
# Shell loader for inline-test-injection WASM module
#
# Usage:
#   ./run.sh <spec-file> <source-file> [--apply] [--syntax json|yaml|xml]
#
# Exit codes:
#   0 - Success
#   1 - Injection failed
#   2 - Usage/input error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/../dist"
WASM_MODULE="$DIST_DIR/inject-inline.wasm"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
RUNTIME_DIR="$REPO_ROOT/runtimes"

# Detect platform and get wasmtime path
detect_wasmtime() {
    local os arch platform_dir binary_name
    
    # Detect OS
    case "$(uname -s)" in
        Linux)  os="linux" ;;
        Darwin) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *)
            echo "Error: Unsupported OS: $(uname -s)" >&2
            return 1
            ;;
    esac
    
    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        *)
            echo "Error: Unsupported architecture: $(uname -m)" >&2
            return 1
            ;;
    esac
    
    platform_dir="${os}-${arch}"
    binary_name="wasmtime"
    [ "$os" = "windows" ] && binary_name="wasmtime.exe"
    
    # Try bundled runtime first
    local bundled_path="$RUNTIME_DIR/$platform_dir/$binary_name"
    if [ -x "$bundled_path" ]; then
        echo "$bundled_path"
        return 0
    fi
    
    # Fall back to system wasmtime
    if command -v wasmtime &>/dev/null; then
        command -v wasmtime
        return 0
    fi
    
    echo "Error: wasmtime not found. Run build-wasm.sh or install wasmtime." >&2
    return 1
}

# Show usage
usage() {
    cat <<EOF
Usage: $(basename "$0") <spec-file> <source-file> [options]

Injects Doc Detective test specs into documentation source files.

Arguments:
  spec-file     Path to test spec file (JSON or YAML)
  source-file   Path to documentation source file

Options:
  --apply       Apply changes directly (default: preview mode)
  --syntax      Force syntax format: json, yaml, or xml
  --help, -h    Show this help message

Exit codes:
  0 - Success
  1 - Injection failed
  2 - Usage/input error

Examples:
  $(basename "$0") tests/search.json docs/guide.md
  $(basename "$0") tests/search.yaml docs/guide.md --apply
  $(basename "$0") tests/api.json docs/api.mdx --syntax yaml
EOF
}

# Main function
main() {
    local spec_file="" source_file="" apply="false" syntax="json"
    
    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --help|-h)
                usage
                exit 0
                ;;
            --apply)
                apply="true"
                shift
                ;;
            --syntax)
                if [ -z "${2:-}" ]; then
                    echo "Error: --syntax requires an argument" >&2
                    exit 2
                fi
                syntax="$2"
                shift 2
                ;;
            --*)
                echo "Error: Unknown option: $1" >&2
                usage
                exit 2
                ;;
            *)
                if [ -z "$spec_file" ]; then
                    spec_file="$1"
                elif [ -z "$source_file" ]; then
                    source_file="$1"
                else
                    echo "Error: Unexpected argument: $1" >&2
                    usage
                    exit 2
                fi
                shift
                ;;
        esac
    done
    
    # Validate arguments
    if [ -z "$spec_file" ] || [ -z "$source_file" ]; then
        echo "Error: Both spec-file and source-file are required" >&2
        usage
        exit 2
    fi
    
    # Check files exist
    if [ ! -f "$spec_file" ]; then
        echo "Error: Spec file not found: $spec_file" >&2
        exit 2
    fi
    
    if [ ! -f "$source_file" ]; then
        echo "Error: Source file not found: $source_file" >&2
        exit 2
    fi
    
    # Check WASM module exists
    if [ ! -f "$WASM_MODULE" ]; then
        echo "Error: WASM module not found: $WASM_MODULE" >&2
        echo "Run build-wasm.sh to build the module." >&2
        exit 2
    fi
    
    # Get wasmtime path
    local wasmtime_path
    wasmtime_path=$(detect_wasmtime) || exit 2
    
    # Read spec file (handle YAML conversion)
    local spec_content
    if [[ "$spec_file" == *.yaml || "$spec_file" == *.yml ]]; then
        # Convert YAML to JSON using Python or Node if available
        if command -v python3 &>/dev/null; then
            spec_content=$(python3 -c "
import sys, json, yaml
with open('$spec_file', 'r') as f:
    data = yaml.safe_load(f)
print(json.dumps(data))
" 2>/dev/null) || {
                # Try with PyYAML installed via pip
                spec_content=$(python3 -c "
import sys, json
try:
    import yaml
    with open('$spec_file', 'r') as f:
        data = yaml.safe_load(f)
    print(json.dumps(data))
except ImportError:
    sys.exit(1)
" 2>/dev/null) || {
                    echo "Error: YAML parsing requires PyYAML (pip install pyyaml)" >&2
                    exit 2
                }
            }
        elif command -v node &>/dev/null; then
            spec_content=$(node -e "
const fs = require('fs');
const yaml = require('yaml');
const content = fs.readFileSync('$spec_file', 'utf8');
console.log(JSON.stringify(yaml.parse(content)));
" 2>/dev/null) || {
                echo "Error: YAML parsing requires yaml package (npm install yaml)" >&2
                exit 2
            }
        else
            echo "Error: YAML files require Python or Node.js for parsing" >&2
            exit 2
        fi
    else
        spec_content=$(cat "$spec_file")
    fi
    
    # Read source file
    local source_content
    source_content=$(cat "$source_file")
    
    # Build JSON input
    local input_json
    input_json=$(jq -n \
        --argjson spec "$spec_content" \
        --arg sourceContent "$source_content" \
        --arg sourcePath "$source_file" \
        --argjson apply "$apply" \
        --arg syntax "$syntax" \
        '{
            action: "inject",
            spec: $spec,
            sourceContent: $sourceContent,
            sourcePath: $sourcePath,
            options: {
                apply: $apply,
                syntax: $syntax
            }
        }')
    
    # Run WASM module
    local output
    local stdout_file stderr_file
    stdout_file=$(mktemp)
    stderr_file=$(mktemp)
    
    echo "$input_json" | "$wasmtime_path" run "$WASM_MODULE" > "$stdout_file" 2> "$stderr_file" || true
    output=$(cat "$stdout_file")
    local stderr_out=$(cat "$stderr_file")
    rm -f "$stdout_file" "$stderr_file"
    
    # Extract exit code from JSON output
    local exit_code=0
    if echo "$output" | grep -q '"exitCode"'; then
        exit_code=$(echo "$output" | grep -oP '"exitCode"\s*:\s*\d+' | grep -oP '\d+$' | head -1)
    fi
    
    # Parse result
    local result
    result=$(echo "$output" | jq -r '.' 2>/dev/null) || {
        echo "$output"
        [ -n "$stderr_out" ] && echo "$stderr_out" >&2
        exit "$exit_code"
    }
    
    # Check success
    local success
    success=$(echo "$result" | jq -r '.success // false')
    
    if [ "$success" = "true" ]; then
        local applied step_count
        applied=$(echo "$result" | jq -r '.applied')
        step_count=$(echo "$result" | jq -r '.stepCount')
        
        if [ "$applied" = "true" ]; then
            # Write result to file
            echo "$result" | jq -r '.result' > "$source_file"
            echo "✅ Injected $step_count steps into $source_file"
        else
            # Show preview
            echo "$result" | jq -r '.result'
            echo ""
            echo "📋 Preview: $step_count steps would be injected"
            echo "   Run with --apply to apply changes"
        fi
        
        # Show unmatched steps warning
        local unmatched
        unmatched=$(echo "$result" | jq -r '.unmatchedSteps | length')
        if [ "$unmatched" -gt 0 ]; then
            echo ""
            echo "⚠️  Unmatched steps (will be inserted at suggested positions):"
            echo "$result" | jq -r '.unmatchedSteps[] | "  Test: \(.testId // "(unnamed)")\n" + (.steps[] | "    - Step \(.stepIndex + 1): \(.action) (suggested line \(.suggestedLine))")'
        fi
        
        exit 0
    else
        local error
        error=$(echo "$result" | jq -r '.error // "Unknown error"')
        echo "❌ Error: $error" >&2
        exit 1
    fi
}

main "$@"
