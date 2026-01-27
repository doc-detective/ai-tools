import { describe, test, expect } from '@jest/globals';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('Spec Handler Utils', () => {
  let loadSpec: any;
  let serializeSpec: any;
  let hasValidStructure: any;

  beforeAll(async () => {
    const module = await import('../../src/utils/spec-handler.js');
    loadSpec = module.loadSpec;
    serializeSpec = module.serializeSpec;
    hasValidStructure = module.hasValidStructure;
  });

  test('loadSpec parses inline JSON correctly', () => {
    const json = JSON.stringify({ tests: [{ id: 'test-1', steps: [] }] });
    const result = loadSpec(json);
    expect(result.success).toBe(true);
    expect(result.spec?.tests).toBeDefined();
  });

  test('loadSpec parses JSON file correctly', () => {
    const result = loadSpec(path.join(fixturesDir, 'sample-spec.json'));
    expect(result.success).toBe(true);
    expect(result.spec?.tests).toBeDefined();
  });

  test('loadSpec returns error for invalid JSON', () => {
    const result = loadSpec('{ invalid json }');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('loadSpec returns error for non-existent file', () => {
    const result = loadSpec('/nonexistent/path.json');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('serializeSpec produces valid JSON', () => {
    const spec = { tests: [{ id: 'test-1', steps: [] }] };
    const result = serializeSpec(spec);
    expect(JSON.parse(result)).toEqual(spec);
  });

  test('serializeSpec supports non-pretty format', () => {
    const spec = { tests: [] };
    const result = serializeSpec(spec, false);
    expect(result).not.toContain('\n');
  });

  test('hasValidStructure returns true for valid spec', () => {
    expect(hasValidStructure({ tests: [] })).toBe(true);
  });

  test('hasValidStructure returns false for null', () => {
    expect(hasValidStructure(null)).toBe(false);
  });

  test('hasValidStructure returns false for non-object', () => {
    expect(hasValidStructure('string')).toBe(false);
  });

  test('hasValidStructure returns false for missing tests array', () => {
    expect(hasValidStructure({ notTests: [] })).toBe(false);
  });
});

describe('Config Utils', () => {
  let loadConfig: any;
  let mergeConfig: any;

  beforeAll(async () => {
    const module = await import('../../src/utils/config.js');
    loadConfig = module.loadConfig;
    mergeConfig = module.mergeConfig;
  });

  test('loadConfig returns defaults when no config file', () => {
    const config = loadConfig(undefined, '/nonexistent/path');
    expect(config).toBeDefined();
    expect(config.input).toBeDefined();
    expect(config.output).toBeDefined();
  });

  test('loadConfig loads from explicit path', () => {
    const config = loadConfig(path.join(fixturesDir, '.doc-detective.json'));
    expect(config.input).toContain('**/*.md');
  });

  test('mergeConfig overrides values', () => {
    const base = { input: ['*.md'], output: './results' };
    const merged = mergeConfig(base, { output: './new-results' });
    expect(merged.output).toBe('./new-results');
    expect(merged.input).toEqual(['*.md']);
  });
});

describe('Error Utils', () => {
  let DocDetectiveError: any;
  let FileNotFoundError: any;
  let ValidationError: any;
  let ExecutionError: any;
  let ParseError: any;
  let formatError: any;

  beforeAll(async () => {
    const module = await import('../../src/utils/errors.js');
    DocDetectiveError = module.DocDetectiveError;
    FileNotFoundError = module.FileNotFoundError;
    ValidationError = module.ValidationError;
    ExecutionError = module.ExecutionError;
    ParseError = module.ParseError;
    formatError = module.formatError;
  });

  test('DocDetectiveError contains code and context', () => {
    const error = new DocDetectiveError('Test error', 'TEST_CODE', { key: 'value' });
    expect(error.code).toBe('TEST_CODE');
    expect(error.context).toEqual({ key: 'value' });
    expect(error.message).toBe('Test error');
  });

  test('FileNotFoundError includes file path', () => {
    const error = new FileNotFoundError('/some/path.json');
    expect(error.message).toContain('/some/path.json');
    expect(error.code).toBe('FILE_NOT_FOUND');
  });

  test('ValidationError includes error list', () => {
    const error = new ValidationError('Invalid', ['error1', 'error2']);
    expect(error.errors).toEqual(['error1', 'error2']);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  test('ExecutionError is properly constructed', () => {
    const error = new ExecutionError('Exec failed', { exitCode: 1 });
    expect(error.message).toBe('Exec failed');
    expect(error.code).toBe('EXECUTION_ERROR');
  });

  test('ParseError is properly constructed', () => {
    const error = new ParseError('Parse failed');
    expect(error.message).toBe('Parse failed');
    expect(error.code).toBe('PARSE_ERROR');
  });

  test('formatError handles DocDetectiveError', () => {
    const error = new DocDetectiveError('Test', 'CODE');
    const result = formatError(error);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Test');
  });

  test('formatError handles regular Error', () => {
    const error = new Error('Regular error');
    const result = formatError(error);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Regular error');
  });

  test('formatError handles non-Error types', () => {
    const result = formatError('string error');
    expect(result.success).toBe(false);
    expect(result.message).toBe('string error');
  });
});
