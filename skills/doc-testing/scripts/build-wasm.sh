#!/bin/bash
# Build script for WASM-based validation
#
# Compiles JavaScript to WASM using Javy and downloads bundled runtimes.
#
# Prerequisites:
#   - Node.js (for esbuild bundling)
#   - Javy CLI (for JS -> WASM compilation)
#   - curl (for downloading runtimes)
#
# Usage:
#   ./build-wasm.sh              # Full build
#   ./build-wasm.sh --no-runtime # Skip runtime download
#   ./build-wasm.sh --runtime-only # Only download runtimes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
DIST_DIR="$SCRIPT_DIR/dist"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RUNTIME_DIR="$REPO_ROOT/runtimes"

# Parse arguments
DOWNLOAD_RUNTIME=true
BUILD_WASM=true

for arg in "$@"; do
    case $arg in
        --no-runtime)
            DOWNLOAD_RUNTIME=false
            ;;
        --runtime-only)
            BUILD_WASM=false
            ;;
    esac
done

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Create dist directory
mkdir -p "$DIST_DIR"

# =============================================================================
# WASM COMPILATION
# =============================================================================

if [ "$BUILD_WASM" = true ]; then
    log "Building WASM module..."
    
    # Check for javy
    if ! command -v javy &> /dev/null; then
        echo "Error: Javy CLI not found. Install from: https://github.com/bytecodealliance/javy"
        echo "  curl -L https://github.com/bytecodealliance/javy/releases/download/v8.0.0/javy-x86_64-linux-v8.0.0.gz | gunzip > /usr/local/bin/javy && chmod +x /usr/local/bin/javy"
        exit 1
    fi
    
    log "Javy version: $(javy --version)"
    
    # Bundle with esbuild if there are dependencies
    # For this module, we don't have external deps in the WASM version, so we skip bundling
    # If needed: npx esbuild src/validate-test-wasm.js --bundle --platform=neutral --format=esm --outfile=dist/bundled.js
    
    # Compile to WASM
    log "Compiling validate-test-wasm.js to WASM..."
    javy build "$SRC_DIR/validate-test-wasm.js" -o "$DIST_DIR/validate-test.wasm"
    
    # Check size
    WASM_SIZE=$(ls -lh "$DIST_DIR/validate-test.wasm" | awk '{print $5}')
    log "WASM module created: $DIST_DIR/validate-test.wasm ($WASM_SIZE)"
fi

# =============================================================================
# RUNTIME DOWNLOAD
# =============================================================================

