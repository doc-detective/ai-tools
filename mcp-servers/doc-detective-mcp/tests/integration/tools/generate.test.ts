import { describe, test, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../fixtures');

// Will be imported once implementation exists
let generateTool: (input: any) => Promise<any>;

describe('Generate Tool', () => {
  beforeAll(async () => {
    try {
      const module = await import('../../../src/tools/generate.js');
      generateTool = module.generateTool;
    } catch (e) {
      // Expected to fail in RED phase
    }
  });

  test('generateTool function exists', () => {
    expect(generateTool).toBeDefined();
    expect(typeof generateTool).toBe('function');
  });

  test('accepts documentation file and returns valid test spec', async () => {
    const result = await generateTool({
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });
    
    expect(result.success).toBe(true);
    expect(result.spec_json).toBeDefined();
    expect(result.spec_json.tests).toBeDefined();
    expect(Array.isArray(result.spec_json.tests)).toBe(true);
  });

  test('returns both JSON object and stringified format', async () => {
    const result = await generateTool({
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });
    
    expect(typeof result.spec_json).toBe('object');
    expect(typeof result.spec_string).toBe('string');
    expect(JSON.parse(result.spec_string)).toEqual(result.spec_json);
  });

  test('includes validation results in output', async () => {
    const result = await generateTool({
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });
    
    expect(result.validation).toBeDefined();
    expect(typeof result.validation.passed).toBe('boolean');
  });

  test('handles missing files with clear error message', async () => {
    const result = await generateTool({
      source_file: '/nonexistent/path/file.md',
    });
    
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message.toLowerCase()).toMatch(/not found|does not exist|no such file/);
  });

  test('handles empty files gracefully', async () => {
    const result = await generateTool({
      source_file: path.join(fixturesDir, 'empty.md'),
    });
    
    // Should either succeed with empty tests or fail gracefully
    expect(result).toBeDefined();
    expect(result.message).toBeDefined();
  });

  test('supports output_file option', async () => {
    const result = await generateTool({
      source_file: path.join(fixturesDir, 'sample-docs.md'),
      output_file: '/tmp/test-output-spec.json',
    });
    
    expect(result.success).toBe(true);
    expect(result.output_path).toBe('/tmp/test-output-spec.json');
  });

  test('returns human-readable message on success', async () => {
    const result = await generateTool({
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });
    
    expect(result.message).toBeDefined();
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});
