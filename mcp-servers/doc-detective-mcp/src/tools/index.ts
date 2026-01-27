/**
 * Tool definitions for doc-detective-mcp
 */

import type { ToolDefinition } from '../types/index.js';

export { generateTool } from './generate.js';
export { validateTool } from './validate.js';
export { executeTool } from './execute.js';
export { injectTool } from './inject.js';
export { analyzeTool } from './analyze.js';

/**
 * All tool definitions for the MCP server
 */
export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'doc_detective_generate',
    description: 'Generate Doc Detective test specifications from documentation files. Parses procedural documentation and converts it to executable test specs.',
    inputSchema: {
      type: 'object',
      properties: {
        source_file: {
          type: 'string',
          description: 'Path to the documentation file to parse (e.g., .md, .adoc)',
        },
        output_file: {
          type: 'string',
          description: 'Optional path to write the generated spec file',
        },
        merge_existing: {
          type: 'string',
          description: 'Optional path to existing spec file to merge with',
        },
        language: {
          type: 'string',
          description: 'Optional language hint for parsing (e.g., "en")',
        },
      },
      required: ['source_file'],
    },
  },
  {
    name: 'doc_detective_validate',
    description: 'Validate a Doc Detective test specification to ensure correct structure and action formats before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_input: {
          type: 'string',
          description: 'Test specification as JSON/YAML string or path to spec file',
        },
        strict: {
          type: 'boolean',
          description: 'Enable strict validation mode for additional checks',
        },
      },
      required: ['spec_input'],
    },
  },
  {
    name: 'doc_detective_execute',
    description: 'Execute Doc Detective test specifications against a live application. Runs browser-based tests to verify documentation accuracy.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_input: {
          type: 'string',
          description: 'Test specification as JSON string or path to spec file',
        },
        headless: {
          type: 'boolean',
          description: 'Run browser in headless mode (default: true)',
        },
        timeout: {
          type: 'number',
          description: 'Test timeout in milliseconds (default: 30000)',
        },
        config_file: {
          type: 'string',
          description: 'Path to .doc-detective.json configuration file',
        },
        output_file: {
          type: 'string',
          description: 'Path to save test results',
        },
        browser: {
          type: 'string',
          description: 'Browser to use: chrome, firefox, or edge',
        },
      },
      required: ['spec_input'],
    },
  },
  {
    name: 'doc_detective_inject',
    description: 'Inject test specifications into documentation files as inline comments. Places test steps near their associated content for inline testing.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_file: {
          type: 'string',
          description: 'Path to the test specification file',
        },
        source_file: {
          type: 'string',
          description: 'Path to the documentation file to inject tests into',
        },
        apply: {
          type: 'boolean',
          description: 'Apply changes to file (default: false for preview mode)',
        },
        syntax: {
          type: 'string',
          enum: ['json', 'yaml', 'xml'],
          description: 'Syntax format for inline comments (default: json)',
        },
        config_file: {
          type: 'string',
          description: 'Path to .doc-detective.json configuration file',
        },
      },
      required: ['spec_file', 'source_file'],
    },
  },
  {
    name: 'doc_detective_analyze',
    description: 'Analyze test execution results and generate a human-readable plaintext report with pass/fail rates, failure descriptions, and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        results_input: {
          type: 'string',
          description: 'Test results as JSON string or path to results file',
        },
        detailed: {
          type: 'boolean',
          description: 'Include detailed test-by-test breakdown',
        },
        focus: {
          type: 'string',
          enum: ['failures', 'performance', 'coverage'],
          description: 'Focus analysis on specific area',
        },
      },
      required: ['results_input'],
    },
  },
];
