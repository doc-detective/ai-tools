# Wasmtime Runtimes

This directory contains platform-specific wasmtime runtime binaries used by the WASM-based skills.

## Directory Structure

```
runtimes/
├── linux-x64/
│   └── wasmtime
├── linux-arm64/
│   └── wasmtime
├── darwin-x64/
│   └── wasmtime
├── darwin-arm64/
│   └── wasmtime
├── windows-x64/
│   └── wasmtime.exe
└── windows-arm64/
    └── wasmtime.exe
```

## Version

These binaries are downloaded from the [Wasmtime releases](https://github.com/bytecodealliance/wasmtime/releases).

Current version: See the build scripts in individual skills for the version being used.

## Usage

Skills automatically detect the platform and use the appropriate runtime from this directory.
If a bundled runtime is not available for the platform, the skills will fall back to using a system-installed wasmtime.

## Building

The wasmtime binaries are downloaded by running the `build-wasm.sh` scripts in each skill:

```bash
cd skills/doc-testing/scripts
./build-wasm.sh

cd skills/inline-test-injection/scripts
./build-wasm.sh
```

## Security

The build scripts verify downloaded binaries against SHA-256 checksums to ensure integrity.
