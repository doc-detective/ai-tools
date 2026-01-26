#!/usr/bin/env bash
# Install or download a Javy CLI binary for common platforms (best-effort).
# This helper is intended to run as a non-fatal `postinstall` step.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/../bin"
mkdir -p "$BIN_DIR"

JAVY_VERSION="v5.0.0"

info() { printf "[javy-helper] %s\n" "$1"; }
warn() { printf "[javy-helper] WARN: %s\n" "$1"; }
err() { printf "[javy-helper] ERROR: %s\n" "$1"; }

if command -v javy >/dev/null 2>&1; then
  info "javy already installed: $(command -v javy)"
  exit 0
fi

info "javy not found in PATH — attempting best-effort install into $BIN_DIR"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux) os_label="linux" ;;
  darwin) os_label="macos" ;;
  msys*|mingw*|cygwin*) os_label="windows" ;;
  *) os_label="unknown" ;;
esac

case "$ARCH" in
  x86_64|amd64) arch_label="x86_64" ;;
  aarch64|arm64) arch_label="arm" ;;
  *) arch_label="unknown" ;;
esac

if [ "$os_label" = "unknown" ] || [ "$arch_label" = "unknown" ]; then
  warn "Unsupported platform: OS=$OS ARCH=$ARCH"
  err "Please install Javy manually: https://github.com/bytecodealliance/javy/releases"
  exit 0
fi

asset_name="javy-${arch_label}-${os_label}-${JAVY_VERSION}"
download_url="https://github.com/bytecodealliance/javy/releases/download/${JAVY_VERSION}/${asset_name}.gz"
checksum_url="https://github.com/bytecodealliance/javy/releases/download/${JAVY_VERSION}/${asset_name}.gz.sha256"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Function to verify checksum
verify_checksum() {
  local file="$1"
  local checksum_file="$2"
  
  if [ ! -f "$checksum_file" ]; then
    warn "Checksum file not found, skipping verification"
    return 0
  fi
  
  # Extract expected checksum (first field in the file)
  local expected_checksum=$(awk '{print $1}' "$checksum_file")
  
  if [ -z "$expected_checksum" ]; then
    warn "Could not parse checksum, skipping verification"
    return 0
  fi
  
  # Calculate actual checksum
  local actual_checksum
  if command -v sha256sum >/dev/null 2>&1; then
    actual_checksum=$(sha256sum "$file" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual_checksum=$(shasum -a 256 "$file" | awk '{print $1}')
  else
    warn "sha256sum/shasum not available, skipping checksum verification"
    return 0
  fi
  
  if [ "$actual_checksum" = "$expected_checksum" ]; then
    info "Checksum verification passed"
    return 0
  else
    err "Checksum verification failed!"
    err "Expected: $expected_checksum"
    err "Got:      $actual_checksum"
    return 1
  fi
}

info "Attempting to download $download_url"

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsSL "$download_url" -o "$tmpdir/asset.gz"; then
    warn "Download failed (curl)"
  else
    # Download checksum file
    info "Downloading checksum..."
    if curl -fsSL "$checksum_url" -o "$tmpdir/asset.gz.sha256" 2>/dev/null; then
      # Verify checksum
      if ! verify_checksum "$tmpdir/asset.gz" "$tmpdir/asset.gz.sha256"; then
        warn "Checksum verification failed, aborting install for security"
      else
        gunzip -c "$tmpdir/asset.gz" > "$BIN_DIR/javy" || true
        chmod +x "$BIN_DIR/javy" || true
        if [ -x "$BIN_DIR/javy" ]; then
          info "Installed javy to $BIN_DIR/javy"
          info "Add $BIN_DIR to your PATH, or move the binary to /usr/local/bin"
          exit 0
        fi
      fi
    else
      warn "Could not download checksum file, skipping install for security"
    fi
  fi
elif command -v wget >/dev/null 2>&1; then
  if ! wget -qO "$tmpdir/asset.gz" "$download_url"; then
    warn "Download failed (wget)"
  else
    # Download checksum file
    info "Downloading checksum..."
    if wget -qO "$tmpdir/asset.gz.sha256" "$checksum_url" 2>/dev/null; then
      # Verify checksum
      if ! verify_checksum "$tmpdir/asset.gz" "$tmpdir/asset.gz.sha256"; then
        warn "Checksum verification failed, aborting install for security"
      else
        gunzip -c "$tmpdir/asset.gz" > "$BIN_DIR/javy" || true
        chmod +x "$BIN_DIR/javy" || true
        if [ -x "$BIN_DIR/javy" ]; then
          info "Installed javy to $BIN_DIR/javy"
          info "Add $BIN_DIR to your PATH, or move the binary to /usr/local/bin"
          exit 0
        fi
      fi
    else
      warn "Could not download checksum file, skipping install for security"
    fi
  fi
else
  warn "Neither curl nor wget available to download Javy"
fi

warn "Automatic download/install failed or is not available for your platform."
info "Manual install instructions:"
cat <<EOF
  1) Visit: https://github.com/bytecodealliance/javy/releases
  2) Download the prebuilt binary for your platform (example: javy-x86_64-linux-${JAVY_VERSION}.gz)
  3) Download the corresponding .sha256 file and verify the checksum
  4) Extract and place the binary in a directory on your PATH, e.g. /usr/local/bin
     Example (Linux/macOS):
       curl -L <asset-url> -o javy.gz
       curl -L <checksum-url> -o javy.gz.sha256
       sha256sum -c javy.gz.sha256  # or: shasum -a 256 -c javy.gz.sha256
       gunzip javy.gz && chmod +x javy && mv javy /usr/local/bin/
  5) Verify: javy --version
EOF

exit 0
