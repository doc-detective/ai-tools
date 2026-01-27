/**
 * Inject Tool - Injects test specifications into documentation files
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { InjectInput, InjectOutput, DocDetectiveSpec, DocDetectiveStep } from '../types/index.js';
import { loadSpec } from '../utils/spec-handler.js';
import { formatError } from '../utils/errors.js';

// Format detection patterns
const FORMAT_PATTERNS = {
  markdown: /\.md$/i,
  mdx: /\.mdx$/i,
  asciidoc: /\.(adoc|asciidoc)$/i,
  html: /\.(html?|xml|dita)$/i,
};

/**
 * Inject test specifications into documentation files
 */
export async function injectTool(input: InjectInput): Promise<InjectOutput> {
  try {
    const { spec_file, source_file, apply = false, syntax = 'json' } = input;
    
    // Load the spec
    const loadResult = loadSpec(spec_file);
    if (!loadResult.success || !loadResult.spec) {
      return {
        success: false,
        applied: false,
        message: `Failed to load spec: ${loadResult.error}`,
      };
    }
    
    // Check if source file exists
    if (!fs.existsSync(source_file)) {
      return {
        success: false,
        applied: false,
        message: `Source file not found: ${source_file}`,
      };
    }
    
    const spec = loadResult.spec;
    const originalContent = fs.readFileSync(source_file, 'utf-8');
    
    // Detect file format
    const format = detectFormat(source_file);
    
    // Generate inline comments
    const { modifiedContent, commentsAdded } = injectComments(
      originalContent,
      spec,
      format,
      syntax
    );
    
    // Apply changes if requested
    if (apply) {
      fs.writeFileSync(source_file, modifiedContent);
    }
    
    const linesModified = countModifiedLines(originalContent, modifiedContent);
    
    return {
      success: true,
      applied: apply,
      changes: {
        inline_comments_added: commentsAdded,
        lines_modified: linesModified,
      },
      preview: apply ? undefined : modifiedContent,
      modified_source: modifiedContent,
      message: apply
        ? `Applied ${commentsAdded} inline test comment(s) to ${source_file}.`
        : `Preview: ${commentsAdded} inline test comment(s) would be added.`,
    };
  } catch (error) {
    return {
      success: false,
      applied: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Detect file format from extension
 */
function detectFormat(filePath: string): 'markdown' | 'mdx' | 'asciidoc' | 'html' {
  if (FORMAT_PATTERNS.mdx.test(filePath)) return 'mdx';
  if (FORMAT_PATTERNS.asciidoc.test(filePath)) return 'asciidoc';
  if (FORMAT_PATTERNS.html.test(filePath)) return 'html';
  return 'markdown';
}

/**
 * Inject test comments into content
 */
function injectComments(
  content: string,
  spec: DocDetectiveSpec,
  format: string,
  syntax: string
): { modifiedContent: string; commentsAdded: number } {
  let modifiedContent = content;
  let commentsAdded = 0;
  
  // Build a map of steps to inject
  const stepsToInject: Array<{
    step: DocDetectiveStep;
    testId: string;
    pattern: RegExp;
  }> = [];
  
  for (const test of spec.tests) {
    const testId = test.id || test.testId || 'unknown';
    
    for (const step of test.steps) {
      const pattern = getStepPattern(step);
      if (pattern) {
        stepsToInject.push({ step, testId, pattern });
      }
    }
  }
  
  // Inject comments at appropriate locations
  for (const { step, testId, pattern } of stepsToInject) {
    const match = modifiedContent.match(pattern);
    if (match && match.index !== undefined) {
      // Find the line containing the match
      const beforeMatch = modifiedContent.substring(0, match.index);
      const lineStart = beforeMatch.lastIndexOf('\n') + 1;
      
      // Generate the comment
      const comment = generateComment(step, testId, format, syntax);
      
      // Insert comment before the matching line
      modifiedContent = 
        modifiedContent.substring(0, lineStart) +
        comment + '\n' +
        modifiedContent.substring(lineStart);
      
      commentsAdded++;
    }
  }
  
  return { modifiedContent, commentsAdded };
}

/**
 * Get a regex pattern to find where a step should be injected
 */
function getStepPattern(step: DocDetectiveStep): RegExp | null {
  if (step.goTo) {
    const url = typeof step.goTo === 'string' ? step.goTo : (step.goTo as any).url;
    if (url) {
      // Escape special regex characters in URL
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(escaped, 'i');
    }
  }
  
  if (step.click) {
    const target = typeof step.click === 'string' ? step.click : (step.click as any).selector;
    if (target) {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:click|tap|press|select).*${escaped}`, 'i');
    }
  }
  
  if (step.find) {
    const target = typeof step.find === 'string' ? step.find : (step.find as any).selector;
    if (target) {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:find|verify|see|check).*${escaped}`, 'i');
    }
  }
  
  return null;
}

/**
 * Generate a comment in the appropriate format
 */
function generateComment(
  step: DocDetectiveStep,
  testId: string,
  format: string,
  syntax: string
): string {
  // Create the step object for the comment
  const stepObj: Record<string, unknown> = {};
  
  if (step.goTo) stepObj.goTo = step.goTo;
  if (step.click) stepObj.click = step.click;
  if (step.find) stepObj.find = step.find;
  if (step.type) stepObj.type = step.type;
  if (step.wait) stepObj.wait = step.wait;
  
  // Format the step content
  let stepContent: string;
  if (syntax === 'yaml') {
    stepContent = yaml.dump(stepObj).trim();
  } else if (syntax === 'xml') {
    stepContent = objectToXml(stepObj);
  } else {
    stepContent = JSON.stringify(stepObj);
  }
  
  // Wrap in appropriate comment syntax
  switch (format) {
    case 'asciidoc':
      return `// doc-detective-test: ${stepContent}`;
    case 'html':
    case 'mdx':
    case 'markdown':
    default:
      return `<!-- doc-detective-test: ${stepContent} -->`;
  }
}

/**
 * Convert object to simple XML representation
 */
function objectToXml(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj);
  return entries.map(([key, value]) => {
    if (typeof value === 'object') {
      return `<${key}>${JSON.stringify(value)}</${key}>`;
    }
    return `<${key}>${value}</${key}>`;
  }).join('');
}

/**
 * Count the number of lines that differ between two strings
 */
function countModifiedLines(original: string, modified: string): number {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  // Simple diff: count lines that are new or different
  return Math.abs(modifiedLines.length - originalLines.length);
}
