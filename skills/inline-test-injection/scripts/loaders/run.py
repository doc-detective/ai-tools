#!/usr/bin/env python3
"""
Python loader for inline-test-injection WASM module

Usage:
    python run.py <spec-file> <source-file> [--apply] [--syntax json|yaml|xml]

Exit codes:
    0 - Success
    1 - Injection failed
    2 - Usage/input error
"""

import sys
import os
import json
import platform
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
DIST_DIR = SCRIPT_DIR.parent / "dist"
WASM_MODULE = DIST_DIR / "inject-inline.wasm"
REPO_ROOT = SCRIPT_DIR.parent.parent.parent.parent
RUNTIME_DIR = REPO_ROOT / "runtimes"


def detect_wasmtime():
    """Detect wasmtime path - bundled first, then system."""
    system = platform.system()
    machine = platform.machine()
    
    platform_map = {
        ("Linux", "x86_64"): "linux-x64",
        ("Linux", "aarch64"): "linux-arm64",
        ("Darwin", "x86_64"): "darwin-x64",
        ("Darwin", "arm64"): "darwin-arm64",
        ("Windows", "AMD64"): "windows-x64",
        ("Windows", "ARM64"): "windows-arm64",
    }
    
    platform_dir = platform_map.get((system, machine))
    
    if platform_dir:
        binary_name = "wasmtime.exe" if system == "Windows" else "wasmtime"
        bundled_path = RUNTIME_DIR / platform_dir / binary_name
        
        if bundled_path.exists() and os.access(bundled_path, os.X_OK):
            return str(bundled_path)
    
    # Fall back to system wasmtime
    import shutil
    system_wasmtime = shutil.which("wasmtime")
    if system_wasmtime:
        return system_wasmtime
    
    return None


def parse_spec_file(spec_path):
    """Parse spec file (JSON or YAML)."""
    content = spec_path.read_text()
    ext = spec_path.suffix.lower()
    
    if ext in ('.yaml', '.yml'):
        try:
            import yaml
            return yaml.safe_load(content)
        except ImportError:
            print("Error: YAML files require PyYAML (pip install pyyaml)", file=sys.stderr)
            sys.exit(2)
    else:
        return json.loads(content)


def run_wasmtime(wasmtime_path, wasm_module, input_json):
    """Run WASM module using wasmtime CLI."""
    result = subprocess.run(
        [wasmtime_path, "run", str(wasm_module)],
        input=input_json.encode("utf-8"),
        capture_output=True
    )
    
    stdout = result.stdout.decode("utf-8", errors="replace")
    stderr = result.stderr.decode("utf-8", errors="replace")
    
    exit_code = result.returncode
    
    # Extract exit code from JSON output
    try:
        output_data = json.loads(stdout.strip())
        if "exitCode" in output_data:
            exit_code = int(output_data["exitCode"])
    except (json.JSONDecodeError, ValueError, TypeError):
        pass
    
    return stdout.strip(), stderr.strip(), exit_code


def usage():
    print(__doc__)


def main():
    args = sys.argv[1:]
    
    if not args or "--help" in args or "-h" in args:
        usage()
        sys.exit(0 if "--help" in args or "-h" in args else 2)
    
    # Parse arguments
    spec_file = None
    source_file = None
    apply = False
    syntax = "json"
    
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--apply":
            apply = True
        elif arg == "--syntax":
            if i + 1 >= len(args):
                print("Error: --syntax requires an argument", file=sys.stderr)
                sys.exit(2)
            syntax = args[i + 1]
            i += 1
        elif arg.startswith("--"):
            print(f"Error: Unknown option: {arg}", file=sys.stderr)
            usage()
            sys.exit(2)
        elif spec_file is None:
            spec_file = Path(arg)
        elif source_file is None:
            source_file = Path(arg)
        else:
            print(f"Error: Unexpected argument: {arg}", file=sys.stderr)
            usage()
            sys.exit(2)
        i += 1
    
    if spec_file is None or source_file is None:
        print("Error: Both spec-file and source-file are required", file=sys.stderr)
        usage()
        sys.exit(2)
    
    # Validate files
    if not spec_file.exists():
        print(f"Error: Spec file not found: {spec_file}", file=sys.stderr)
        sys.exit(2)
    
    if not source_file.exists():
        print(f"Error: Source file not found: {source_file}", file=sys.stderr)
        sys.exit(2)
    
    # Check WASM module
    if not WASM_MODULE.exists():
        print(f"Error: WASM module not found: {WASM_MODULE}", file=sys.stderr)
        print("Run build-wasm.sh to build the module.", file=sys.stderr)
        sys.exit(2)
    
    # Get wasmtime
    wasmtime_path = detect_wasmtime()
    if not wasmtime_path:
        print("Error: wasmtime not found.", file=sys.stderr)
        print("Install wasmtime or run build-wasm.sh", file=sys.stderr)
        sys.exit(2)
    
    # Parse spec and read source
    spec = parse_spec_file(spec_file)
    source_content = source_file.read_text()
    
    # Build input
    input_obj = {
        "action": "inject",
        "spec": spec,
        "sourceContent": source_content,
        "sourcePath": str(source_file),
        "options": {
            "apply": apply,
            "syntax": syntax
        }
    }
    input_json = json.dumps(input_obj)
    
    # Run WASM
    output, stderr_output, exit_code = run_wasmtime(wasmtime_path, WASM_MODULE, input_json)
    
    # Print stderr if any
    if stderr_output:
        print(stderr_output, file=sys.stderr)
    
    # Parse result
    try:
        result = json.loads(output)
    except json.JSONDecodeError:
        print(output)
        sys.exit(exit_code)
    
    if result.get("success"):
        applied = result.get("applied", False)
        step_count = result.get("stepCount", 0)
        
        if applied:
            # Write result to file
            source_file.write_text(result["result"])
            print(f"✅ Injected {step_count} steps into {source_file}")
        else:
            # Show preview
            print(result["result"])
            print("")
            print(f"📋 Preview: {step_count} steps would be injected")
            print("   Run with --apply to apply changes")
        
        # Show unmatched steps warning
        unmatched = result.get("unmatchedSteps", [])
        if unmatched:
            print("")
            print("⚠️  Unmatched steps (will be inserted at suggested positions):")
            for test_info in unmatched:
                print(f"  Test: {test_info.get('testId', '(unnamed)')}")
                for step in test_info.get("steps", []):
                    step_index = step.get('stepIndex', 0)
                    action = step.get('action', '(unknown)')
                    suggested_line = step.get('suggestedLine', '?')
                    print(f"    - Step {step_index + 1}: {action} (suggested line {suggested_line})")
        
        sys.exit(0)
    else:
        error = result.get("error", "Unknown error")
        print(f"❌ Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
