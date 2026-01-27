import { describe, test, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../fixtures');

let injectTool: (input: any) => Promise<any>;

describe('Inject Tool', () => {
  beforeAll(async () => {
    try {
      const module = await import('../../../src/tools/inject.js');
      injectTool = module.injectTool;
    } catch (e) {
      // Expected to fail in RED phase
    }
  });

  test('injectTool function exists', () => {
    expect(injectTool).toBeDefined();
    expect(typeof injectTool).toBe('function');
  });

  test('accepts spec file and source file', async () => {
    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });

    expect(result).toBeDefined();
  });

  test('returns preview by default (non-destructive)', async () => {
    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });

    expect(result.applied).toBe(false);
    expect(result.preview).toBeDefined();
  });

  test('applies changes when apply is true', async () => {
    // Create a temp file for this test
    const tempFile = '/tmp/test-inject-doc.md';
    const originalContent = fs.readFileSync(
      path.join(fixturesDir, 'sample-docs.md'),
      'utf-8'
    );
    fs.writeFileSync(tempFile, originalContent);

    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: tempFile,
      apply: true,
    });

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);

    // Cleanup
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  });

  test('returns modified source content', async () => {
    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });

    expect(result.modified_source).toBeDefined();
    expect(typeof result.modified_source).toBe('string');
  });

  test('reports number of inline comments added', async () => {
    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });

    expect(result.changes).toBeDefined();
    expect(typeof result.changes.inline_comments_added).toBe('number');
  });

  test('supports syntax option for comment format', async () => {
    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: path.join(fixturesDir, 'sample-docs.md'),
      syntax: 'yaml',
    });

    expect(result).toBeDefined();
  });

  test('handles missing spec file gracefully', async () => {
    const result = await injectTool({
      spec_file: '/nonexistent/spec.json',
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  test('handles missing source file gracefully', async () => {
    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: '/nonexistent/doc.md',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  test('returns human-readable message', async () => {
    const result = await injectTool({
      spec_file: path.join(fixturesDir, 'sample-spec.json'),
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });

    expect(result.message).toBeDefined();
    expect(typeof result.message).toBe('string');
  });
});
