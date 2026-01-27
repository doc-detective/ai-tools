/**
 * Generate Tool - Generates Doc Detective test specifications from documentation
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GenerateInput, GenerateOutput, DocDetectiveSpec, DocDetectiveTest, DocDetectiveStep } from '../types/index.js';
import { validateTool } from './validate.js';
import { formatError } from '../utils/errors.js';
import { serializeSpec } from '../utils/spec-handler.js';

// Patterns to identify procedure steps
const STEP_PATTERNS = {
  navigate: /(?:navigate|go|open|visit|browse)\s+(?:to\s+)?(?:the\s+)?(?:url\s+)?["']?(https?:\/\/[^\s"']+)["']?/i,
  navigateTo: /(?:navigate|go)\s+to\s+["']?(https?:\/\/[^\s"']+|[^"'\s]+)["']?/i,
  click: /(?:click|tap|press|select)\s+(?:on\s+)?(?:the\s+)?["']?([^"'\n]+)["']?/i,
  find: /(?:find|verify|check|see|look for|ensure|confirm)\s+(?:that\s+)?(?:you\s+)?(?:see\s+)?(?:the\s+)?["']?([^"'\n]+)["']?/i,
  type: /(?:type|enter|input|fill\s+in)\s+(?:your\s+)?(?:the\s+)?["']?([^"'\n]+)["']?\s+(?:in(?:to)?|on)\s+(?:the\s+)?["']?([^"'\n]+)["']?/i,
  wait: /(?:wait|pause)\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)?/i,
  url: /(https?:\/\/[^\s"'<>]+)/i,
};

/**
 * Parse documentation content and extract procedure steps
 */
