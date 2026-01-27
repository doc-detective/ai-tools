/**
 * Type definitions for doc-detective-mcp
 */

// Tool Input Types
export interface GenerateInput {
  source_file: string;
  output_file?: string;
  merge_existing?: string;
  language?: string;
}

export interface ValidateInput {
  spec_input: string;
  strict?: boolean;
}

export interface ExecuteInput {
  spec_input: string;
  headless?: boolean;
  timeout?: number;
  config_file?: string;
  output_file?: string;
  browser?: string;
}

export interface InjectInput {
  spec_file: string;
  source_file: string;
  apply?: boolean;
  syntax?: 'json' | 'yaml' | 'xml';
  config_file?: string;
}

export interface AnalyzeInput {
  results_input: string;
  detailed?: boolean;
  focus?: 'failures' | 'performance' | 'coverage';
}

// Tool Output Types
export interface GenerateOutput {
  success: boolean;
  spec_json?: DocDetectiveSpec;
  spec_string?: string;
  validation?: {
    passed: boolean;
    errors: string[];
  };
  output_path?: string;
  message: string;
}

export interface ValidateOutput {
  success: boolean;
  valid: boolean;
  errors: string[];
  warnings: string[];
  spec?: DocDetectiveSpec;
  message: string;
}

export interface ExecuteOutput {
  success: boolean;
  results?: {
    total_tests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration_ms?: number;
    test_results: TestResult[];
  };
  message: string;
}

export interface InjectOutput {
  success: boolean;
  applied: boolean;
  changes?: {
    inline_comments_added: number;
    lines_modified: number;
  };
  preview?: string;
  modified_source?: string;
  message: string;
}

export interface AnalyzeOutput {
  success: boolean;
  analysis?: string;
  summary?: {
    total_tests: number;
    pass_rate: number;
    failure_rate: number;
    critical_failures: string[];
    recommendations: string[];
  };
  message: string;
}

// Doc Detective Types
export interface DocDetectiveSpec {
  tests: DocDetectiveTest[];
  [key: string]: unknown;
}

export interface DocDetectiveTest {
  id?: string;
  testId?: string;
  description?: string;
  steps: DocDetectiveStep[];
}

export interface DocDetectiveStep {
  action?: string;
  stepId?: string;
  description?: string;
  [key: string]: unknown;
}

export interface TestResult {
  testId?: string;
  test_id?: string;
  passed: boolean;
  status?: string;
  duration?: number;
  steps?: StepResult[];
  error?: string;
}

export interface StepResult {
  stepId?: string;
  step_id?: string;
  passed: boolean;
  status?: string;
  duration?: number;
  error?: string;
}

export interface DocDetectiveResults {
  summary?: {
    specs?: number;
    tests?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
  };
  results?: Array<{
    testId?: string;
    description?: string;
    status?: string;
    duration?: number;
    steps?: Array<{
      stepId?: string;
      action?: string;
      status?: string;
      duration?: number;
      error?: string;
    }>;
  }>;
}

// MCP Tool Definition
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
