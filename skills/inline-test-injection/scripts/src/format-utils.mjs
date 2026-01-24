/**
 * Format utilities for inline test injection
 * 
 * Provides functions for:
 * - Detecting syntax formats (JSON, YAML, XML attributes)
 * - Serializing steps/tests to inline comment format
 * - Determining appropriate comment formats by file type
 * - Batch updating source files with offset preservation
 */

import { readFileSync, writeFileSync } from 'fs';
import { extname } from 'path';

// Step properties excluded when determining action key
const EXCLUDED_STEP_KEYS = ['stepId', 'description', 'unsafe', 'outputs', 'variables', 'breakpoint', '$schema'];

/**
 * Comment format configurations by file type
 */
export const COMMENT_FORMATS = {
  htmlComment: {
    extensions: ['.md', '.markdown', '.html', '.htm'],
    testOpen: '<!-- test ',
    testClose: ' -->',
    testEndOpen: '<!-- test end',
    testEndClose: ' -->',
    stepOpen: '<!-- step ',
    stepClose: ' -->',
  },
  jsxComment: {
    extensions: ['.mdx', '.jsx', '.tsx'],
    testOpen: '{/* test ',
    testClose: ' */}',
    testEndOpen: '{/* test end',
    testEndClose: ' */}',
    stepOpen: '{/* step ',
    stepClose: ' */}',
  },
  xmlProcessingInstruction: {
    extensions: ['.xml', '.dita', '.ditamap'],
    testOpen: '<?doc-detective test ',
    testClose: ' ?>',
    testEndOpen: '<?doc-detective test end',
    testEndClose: ' ?>',
    stepOpen: '<?doc-detective step ',
    stepClose: ' ?>',
  },
  asciidocComment: {
    extensions: ['.adoc', '.asciidoc', '.asc'],
    testOpen: '// (test ',
    testClose: ')',
    testEndOpen: '// (test end',
    testEndClose: ')',
    stepOpen: '// (step ',
    stepClose: ')',
  },
};

/**
 * Detect syntax format from inline statement text
 * @param {string} originalText - Original inline statement text
 * @returns {'json'|'yaml'|'xml'|null} Detected format
 */
