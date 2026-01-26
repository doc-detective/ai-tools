#!/usr/bin/env bash
# Build script for inline-test-injection WASM module
# Compiles JavaScript to WebAssembly using Javy and downloads wasmtime runtimes

set -euo pipefail

# Check for Bash 4+ (required for associative arrays)
if [ -z "${BASH_VERSINFO[0]}" ] || [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
    echo "Error: Bash 4+ required for associative arrays (declare -A). Please install newer bash." >&2
    echo "Current version: $BASH_VERSION" >&2
    echo "" >&2
    echo "On macOS, you can install Bash 4+ with:" >&2
    echo "  brew install bash" >&2
    echo "  # Then run this script with the new bash: /usr/local/bin/bash $0" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
DIST_DIR="$SCRIPT_DIR/dist"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RUNTIME_DIR="$REPO_ROOT/runtimes"
BUNDLED_JS="$DIST_DIR/inject-inline.bundled.js"
WASM_OUTPUT="$DIST_DIR/inject-inline.wasm"

# Wasmtime version to download
WASMTIME_VERSION="v29.0.1"

# SHA-256 checksums for wasmtime v29.0.1 (for integrity verification)
# These checksums were computed from official releases at:
# https://github.com/bytecodealliance/wasmtime/releases/tag/v29.0.1
# Note: Wasmtime does not publish official checksums, so these are recorded
# here for verification purposes.
#
# If you're using pre-existing binaries from the runtimes/ directory,
# checksum verification will be skipped since we only verify archives.
declare -A WASMTIME_CHECKSUMS=(
    ["wasmtime-v29.0.1-x86_64-linux.tar.xz"]="579ec7086f34ff6bbc53483ae00f660be1570f3ef10af0880a4ba9867067a77c"
    ["wasmtime-v29.0.1-aarch64-linux.tar.xz"]="5db4d27d008d726fe69adf8fcf59f42b0c2f0e51519970414860efda8b5e9655"
    ["wasmtime-v29.0.1-x86_64-macos.tar.xz"]="7f62746a61c759932f4307cec32f139b31c9e5db93eab6c02238dcb82bd9a6d8"
    ["wasmtime-v29.0.1-aarch64-macos.tar.xz"]="56fb3c04c230eabcce92717081c51d3dc87d3416c3b059a2783e5496a29cf384"
    ["wasmtime-v29.0.1-x86_64-windows.zip"]="3d4c7b4145fb4426c4ece54302f598c33998f9d2cc8894059d7103b83d3dddff"
    ["wasmtime-v29.0.1-aarch64-windows.zip"]="93b4a2bcbe9ad9c0505b246c6bd38550428be05876995230b607fde35bd772f1"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check for required tools
check_dependencies() {
    local missing=()
    
    if ! command -v npm &>/dev/null; then
        missing+=("npm")
    fi
    
    if ! command -v javy &>/dev/null; then
        missing+=("javy")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        echo ""
        echo "Installation instructions:"
        echo "  npm: Install Node.js from https://nodejs.org"
        echo "  javy: cargo install javy-cli"
        echo "        or download from https://github.com/bytecodealliance/javy/releases"
        exit 1
    fi
}

# Create dist directory structure
setup_directories() {
    log_info "Setting up directories..."
    mkdir -p "$DIST_DIR"
    mkdir -p "$RUNTIME_DIR"
}

# Bundle JavaScript with esbuild
bundle_javascript() {
    log_info "Bundling JavaScript with esbuild..."
    
    # Install esbuild if not available
    if ! command -v esbuild &>/dev/null; then
        log_info "Installing esbuild..."
        npm install -g esbuild
    fi
    
    # Bundle all modules into single file
    esbuild "$SRC_DIR/inject-inline-wasm.mjs" \
        --bundle \
        --platform=neutral \
        --format=esm \
        --target=es2020 \
        --outfile="$BUNDLED_JS"
    
    log_info "Bundle created: $BUNDLED_JS"
}

# Compile to WebAssembly using Javy
compile_wasm() {
    log_info "Compiling to WebAssembly with Javy..."
    
    javy build "$BUNDLED_JS" -o "$WASM_OUTPUT"
    
    local size=$(stat -f%z "$WASM_OUTPUT" 2>/dev/null || stat -c%s "$WASM_OUTPUT" 2>/dev/null)
    log_info "WASM module created: $WASM_OUTPUT ($(( size / 1024 )) KB)"
}

# Verify checksum of downloaded archive
verify_wasmtime_checksum() {
    local archive_file="$1"
    local archive_name="$2"
    
    local expected="${WASMTIME_CHECKSUMS[$archive_name]:-}"
    if [ -z "$expected" ]; then
        log_error "No checksum available for $archive_name - cannot verify integrity"
        log_error "This is a security requirement. Please add the checksum to WASMTIME_CHECKSUMS."
        return 1
    fi
    
    local actual
    if command -v sha256sum &>/dev/null; then
        actual=$(sha256sum "$archive_file" | awk '{print $1}')
    elif command -v shasum &>/dev/null; then
        actual=$(shasum -a 256 "$archive_file" | awk '{print $1}')
    else
        log_error "sha256sum/shasum not available - cannot verify integrity"
        return 1
    fi
    
    if [ "$actual" = "$expected" ]; then
        log_info "Checksum verified for $archive_name"
        return 0
    else
        log_error "Checksum mismatch for $archive_name"
        log_error "Expected: $expected"
        log_error "Got:      $actual"
        return 1
    fi
}

# Download wasmtime runtime for a specific platform
download_runtime() {
    local platform=$1
    local target_dir="$RUNTIME_DIR/$platform"
    
    # Map platform names to wasmtime release names
    local release_name
    case "$platform" in
        linux-x64)   release_name="x86_64-linux" ;;
        linux-arm64) release_name="aarch64-linux" ;;
        darwin-x64)  release_name="x86_64-macos" ;;
        darwin-arm64) release_name="aarch64-macos" ;;
        windows-x64) release_name="x86_64-windows" ;;
        windows-arm64) release_name="aarch64-windows" ;;
        *)
            log_warn "Unknown platform: $platform"
            return 1
            ;;
    esac
    
    # Determine archive extension
    local ext="tar.xz"
    if [[ "$platform" == windows-* ]]; then
        ext="zip"
    fi
    
    local download_url="https://github.com/bytecodealliance/wasmtime/releases/download/${WASMTIME_VERSION}/wasmtime-${WASMTIME_VERSION}-${release_name}.${ext}"
    local archive_file="$RUNTIME_DIR/wasmtime-${platform}.${ext}"
    
    # Check if already downloaded
    local binary_name="wasmtime"
    if [[ "$platform" == windows-* ]]; then
        binary_name="wasmtime.exe"
    fi
    
    if [ -f "$target_dir/$binary_name" ]; then
        log_info "Runtime already exists: $platform"
        return 0
    fi
    
    log_info "Downloading wasmtime for $platform..."
    
    # Download
    if command -v curl &>/dev/null; then
        curl -fsSL "$download_url" -o "$archive_file"
    elif command -v wget &>/dev/null; then
        wget -q "$download_url" -O "$archive_file"
    else
        log_error "Neither curl nor wget available for download"
        return 1
    fi
    
    # Verify checksum
    local archive_basename=$(basename "$download_url")
    if ! verify_wasmtime_checksum "$archive_file" "$archive_basename"; then
        log_error "Checksum verification failed for $platform, skipping for security"
        rm -f "$archive_file"
        return 1
    fi
    
    # Extract
    mkdir -p "$target_dir"
    
    if [[ "$ext" == "tar.xz" ]]; then
        tar -xJf "$archive_file" -C "$target_dir" --strip-components=1
    else
        # Windows zip
        if command -v unzip &>/dev/null; then
            unzip -q "$archive_file" -d "$target_dir"
            # Move contents from nested directory
            mv "$target_dir"/wasmtime-*/* "$target_dir/" 2>/dev/null || true
            rmdir "$target_dir"/wasmtime-* 2>/dev/null || true
        else
            log_warn "unzip not available, skipping Windows runtime"
            rm -f "$archive_file"
            return 1
        fi
    fi
    
    # Cleanup archive
    rm -f "$archive_file"
    
    # Make executable
    chmod +x "$target_dir/$binary_name" 2>/dev/null || true
    
    log_info "Installed wasmtime for $platform"
}

# Download all platform runtimes
download_all_runtimes() {
    log_info "Downloading wasmtime runtimes..."
    
    local platforms=(
        "linux-x64"
        "linux-arm64"
        "darwin-x64"
        "darwin-arm64"
        "windows-x64"
        "windows-arm64"
    )
    
    for platform in "${platforms[@]}"; do
        download_runtime "$platform" || log_warn "Failed to download runtime for $platform"
    done
}

# Clean build artifacts
clean() {
    log_info "Cleaning build artifacts..."
    rm -rf "$DIST_DIR"
    log_info "Clean complete"
}

# Main build process
build() {
    log_info "Starting build process..."
    
    check_dependencies
    setup_directories
    bundle_javascript
    compile_wasm
    download_all_runtimes
    
    log_info "Build complete!"
    echo ""
    echo "Output files:"
    echo "  WASM module: $WASM_OUTPUT"
    echo "  Runtimes:    $RUNTIME_DIR/"
    echo ""
    echo "Usage:"
    echo "  ./loaders/run.sh <spec-file> <source-file> [--apply]"
    echo "  python loaders/run.py <spec-file> <source-file> [--apply]"
    echo "  node loaders/run.mjs <spec-file> <source-file> [--apply]"
}

# Parse arguments
case "${1:-build}" in
    build)
        build
        ;;
    clean)
        clean
        ;;
    runtimes)
        download_all_runtimes
        ;;
    wasm)
        check_dependencies
        setup_directories
        bundle_javascript
        compile_wasm
        ;;
    *)
        echo "Usage: $0 [build|clean|runtimes|wasm]"
        echo ""
        echo "Commands:"
        echo "  build     Full build (default): bundle, compile, download runtimes"
        echo "  clean     Remove all build artifacts"
        echo "  runtimes  Download wasmtime runtimes only"
        echo "  wasm      Build WASM module only (no runtime download)"
        exit 1
        ;;
esac
