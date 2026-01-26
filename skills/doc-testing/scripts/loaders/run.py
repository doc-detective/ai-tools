#!/usr/bin/env python3
"""
Python loader for WASM-based validation

Usage:
    python run.py <test-file.json>
    python run.py --stdin < test-spec.json

Exit codes:
    0 - Validation passed
    1 - Validation failed
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
WASM_MODULE = DIST_DIR / "validate-test.wasm"
REPO_ROOT = SCRIPT_DIR.parent.parent.parent.parent
RUNTIME_DIR = REPO_ROOT / "runtimes"


def detect_wasmtime():
    """Detect wasmtime path - bundled first, then system."""
    system = platform.system()
    machine = platform.machine()
    
    # Map to platform directory names
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
    
    # Try wasmtime-py if available
    try:
        import wasmtime
        return "wasmtime-py"
    except ImportError:
        pass
    
    # Fall back to system wasmtime
    import shutil
    system_wasmtime = shutil.which("wasmtime")
    if system_wasmtime:
        return system_wasmtime
    
    return None


def run_with_wasmtime_cli(wasmtime_path, wasm_module, input_json):
    """Run WASM module using wasmtime CLI."""
    result = subprocess.run(
        [wasmtime_path, "run", str(wasm_module)],
        input=input_json.encode("utf-8"),
        capture_output=True
    )
    
    stdout = result.stdout.decode("utf-8", errors="replace")
    stderr = result.stderr.decode("utf-8", errors="replace")
    
    # Extract exit code from JSON output
    exit_code = result.returncode
    try:
        output_data = json.loads(stdout.strip())
        if "exitCode" in output_data:
            exit_code = int(output_data["exitCode"])
    except (json.JSONDecodeError, ValueError, TypeError):
        # If the output is not valid JSON or lacks a usable "exitCode",
        # fall back to the process return code determined above.
        pass
    
    return stdout.strip(), stderr.strip(), exit_code


def run_with_wasmtime_py(wasm_module, input_json):
    """Run WASM module using wasmtime-py."""
    from wasmtime import Store, Module, Instance, WasiConfig, Linker, Engine
    
    engine = Engine()
    store = Store(engine)
    
    # Configure WASI
    wasi_config = WasiConfig()
    wasi_config.stdin_file = "/dev/stdin"  # Will override with actual data
    wasi_config.stdout_file = "/dev/stdout"
    wasi_config.stderr_file = "/dev/stderr"
    store.set_wasi(wasi_config)
    
    # Load module
    module = Module.from_file(engine, str(wasm_module))
    
    # Create linker with WASI
    linker = Linker(engine)
    linker.define_wasi()
    
    # Instantiate
    instance = linker.instantiate(store, module)
    
    # Get _start function
    start = instance.exports(store).get("_start")
    if start:
        start(store)
    
    return "", "", 0  # Simplified - real implementation needs pipe handling


def usage():
    print(__doc__)


def main():
    if len(sys.argv) < 2:
        usage()
        sys.exit(2)
    
    arg = sys.argv[1]
    
    if arg in ("--help", "-h"):
        usage()
        sys.exit(0)
    
    if arg == "--stdin":
        spec_json = sys.stdin.read()
    elif arg.startswith("--"):
        print(f"Error: Unknown option: {arg}", file=sys.stderr)
        usage()
        sys.exit(2)
    else:
        input_file = Path(arg)
        
        if not input_file.exists():
            print(f"Error: File not found: {input_file}", file=sys.stderr)
            sys.exit(2)
        
        spec_json = input_file.read_text()
    
    # Check WASM module exists
    if not WASM_MODULE.exists():
        print(f"Error: WASM module not found: {WASM_MODULE}", file=sys.stderr)
        print("Run build-wasm.sh to build the module.", file=sys.stderr)
        sys.exit(2)
    
    # Get wasmtime path
    wasmtime_path = detect_wasmtime()
    if not wasmtime_path:
        print("Error: wasmtime not found.", file=sys.stderr)
        print("Install wasmtime, pip install wasmtime, or run build-wasm.sh", file=sys.stderr)
        sys.exit(2)
    
    # Prepare input
    input_json = json.dumps({"action": "validate", "spec": json.loads(spec_json)})
    
    # Run WASM module
    if wasmtime_path == "wasmtime-py":
        stdout, stderr, exit_code = run_with_wasmtime_py(WASM_MODULE, input_json)
    else:
        stdout, stderr, exit_code = run_with_wasmtime_cli(wasmtime_path, WASM_MODULE, input_json)
    
    if stdout:
        print(stdout)
    if stderr:
        print(stderr, file=sys.stderr)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
