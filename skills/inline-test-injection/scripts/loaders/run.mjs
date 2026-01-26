#!/usr/bin/env node
/**
 * Node.js loader for inline-test-injection WASM module
 *
 * Usage:
 *   node run.mjs <spec-file> <source-file> [--apply] [--syntax json|yaml|xml]
 *
 * Exit codes:
 *   0 - Success
 *   1 - Injection failed
 *   2 - Usage/input error
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { spawn } from 'child_process';
import { platform, arch } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, '..', 'dist');
const WASM_MODULE = join(DIST_DIR, 'inject-inline.wasm');
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

  return 'wasmtime';
}

/**
 * Parse spec file (JSON or YAML)
 */
async function parseSpecFile(specPath) {
  const content = readFileSync(specPath, 'utf8');
  const ext = extname(specPath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    try {
      const { parse } = await import('yaml');
      return parse(content);
    } catch (err) {
      console.error('Error: YAML files require yaml package (npm install yaml)');
      process.exit(2);
    }
  }

  return JSON.parse(content);
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
      let exitCode = code;

      // Extract exit code from JSON output
      try {
        const outputData = JSON.parse(stdout.trim());
        if (typeof outputData.exitCode === 'number') {
          exitCode = outputData.exitCode;
        }
      } catch {
        // JSON parsing failed, use process exit code
      }

      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.stdin.write(inputJson);
    child.stdin.end();
  });
}

function usage() {
  console.log(`
Usage: node run.mjs <spec-file> <source-file> [options]

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
  node run.mjs tests/search.json docs/guide.md
  node run.mjs tests/search.yaml docs/guide.md --apply
  node run.mjs tests/api.json docs/api.mdx --syntax yaml
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 2);
  }

  // Parse arguments
  let specFile = null;
  let sourceFile = null;
  let apply = false;
  let syntax = 'json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--syntax') {
      if (!args[i + 1]) {
        console.error('Error: --syntax requires an argument');
        process.exit(2);
      }
      syntax = args[++i];
    } else if (arg.startsWith('--')) {
      console.error(`Error: Unknown option: ${arg}`);
      usage();
      process.exit(2);
    } else if (!specFile) {
      specFile = arg;
    } else if (!sourceFile) {
      sourceFile = arg;
    } else {
      console.error(`Error: Unexpected argument: ${arg}`);
      usage();
      process.exit(2);
    }
  }

  if (!specFile || !sourceFile) {
    console.error('Error: Both spec-file and source-file are required');
    usage();
    process.exit(2);
  }

  // Validate files
  if (!existsSync(specFile)) {
    console.error(`Error: Spec file not found: ${specFile}`);
    process.exit(2);
  }

  if (!existsSync(sourceFile)) {
    console.error(`Error: Source file not found: ${sourceFile}`);
    process.exit(2);
  }

  // Check WASM module
  if (!existsSync(WASM_MODULE)) {
    console.error(`Error: WASM module not found: ${WASM_MODULE}`);
    console.error('Run build-wasm.sh to build the module.');
    process.exit(2);
  }

  // Get wasmtime
  const wasmtimePath = detectWasmtime();

  // Parse spec and read source
  const spec = await parseSpecFile(specFile);
  const sourceContent = readFileSync(sourceFile, 'utf8');

  // Build input
  const inputObj = {
    action: 'inject',
    spec,
    sourceContent,
    sourcePath: sourceFile,
    options: {
      apply,
      syntax,
    },
  };
  const inputJson = JSON.stringify(inputObj);

  try {
    const { stdout, stderr, exitCode } = await runWasmtime(wasmtimePath, WASM_MODULE, inputJson);

    // Print stderr if any
    if (stderr) {
      console.error(stderr);
    }

    // Parse result
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      console.log(stdout);
      process.exit(exitCode);
    }

    if (result.success) {
      const { applied, stepCount, unmatchedSteps } = result;

      if (applied) {
        writeFileSync(sourceFile, result.result, 'utf8');
        console.log(`✅ Injected ${stepCount} steps into ${sourceFile}`);
      } else {
        console.log(result.result);
        console.log('');
        console.log(`📋 Preview: ${stepCount} steps would be injected`);
        console.log('   Run with --apply to apply changes');
      }

      // Show unmatched steps warning
      if (unmatchedSteps && unmatchedSteps.length > 0) {
        console.log('');
        console.log('⚠️  Unmatched steps (will be inserted at suggested positions):');
        for (const testInfo of unmatchedSteps) {
          console.log(`  Test: ${testInfo.testId || '(unnamed)'}`);
          for (const step of testInfo.steps || []) {
            console.log(`    - Step ${step.stepIndex + 1}: ${step.action} (suggested line ${step.suggestedLine})`);
          }
        }
      }

      process.exit(0);
    } else {
      console.error(`❌ Error: ${result.error || 'Unknown error'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error running wasmtime: ${err.message}`);
    process.exit(2);
  }
}

main();