export function detectSyntaxFormat(originalText) {
  if (!originalText) return null;
  
  let content = originalText.trim();
  
  // Remove comment wrappers
  const htmlMatch = content.match(/<!--\s*(?:test|step)\s+([\s\S]*?)\s*-->/);
  if (htmlMatch) content = htmlMatch[1].trim();
  
  const jsxMatch = content.match(/\{\s*\/\*\s*(?:test|step)\s+([\s\S]*?)\s*\*\/\s*\}/);
  if (jsxMatch) content = jsxMatch[1].trim();
  
  const xmlMatch = content.match(/<\?doc-detective\s+(?:test|step)\s+([\s\S]*?)\s*\?>/);
  if (xmlMatch) content = xmlMatch[1].trim();
  
  const asciidocMatch = content.match(/\/\/\s*\(\s*(?:test|step)\s+([\s\S]*?)\s*\)/);
  if (asciidocMatch) content = asciidocMatch[1].trim();
  
  // JSON: starts with { or contains "key": pattern
  if (content.startsWith('{') || /^"?\w+"?\s*:\s*[{["']/.test(content)) {
    return 'json';
  }
  
  // XML-style attributes: key="value" or key=value
  if (/^\w+\s*=\s*["']?[^{]/.test(content) || /^\w+\s*=\s*(?:true|false|\d+)/.test(content)) {
    return 'xml';
  }
  
  // YAML: key: value patterns
  if (/^\w+:\s*\n/.test(content) || /\n\s+\w+:/.test(content) || 
      (/^\w+:\s+[^{]/.test(content) && !content.includes('{'))) {
    return 'yaml';
  }
  
  return 'json';
}

/**
 * Serialize object to specified syntax format
 * @param {Object} obj - Object to serialize
 * @param {'json'|'yaml'|'xml'} syntaxFormat - Target format
 * @returns {string} Serialized content (without comment wrappers)
 */
export function serializeToSyntax(obj, syntaxFormat) {
  switch (syntaxFormat) {
    case 'xml':
      const attrs = [];
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          attrs.push(`${key}="${value}"`);
        } else if (typeof value === 'boolean' || typeof value === 'number') {
          attrs.push(`${key}=${value}`);
        } else {
          attrs.push(`${key}=${JSON.stringify(value)}`);
        }
      }
      return attrs.join(' ');
    
    case 'yaml':
      const yamlLines = [];
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          if (/[:#\[\]{}|>!&*?'"]/.test(value) || value.includes('\n')) {
            yamlLines.push(`${key}: "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
          } else {
            yamlLines.push(`${key}: ${value}`);
          }
        } else if (typeof value === 'boolean' || typeof value === 'number') {
          yamlLines.push(`${key}: ${value}`);
        } else if (Array.isArray(value)) {
          yamlLines.push(`${key}: ${JSON.stringify(value)}`);
        } else if (typeof value === 'object' && value !== null) {
          yamlLines.push(`${key}:`);
          for (const [subKey, subValue] of Object.entries(value)) {
            if (typeof subValue === 'string') {
              if (/[:#\[\]{}|>!&*?'"]/.test(subValue) || subValue.includes('\n')) {
                yamlLines.push(`  ${subKey}: "${subValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
              } else {
                yamlLines.push(`  ${subKey}: ${subValue}`);
              }
            } else {
              yamlLines.push(`  ${subKey}: ${JSON.stringify(subValue)}`);
            }
          }
        } else {
          yamlLines.push(`${key}: ${JSON.stringify(value)}`);
        }
      }
      return yamlLines.join('\n');
    
    case 'json':
    default:
      return JSON.stringify(obj);
  }
}

/**
 * Get default comment format for file extension
 * @param {string} fileExtension - Extension including dot (e.g., '.md')
 * @returns {string} Comment format key
 */
export function getCommentFormat(fileExtension) {
  const ext = (fileExtension || '').toLowerCase();
  
  for (const [formatKey, config] of Object.entries(COMMENT_FORMATS)) {
    if (config.extensions.includes(ext)) {
      return formatKey;
    }
  }
  
  // Default to HTML comments
  return 'htmlComment';
}

/**
 * Check if step can use simple format (action: value only)
 * @param {Object} step - Step object
 * @param {string} actionKey - Action key
 * @returns {boolean} True if simple format applicable
 */
function canSerializeAsSimple(step, actionKey) {
  const nonActionKeys = Object.keys(step).filter(key => 
    key !== actionKey && !EXCLUDED_STEP_KEYS.includes(key)
  );
  
  if (nonActionKeys.length > 0) return false;
  
  const hasCommonProps = 
    step.stepId || step.description ||
    step.unsafe === true ||
    (step.outputs && Object.keys(step.outputs).length > 0) ||
    (step.variables && Object.keys(step.variables).length > 0) ||
    step.breakpoint === true;
  
  if (hasCommonProps) return false;
  
  const actionValue = step[actionKey];
  return typeof actionValue === 'string' || 
         typeof actionValue === 'number' || 
         typeof actionValue === 'boolean';
}

/**
 * Serialize step to inline comment format
 * @param {Object} options
 * @param {Object} options.step - Step object
 * @param {string} options.commentFormat - Comment format key
 * @param {string} options.fileExtension - File extension
 * @param {'json'|'yaml'|'xml'} options.syntaxFormat - Syntax format
 * @returns {string} Serialized inline step comment
 */
export function serializeStepToInline({ step, commentFormat, fileExtension, syntaxFormat }) {
  const format = commentFormat || getCommentFormat(fileExtension);
  const syntax = syntaxFormat || 'json';
  const formatConfig = COMMENT_FORMATS[format] || COMMENT_FORMATS.htmlComment;
  
  // Clone step and remove sourceLocation
  const stepToSerialize = { ...step };
  delete stepToSerialize.sourceLocation;
  
  // Find action key
  const actionKey = Object.keys(stepToSerialize).find(key => 
    !EXCLUDED_STEP_KEYS.includes(key)
  );
  
  if (!actionKey) {
    throw new Error('Cannot serialize step: no action found');
  }
  
  let stepContent;
  if (canSerializeAsSimple(stepToSerialize, actionKey)) {
    const simpleStep = { [actionKey]: stepToSerialize[actionKey] };
    stepContent = serializeToSyntax(simpleStep, syntax);
  } else {
    stepContent = serializeToSyntax(stepToSerialize, syntax);
  }
  
  const isMultiline = stepContent.includes('\n');
  
  if (isMultiline) {
    return `${formatConfig.stepOpen.trim()}\n${stepContent}\n${formatConfig.stepClose.trim()}`;
  }
  return `${formatConfig.stepOpen}${stepContent}${formatConfig.stepClose}`;
}

/**
 * Serialize test declaration to inline comment format
 * @param {Object} options
 * @param {Object} options.test - Test object
 * @param {string} options.commentFormat - Comment format key
 * @param {string} options.fileExtension - File extension
 * @param {'json'|'yaml'|'xml'} options.syntaxFormat - Syntax format
 * @returns {string} Serialized inline test comment
 */
export function serializeTestToInline({ test, commentFormat, fileExtension, syntaxFormat }) {
  const format = commentFormat || getCommentFormat(fileExtension);
  const syntax = syntaxFormat || 'json';
  const formatConfig = COMMENT_FORMATS[format] || COMMENT_FORMATS.htmlComment;
  
  const testToSerialize = {};
  if (test.testId) testToSerialize.testId = test.testId;
  if (test.description) testToSerialize.description = test.description;
  if (test.detectSteps !== undefined) testToSerialize.detectSteps = test.detectSteps;
  if (test.runOn) testToSerialize.runOn = test.runOn;
  
  const testContent = serializeToSyntax(testToSerialize, syntax);
  const isMultiline = testContent.includes('\n');
  
  if (isMultiline) {
    return `${formatConfig.testOpen.trim()}\n${testContent}\n${formatConfig.testClose.trim()}`;
  }
  return `${formatConfig.testOpen}${testContent}${formatConfig.testClose}`;
}

/**
 * Serialize test end marker
 * @param {string} commentFormat - Comment format key
 * @returns {string} Test end comment
 */
export function serializeTestEnd(commentFormat) {
  const formatConfig = COMMENT_FORMATS[commentFormat] || COMMENT_FORMATS.htmlComment;
  return `${formatConfig.testEndOpen}${formatConfig.testEndClose}`;
}

/**
 * Find line start offset
 * @param {string} content - File content
 * @param {number} offset - Position in content
 * @returns {number} Start of line offset
 */
export function findLineStart(content, offset) {
  let pos = offset - 1;
  while (pos >= 0 && content[pos] !== '\n') pos--;
  return pos + 1;
}

/**
 * Find line end offset (including newline)
 * @param {string} content - File content
 * @param {number} offset - Position in content
 * @returns {number} End of line offset
 */
export function findLineEnd(content, offset) {
  let pos = offset;
  while (pos < content.length && content[pos] !== '\n') pos++;
  if (pos < content.length && content[pos] === '\n') pos++;
  return pos;
}

/**
 * Get line indentation
 * @param {string} content - File content
 * @param {number} lineStart - Line start offset
 * @returns {string} Indentation string
 */
export function getLineIndentation(content, lineStart) {
  let indent = '';
  let pos = lineStart;
  while (pos < content.length && (content[pos] === ' ' || content[pos] === '\t')) {
    indent += content[pos];
    pos++;
  }
  return indent;
}

/**
 * Apply batch updates to source content
 * Updates applied in reverse offset order to maintain validity
 * @param {Object} options
 * @param {string} options.content - File content
 * @param {Array} options.updates - Update operations
 * @returns {string} Updated content
 */
export function batchUpdateContent({ content, updates }) {
  if (!updates || updates.length === 0) return content;
  
  // Sort by offset descending
  const sortedUpdates = [...updates].sort((a, b) => b.offset - a.offset);
  
  let result = content;
  
  for (const update of sortedUpdates) {
    const { offset, newContent, insertAfter } = update;
    
    if (insertAfter) {
      // Insert after the line containing offset
      const lineEnd = findLineEnd(result, offset);
      const lineStart = findLineStart(result, offset);
      const indent = getLineIndentation(result, lineStart);
      
      const before = result.substring(0, lineEnd);
      const after = result.substring(lineEnd);
      result = before + indent + newContent + '\n' + after;
    } else {
      // Insert before the line containing offset
      const lineStart = findLineStart(result, offset);
      const indent = getLineIndentation(result, lineStart);
      
      const before = result.substring(0, lineStart);
      const after = result.substring(lineStart);
      result = before + indent + newContent + '\n' + after;
    }
  }
  
  return result;
}

/**
 * Generate a diff-style preview of updates
 * @param {string} content - Original content
 * @param {Array} updates - Planned updates
 * @param {string} filePath - File path for header
 * @returns {string} Diff-style preview
 */
export function generatePreview(content, updates, filePath) {
  const lines = content.split('\n');
  const preview = [];
  
  preview.push(`--- ${filePath}`);
  preview.push(`+++ ${filePath} (with inline tests)`);
  preview.push('');
  
  // Sort updates by offset ascending for preview
  const sortedUpdates = [...updates].sort((a, b) => a.offset - b.offset);
  
  for (const update of sortedUpdates) {
    const lineNum = content.substring(0, update.offset).split('\n').length;
    const contextStart = Math.max(0, lineNum - 2);
    const contextEnd = Math.min(lines.length, lineNum + 2);
    
    preview.push(`@@ line ${lineNum} @@`);
    
    // Context before
    for (let i = contextStart; i < lineNum - 1; i++) {
      preview.push(` ${lines[i]}`);
    }
    
    // The line where insertion happens
    if (lineNum > 0 && lines[lineNum - 1] !== undefined) {
      preview.push(` ${lines[lineNum - 1]}`);
    }
    
    // The new content
    preview.push(`+${update.newContent}`);
    
    // Context after
    for (let i = lineNum; i < contextEnd; i++) {
      if (lines[i] !== undefined) {
        preview.push(` ${lines[i]}`);
      }
    }
    
    preview.push('');
  }
  
  return preview.join('\n');
}
