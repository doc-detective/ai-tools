#!/usr/bin/env node
/**
 * Node.js loader for WASM-based validation
 *
 * Usage:
 *   node run.mjs <test-file.json>
 *   node run.mjs --stdin < test-spec.json
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed
 *   2 - Usage/input error
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { platform, arch } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, '..', 'dist');
const WASM_MODULE = join(DIST_DIR, 'validate-test.wasm');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const RUNTIME_DIR = join(REPO_ROOT, 'runtimes');

/**
 * Detect wasmtime path - bundled first, then system
 */
function detectWasmtime() {
  const platformMap = {
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
    'darwin-x64': 'darwin-x64',
    'darwin-arm64': 'darwin-arm64',
    'win32-x64': 'windows-x64',
    'win32-arm64': 'windows-arm64',
  };

  const currentPlatform = `${platform()}-${arch()}`;
  const platformDir = platformMap[currentPlatform];

  if (platformDir) {
    const binaryName = platform() === 'win32' ? 'wasmtime.exe' : 'wasmtime';
    const bundledPath = join(RUNTIME_DIR, platformDir, binaryName);

    if (existsSync(bundledPath)) {
      return bundledPath;
    }
  }

  // Fall back to system wasmtime
  return 'wasmtime';
}

/**
 * Run WASM module using wasmtime CLI
 */
function runWasmtime(wasmtimePath, wasmModule, inputJson) {
  return new Promise((resolve, reject) => {
    const child = spawn(wasmtimePath, ['run', wasmModule], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      // Extract exit code from JSON output
      let exitCode = code;
      try {
        const outputData = JSON.parse(stdout.trim());
        if (typeof outputData.exitCode === 'number') {
          exitCode = outputData.exitCode;
        }
      } catch (e) {
        // JSON parse failed, use process exit code
      }

      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
    });

    child.on('error', (err) => {
      reject(err);
    });

    // Write input and close stdin
    child.stdin.write(inputJson);
    child.stdin.end();
  });
}

/**
 * Read all stdin
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

function usage() {
  console.log(`
Usage: node run.mjs <test-file.json>
       node run.mjs --stdin < test-spec.json

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
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    usage();
    process.exit(2);
  }

  const arg = args[0];

  if (arg === '--help' || arg === '-h') {
    usage();
    process.exit(0);
  }

  let specJson;

  if (arg === '--stdin') {
    specJson = await readStdin();
  } else if (arg.startsWith('--')) {
    console.error(`Error: Unknown option: ${arg}`);
    usage();
    process.exit(2);
  } else {
    // File input
    if (!existsSync(arg)) {
      console.error(`Error: File not found: ${arg}`);
      process.exit(2);
    }
    specJson = readFileSync(arg, 'utf8');
  }

  // Check WASM module exists
  if (!existsSync(WASM_MODULE)) {
    console.error(`Error: WASM module not found: ${WASM_MODULE}`);
    console.error('Run build-wasm.sh to build the module.');
    process.exit(2);
  }

  // Get wasmtime path
  const wasmtimePath = detectWasmtime();

  // Prepare input
  const spec = JSON.parse(specJson);
  const inputJson = JSON.stringify({ action: 'validate', spec });

  try {
    const { stdout, stderr, exitCode } = await runWasmtime(wasmtimePath, WASM_MODULE, inputJson);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    process.exit(exitCode);
  } catch (err) {
    console.error(`Error running wasmtime: ${err.message}`);
    process.exit(2);
  }
}

main();
