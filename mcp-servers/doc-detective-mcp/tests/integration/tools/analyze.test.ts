import { describe, test, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../fixtures');

let analyzeTool: (input: any) => Promise<any>;

describe('Analyze Tool', () => {
  beforeAll(async () => {
    try {
      const module = await import('../../../src/tools/analyze.js');
      analyzeTool = module.analyzeTool;
    } catch (e) {
      // Expected to fail in RED phase
    }
  });

  test('analyzeTool function exists', () => {
    expect(analyzeTool).toBeDefined();
    expect(typeof analyzeTool).toBe('function');
  });

  test('accepts test results JSON string', async () => {
    const results = fs.readFileSync(
      path.join(fixturesDir, 'test-results.json'),
      'utf-8'
    );

    const result = await analyzeTool({
      results_input: results,
    });

    expect(result.success).toBe(true);
  });

  test('accepts test results file path', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });

    expect(result.success).toBe(true);
  });

  test('generates plaintext description of results', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });

    expect(result.analysis).toBeDefined();
    expect(typeof result.analysis).toBe('string');
    // Should be human-readable paragraphs, not JSON
    expect(result.analysis).not.toMatch(/^\s*[\[{]/);
  });

  test('includes overall pass/fail rate in plaintext', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });

    // Should mention pass rate or similar metrics
    expect(result.analysis.toLowerCase()).toMatch(/pass|fail|rate|%/);
  });

  test('identifies and describes failures in plaintext', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });

    // Our fixture has failures, so it should describe them
    expect(result.analysis.toLowerCase()).toMatch(/fail|error|issue/);
  });

  test('returns structured summary with metrics', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });

    expect(result.summary).toBeDefined();
    expect(typeof result.summary.total_tests).toBe('number');
    expect(typeof result.summary.pass_rate).toBe('number');
  });

  test('provides recommendations in plaintext', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });

    expect(result.summary.recommendations).toBeDefined();
    expect(Array.isArray(result.summary.recommendations)).toBe(true);
  });

  test('supports detailed mode', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
      detailed: true,
    });

    expect(result.success).toBe(true);
    // Detailed mode should produce longer analysis
    expect(result.analysis.length).toBeGreaterThan(50);
  });

  test('supports focus mode for failures', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
      focus: 'failures',
    });

    expect(result.success).toBe(true);
    expect(result.analysis.toLowerCase()).toMatch(/fail/);
  });

  test('handles invalid results gracefully', async () => {
    const result = await analyzeTool({
      results_input: '{ "invalid": "results" }',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  test('handles missing files gracefully', async () => {
    const result = await analyzeTool({
      results_input: '/nonexistent/results.json',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  test('returns human-readable message on success', async () => {
    const result = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });

    expect(result.message).toBeDefined();
    expect(typeof result.message).toBe('string');
  });
});