function parseDocumentation(content: string): DocDetectiveTest[] {
  const tests: DocDetectiveTest[] = [];
  const lines = content.split('\n');
  
  let currentTest: DocDetectiveTest | null = null;
  let stepCounter = 0;
  let testCounter = 0;
  
  // Look for headers that might indicate procedure sections
  const procedureHeaders = /^#+\s*(.+(?:steps?|procedure|guide|tutorial|how to|instructions?|getting started|login|setup|install).*)$/i;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for section headers
    const headerMatch = line.match(/^#+\s*(.+)$/);
    if (headerMatch) {
      // Save previous test if it has steps
      if (currentTest && currentTest.steps.length > 0) {
        tests.push(currentTest);
      }
      
      // Start new test for procedural headers
      if (procedureHeaders.test(line)) {
        testCounter++;
        stepCounter = 0;
        currentTest = {
          id: `test-${testCounter}`,
          description: headerMatch[1].trim(),
          steps: [],
        };
      } else if (currentTest === null) {
        // Start a default test for the document
        testCounter++;
        stepCounter = 0;
        currentTest = {
          id: `test-${testCounter}`,
          description: headerMatch[1].trim(),
          steps: [],
        };
      }
      continue;
    }
    
    // Look for numbered or bulleted steps
    const listMatch = line.match(/^(?:\d+[.)]\s*|[-*]\s*)(.+)$/);
    if (listMatch && currentTest) {
      const stepText = listMatch[1];
      const step = parseStepText(stepText, ++stepCounter);
      if (step) {
        currentTest.steps.push(step);
      }
    }
    
    // Also look for URLs in regular text if we have a current test
    if (currentTest && !listMatch) {
      const urlMatch = line.match(STEP_PATTERNS.url);
      if (urlMatch && currentTest.steps.length === 0) {
        currentTest.steps.push({
          stepId: `step-${++stepCounter}`,
          description: 'Navigate to URL',
          goTo: urlMatch[1],
        });
      }
    }
  }
  
  // Don't forget the last test
  if (currentTest && currentTest.steps.length > 0) {
    tests.push(currentTest);
  }
  
  // If no tests were found, create a basic one from URL patterns
  if (tests.length === 0) {
    const urlMatches = content.match(/https?:\/\/[^\s"'<>]+/g);
    if (urlMatches && urlMatches.length > 0) {
      const defaultTest: DocDetectiveTest = {
        id: 'test-1',
        description: 'Generated test from documentation',
        steps: urlMatches.slice(0, 5).map((url, i) => ({
          stepId: `step-${i + 1}`,
          description: `Navigate to ${url}`,
          goTo: url,
        })),
      };
      tests.push(defaultTest);
    }
  }
  
  return tests;
}

/**
 * Parse a single step text and convert to Doc Detective step
 */
function parseStepText(text: string, stepNum: number): DocDetectiveStep | null {
  const step: DocDetectiveStep = {
    stepId: `step-${stepNum}`,
    description: text,
  };
  
  // Check for navigation patterns
  let match = text.match(STEP_PATTERNS.navigate);
  if (match) {
    step.goTo = match[1];
    return step;
  }
  
  match = text.match(STEP_PATTERNS.navigateTo);
  if (match) {
    const target = match[1];
    if (target.startsWith('http')) {
      step.goTo = target;
    } else {
      step.goTo = target; // Could be a relative path or page name
    }
    return step;
  }
  
  // Check for type/input patterns (before click since "enter" could match both)
  match = text.match(STEP_PATTERNS.type);
  if (match) {
    step.type = {
      keys: match[1],
      selector: match[2],
    };
    return step;
  }
  
  // Check for click patterns
  match = text.match(STEP_PATTERNS.click);
  if (match) {
    step.click = match[1].replace(/["']/g, '').trim();
    return step;
  }
  
  // Check for find/verify patterns
  match = text.match(STEP_PATTERNS.find);
  if (match) {
    step.find = match[1].replace(/["']/g, '').trim();
    return step;
  }
  
  // Check for wait patterns
  match = text.match(STEP_PATTERNS.wait);
  if (match) {
    let waitTime = parseInt(match[1], 10);
    // Convert seconds to milliseconds if needed
    if (text.toLowerCase().includes('second')) {
      waitTime *= 1000;
    }
    step.wait = waitTime;
    return step;
  }
  
  // Check for URLs in the text
  match = text.match(STEP_PATTERNS.url);
  if (match) {
    step.goTo = match[1];
    return step;
  }
  
  // If no pattern matches, return null (skip this step)
  return null;
}

/**
 * Generate Doc Detective test specifications from documentation
 */
export async function generateTool(input: GenerateInput): Promise<GenerateOutput> {
  try {
    const { source_file, output_file } = input;
    
    // Check if source file exists
    if (!fs.existsSync(source_file)) {
      return {
        success: false,
        message: `Source file not found: ${source_file}`,
      };
    }
    
    // Read the documentation file
    const content = fs.readFileSync(source_file, 'utf-8');
    
    // Handle empty files
    if (!content.trim()) {
      return {
        success: true,
        spec_json: { tests: [] },
        spec_string: JSON.stringify({ tests: [] }, null, 2),
        validation: {
          passed: true,
          errors: [],
        },
        message: 'Source file is empty. No tests generated.',
      };
    }
    
    // Parse documentation and generate tests
    const tests = parseDocumentation(content);
    
    const spec: DocDetectiveSpec = { tests };
    
    // Validate the generated spec
    const validationResult = await validateTool({
      spec_input: JSON.stringify(spec),
    });
    
    // Write to output file if specified
    if (output_file) {
      const dir = path.dirname(output_file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(output_file, serializeSpec(spec));
    }
    
    return {
      success: true,
      spec_json: spec,
      spec_string: serializeSpec(spec),
      validation: {
        passed: validationResult.valid,
        errors: validationResult.errors,
      },
      output_path: output_file,
      message: tests.length > 0
        ? `Generated ${tests.length} test(s) with ${tests.reduce((sum, t) => sum + t.steps.length, 0)} total step(s).`
        : 'No procedures found in documentation. No tests generated.',
    };
  } catch (error) {
    return {
      ...formatError(error),
    };
  }
}
