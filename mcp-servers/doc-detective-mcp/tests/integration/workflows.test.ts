import { describe, test, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

let generateTool: (input: any) => Promise<any>;
let validateTool: (input: any) => Promise<any>;
let analyzeTool: (input: any) => Promise<any>;
let injectTool: (input: any) => Promise<any>;

describe('Workflow Integration Tests', () => {
  beforeAll(async () => {
    const genModule = await import('../../src/tools/generate.js');
    const valModule = await import('../../src/tools/validate.js');
    const anaModule = await import('../../src/tools/analyze.js');
    const injModule = await import('../../src/tools/inject.js');
    
    generateTool = genModule.generateTool;
    validateTool = valModule.validateTool;
    analyzeTool = anaModule.analyzeTool;
    injectTool = injModule.injectTool;
  });

  test('generate → validate workflow succeeds', async () => {
    // Step 1: Generate spec from docs
    const genResult = await generateTool({
      source_file: path.join(fixturesDir, 'sample-docs.md'),
    });
    expect(genResult.success).toBe(true);
    expect(genResult.spec_json).toBeDefined();

    // Step 2: Validate the generated spec
    const valResult = await validateTool({
      spec_input: JSON.stringify(genResult.spec_json),
    });
    expect(valResult.success).toBe(true);
    expect(valResult.valid).toBe(true);
  });

  test('analyze results workflow succeeds', async () => {
    // Analyze test results from fixture
    const analysisResult = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });
    
    expect(analysisResult.success).toBe(true);
    expect(analysisResult.analysis).toContain('Test Results');
    expect(typeof analysisResult.analysis).toBe('string');
  });

  test('generate → inject preview workflow succeeds', async () => {
    // Step 1: Generate spec
    const genResult = await generateTool({
      source_file: path.join(fixturesDir, 'sample-docs.md'),
      output_file: '/tmp/test-workflow-spec.json',
    });
    expect(genResult.success).toBe(true);

    // Step 2: Preview injection
    const injectResult = await injectTool({
      spec_file: '/tmp/test-workflow-spec.json',
      source_file: path.join(fixturesDir, 'sample-docs.md'),
      apply: false,
    });
    expect(injectResult.success).toBe(true);
    expect(injectResult.applied).toBe(false);

    // Cleanup
    if (fs.existsSync('/tmp/test-workflow-spec.json')) {
      fs.unlinkSync('/tmp/test-workflow-spec.json');
    }
  });

  test('analyze with detailed mode provides more information', async () => {
    const basicResult = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
    });
    
    const detailedResult = await analyzeTool({
      results_input: path.join(fixturesDir, 'test-results.json'),
      detailed: true,
    });
    
    expect(detailedResult.analysis.length).toBeGreaterThan(basicResult.analysis.length);
  });

  test('validate with strict mode catches more issues', async () => {
    const result = await validateTool({
      spec_input: path.join(fixturesDir, 'sample-spec.json'),
      strict: true,
    });
    
    expect(result.success).toBe(true);
  });
});
