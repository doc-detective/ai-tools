#!/usr/bin/env bash
set -e

cd src
bun --version
bun install
bun build --compile --minify validate-test.js --outfile ../dist/validate-test
bun build --compile --minify fix-tests.mjs --outfile ../dist/fix-tests