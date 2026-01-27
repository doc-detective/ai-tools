import { describe, test, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../fixtures');

let validateTool: (input: any) => Promise<any>;

describe('Validate Tool', () => {
  beforeAll(async () => {
    try {
      const module = await import('../../../src/tools/validate.js');
      validateTool = module.validateTool;
    } catch (e) {
      // Expected to fail in RED phase
    }
  });

  test('validateTool function exists', () => {
    expect(validateTool).toBeDefined();
    expect(typeof validateTool).toBe('function');
  });

  test('accepts JSON string and validates successfully', async () => {
    const validSpec = JSON.stringify({
      tests: [
        {
          id: 'test-1',
          steps: [{ action: 'goTo', url: 'https://example.com' }],
        },
      ],
    });

    const result = await validateTool({
      spec_input: validSpec,
    });

    expect(result.success).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('accepts file path and validates', async () => {
    const result = await validateTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
    });

    expect(result.success).toBe(true);
  });

  test('detects invalid specs with clear error messages', async () => {
    const result = await validateTool({
      spec_input: path.join(fixturesDir, 'invalid-spec.json'),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('returns parsed spec when valid', async () => {
    const validSpec = JSON.stringify({
      tests: [
        {
          id: 'test-1',
          steps: [{ action: 'goTo', url: 'https://example.com' }],
        },
      ],
    });

    const result = await validateTool({
      spec_input: validSpec,
    });

    expect(result.spec).toBeDefined();
    expect(result.spec.tests).toBeDefined();
  });

  test('distinguishes errors vs warnings', async () => {
    const result = await validateTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
    });

    expect(result.errors).toBeDefined();
    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('handles malformed JSON gracefully', async () => {
    const result = await validateTool({
      spec_input: '{ invalid json }',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  test('handles missing files gracefully', async () => {
    const result = await validateTool({
      spec_input: '/nonexistent/path.json',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });
});