if [ "$DOWNLOAD_RUNTIME" = true ]; then
    log "Downloading wasmtime runtimes..."
    
    # Wasmtime version to use
    WASMTIME_VERSION="v41.0.0"
    log "Using wasmtime $WASMTIME_VERSION"
    
    # SHA-256 checksums for wasmtime v41.0.0 (for integrity verification)
    # These checksums were computed from official releases at:
    # https://github.com/bytecodealliance/wasmtime/releases/tag/v41.0.0
    # Note: Wasmtime does not publish official checksums, so these are recorded
    # here for verification purposes.
    #
    # If you're using pre-existing binaries from the runtimes/ directory,
    # checksum verification will be skipped since we only verify archives.
    declare -A CHECKSUMS=(
        ["wasmtime-v41.0.0-x86_64-linux.tar.xz"]="07b82a195dc3bda0be010f73d48778b43a209829e9912a4bcd46a8e3760d74e9"
        ["wasmtime-v41.0.0-aarch64-linux.tar.xz"]="99d9dd1e314f60eb96256615685bc28f8669b613efcf162881abdf5ad646d35a"
        ["wasmtime-v41.0.0-x86_64-macos.tar.xz"]="ec91e9d4130fe1776bde8601c2dffde299dc59b4dbdad6f8f471bac04bd86094"
        ["wasmtime-v41.0.0-aarch64-macos.tar.xz"]="3f8520e697e9d2105fc8e5c77f03185a75629065d0b84c90b8e57e09adb029f1"
        ["wasmtime-v41.0.0-x86_64-windows.zip"]="78f4216dffdce4a8b2310bff6e019c1ea9d2935d72e4ccdb7cd7bcbc5907fd0a"
        ["wasmtime-v41.0.0-aarch64-windows.zip"]="15528c688f54990d37e7d17479712a4d73314973e6d4b0658848535cc2283f91"
    )
    
    # Function to verify checksum if available
    verify_checksum() {
        local file="$1"
        local archive_name="$2"
        
        local expected="${CHECKSUMS[$archive_name]:-}"
        if [ -z "$expected" ]; then
            error "No checksum available for $archive_name - cannot verify integrity"
            error "This is a security requirement. Please add the checksum to CHECKSUMS."
            return 1
        fi
        
        local actual
        if command -v sha256sum >/dev/null 2>&1; then
            actual=$(sha256sum "$file" | awk '{print $1}')
        elif command -v shasum >/dev/null 2>&1; then
            actual=$(shasum -a 256 "$file" | awk '{print $1}')
        else
            error "sha256sum/shasum not available - cannot verify integrity"
            return 1
        fi
        
        if [ "$actual" = "$expected" ]; then
            log "    Checksum verified"
            return 0
        else
            error "Checksum mismatch for $archive_name"
            error "Expected: $expected"
            error "Got:      $actual"
            return 1
        fi
    }
    
    # Platform configurations: name, archive_suffix, binary_name, extract_command
    declare -A PLATFORMS=(
        ["linux-x64"]="x86_64-linux|.tar.xz|wasmtime|tar -xJf"
        ["linux-arm64"]="aarch64-linux|.tar.xz|wasmtime|tar -xJf"
        ["darwin-x64"]="x86_64-macos|.tar.xz|wasmtime|tar -xJf"
        ["darwin-arm64"]="aarch64-macos|.tar.xz|wasmtime|tar -xJf"
        ["windows-x64"]="x86_64-windows|.zip|wasmtime.exe|unzip -o"
        ["windows-arm64"]="aarch64-windows|.zip|wasmtime.exe|unzip -o"
    )
    
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT
    
    for platform in "${!PLATFORMS[@]}"; do
        IFS='|' read -r arch_name archive_suffix binary_name extract_cmd <<< "${PLATFORMS[$platform]}"
        
        PLATFORM_DIR="$RUNTIME_DIR/$platform"
        mkdir -p "$PLATFORM_DIR"
        
        # Skip if already exists
        if [ -f "$PLATFORM_DIR/$binary_name" ]; then
            log "  $platform: already exists, skipping"
            continue
        fi
        
        ARCHIVE_NAME="wasmtime-${WASMTIME_VERSION}-${arch_name}${archive_suffix}"
        URL="https://github.com/bytecodealliance/wasmtime/releases/download/${WASMTIME_VERSION}/${ARCHIVE_NAME}"
        
        log "  $platform: downloading $ARCHIVE_NAME..."
        
        # Download
        if ! curl -sL "$URL" -o "$TEMP_DIR/$ARCHIVE_NAME"; then
            warn "    Failed to download $platform"
            continue
        fi
        
        # Verify checksum
        if ! verify_checksum "$TEMP_DIR/$ARCHIVE_NAME" "$ARCHIVE_NAME"; then
            warn "    Checksum verification failed for $platform, skipping for security"
            continue
        fi
        
        # Extract
        cd "$TEMP_DIR"
        if [[ "$archive_suffix" == ".tar.xz" ]]; then
            tar -xJf "$ARCHIVE_NAME"
        else
            unzip -o -q "$ARCHIVE_NAME"
        fi
        
        # Find and copy binary
        EXTRACTED_DIR=$(ls -d wasmtime-${WASMTIME_VERSION}-${arch_name}* 2>/dev/null | head -1)
        if [ -n "$EXTRACTED_DIR" ] && [ -f "$EXTRACTED_DIR/$binary_name" ]; then
            cp "$EXTRACTED_DIR/$binary_name" "$PLATFORM_DIR/$binary_name"
            chmod +x "$PLATFORM_DIR/$binary_name"
            BINARY_SIZE=$(ls -lh "$PLATFORM_DIR/$binary_name" | awk '{print $5}')
            log "    $platform: installed ($BINARY_SIZE)"
        else
            warn "    $platform: binary not found in archive"
        fi
        
        # Cleanup temp files
        rm -rf "$TEMP_DIR"/*
        cd "$SCRIPT_DIR"
    done
    
    log "Runtime download complete"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
log "Build complete!"

if [ "$BUILD_WASM" = true ]; then
    echo "  WASM module: $DIST_DIR/validate-test.wasm"
fi

if [ "$DOWNLOAD_RUNTIME" = true ]; then
    echo "  Runtimes:"
    for platform in linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64 windows-arm64; do
        if [ -f "$RUNTIME_DIR/$platform/wasmtime" ] || [ -f "$RUNTIME_DIR/$platform/wasmtime.exe" ]; then
            echo "    - $platform"
        fi
    done
fi

echo ""
echo "To test: ./test-wasm.sh"
