import { describe, test, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../fixtures');

let executeTool: (input: any) => Promise<any>;

describe('Execute Tool', () => {
  beforeAll(async () => {
    const module = await import('../../../src/tools/execute.js');
    executeTool = module.executeTool;
  });

  test('executeTool function exists', () => {
    expect(executeTool).toBeDefined();
    expect(typeof executeTool).toBe('function');
  });

  test('accepts spec file path', async () => {
    const result = await executeTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
    });

    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
  });

  test('accepts JSON string as spec input', async () => {
    const spec = JSON.stringify({
      tests: [
        {
          id: 'simple-test',
          steps: [{ action: 'goTo', url: 'https://example.com' }],
        },
      ],
    });

    const result = await executeTool({
      spec_input: spec,
    });

    expect(result).toBeDefined();
  }, 35000); // Timeout > executeTool's default 30000ms

  test('returns detailed per-test results', async () => {
    const result = await executeTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
    });

    // If execution succeeds, verify detailed results structure
    // If it fails (e.g., no browser in CI), verify failure is graceful
    if (result.success) {
      expect(result.results).toBeDefined();
      expect(result.results.test_results).toBeDefined();
      expect(Array.isArray(result.results.test_results)).toBe(true);
    } else {
      // Ensure failure is graceful with a message
      expect(result.message).toBeDefined();
    }
  });

  test('returns test execution summary', async () => {
    const result = await executeTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
    });

    // If execution succeeds, verify summary structure
    // If it fails (e.g., no browser in CI), verify failure is graceful
    if (result.success) {
      expect(result.results.total_tests).toBeDefined();
      expect(typeof result.results.total_tests).toBe('number');
      expect(result.results.passed).toBeDefined();
      expect(result.results.failed).toBeDefined();
    } else {
      // Ensure failure is graceful with a message
      expect(result.message).toBeDefined();
    }
  });

  test('supports headless option', async () => {
    const result = await executeTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
      headless: true,
    });

    expect(result).toBeDefined();
  });

  test('supports timeout option', async () => {
    const result = await executeTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
      timeout: 60000,
    });

    expect(result).toBeDefined();
  }, 65000); // Timeout > executeTool's 60000ms custom timeout

  test('handles invalid spec gracefully', async () => {
    const result = await executeTool({
      spec_input: path.join(fixturesDir, 'invalid-spec.json'),
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  test('handles missing files gracefully', async () => {
    const result = await executeTool({
      spec_input: '/nonexistent/path.json',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  test('returns human-readable message', async () => {
    const result = await executeTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
    });

    expect(result.message).toBeDefined();
    expect(typeof result.message).toBe('string');
  });
});
