#!/usr/bin/env node
/**
 * Inline Test Injection Script
 * 
 * Injects Doc Detective test specs into documentation source files as inline
 * comments, placing steps close to their associated content using semantic
 * pattern matching and sequential ordering.
 * 
 * Usage:
 *   node inject-inline.mjs <spec-file> <source-file> [--apply] [--syntax json|yaml|xml]
 * 
 * Options:
 *   --apply     Apply changes directly (default: preview mode)
 *   --syntax    Force syntax format for inline statements (json, yaml, xml)
 *   --config    Path to Doc Detective config file for custom patterns
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { extname, dirname, join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  getCommentFormat,
  serializeStepToInline,
  serializeTestToInline,
  serializeTestEnd,
  batchUpdateContent,
  generatePreview,
  COMMENT_FORMATS,
} from './format-utils.mjs';

// Default markup patterns for semantic matching
const DEFAULT_MARKUP_PATTERNS = {
  markdown: [
    {
      name: 'checkHyperlink',
      regex: /(?<!!)\[[^\]]+\]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\s*\)/g,
      actions: ['checkLink'],
      captureGroups: { url: 1 },
    },
    {
      name: 'clickOnscreenText',
      regex: /\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\b\s+\*\*((?:(?!\*\*).)+)\*\*/g,
      actions: ['click'],
      captureGroups: { text: 1 },
    },
    {
      name: 'findOnscreenText',
      regex: /\*\*((?:(?!\*\*).)+)\*\*/g,
      actions: ['find'],
      captureGroups: { text: 1 },
    },
    {
      name: 'goToUrl',
      regex: /\b(?:[Gg]o\s+to|[Oo]pen|[Nn]avigate\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\s+to|[Ll]aunch)\b\s+\[[^\]]+\]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\s*\)/g,
      actions: ['goTo'],
      captureGroups: { url: 1 },
    },
    {
      name: 'typeText',
      regex: /\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\b\s+"([^"]+)"/g,
      actions: ['type'],
      captureGroups: { keys: 1 },
    },
    {
      name: 'screenshotImage',
      regex: /!\[[^\]]*\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g,
      actions: ['screenshot'],
      captureGroups: { path: 1 },
    },
  ],
  html: [
    {
      name: 'checkHyperlink',
      regex: /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g,
      actions: ['checkLink'],
      captureGroups: { url: 1 },
    },
    {
      name: 'clickOnscreenText',
      regex: /\b(?:[Cc]lick|[Tt]ap)\b\s+<(?:strong|b)>((?:(?!<\/(?:strong|b)>).)+)<\/(?:strong|b)>/g,
      actions: ['click'],
      captureGroups: { text: 1 },
    },
    {
      name: 'findOnscreenText',
      regex: /<(?:strong|b)>((?:(?!<\/(?:strong|b)>).)+)<\/(?:strong|b)>/g,
      actions: ['find'],
      captureGroups: { text: 1 },
    },
  ],
  asciidoc: [
    {
      name: 'checkHyperlink',
      regex: /https?:\/\/[^\s\[]+\[[^\]]*\]/g,
      actions: ['checkLink'],
      captureGroups: { url: 0 },
    },
    {
      name: 'clickOnscreenText',
      regex: /\b(?:[Cc]lick|[Tt]ap)\b\s+\*([^*]+)\*/g,
      actions: ['click'],
      captureGroups: { text: 1 },
    },
    {
      name: 'findOnscreenText',
      regex: /\*([^*]+)\*/g,
      actions: ['find'],
      captureGroups: { text: 1 },
    },
  ],
  xml: [
    {
      name: 'checkHyperlink',
      regex: /<xref\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g,
      actions: ['checkLink'],
      captureGroups: { url: 1 },
    },
    {
      name: 'clickUiControl',
      regex: /(?:[Cc]lick|[Tt]ap|[Ss]elect)\s+(?:the\s+)?<uicontrol>([^<]+)<\/uicontrol>/g,
      actions: ['click'],
      captureGroups: { text: 1 },
    },
    {
      name: 'findUiControl',
      regex: /<uicontrol>([^<]+)<\/uicontrol>/g,
      actions: ['find'],
      captureGroups: { text: 1 },
    },
  ],
};

/**
 * Parse test spec file (JSON or YAML)
 */
function parseTestSpec(specPath) {
  const content = readFileSync(specPath, 'utf8');
  const ext = extname(specPath).toLowerCase();
  
  if (ext === '.yaml' || ext === '.yml') {
    return parseYaml(content);
  }
  return JSON.parse(content);
}

/**
 * Load Doc Detective config if present
 */
function loadConfig(configPath) {
  const searchPaths = configPath 
    ? [configPath]
    : ['.doc-detective.json', '.doc-detective.yaml', '.doc-detective.yml'];
  
  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      const content = readFileSync(searchPath, 'utf8');
      if (searchPath.endsWith('.json')) {
        return JSON.parse(content);
      }
      return parseYaml(content);
    }
  }
  return null;
}

/**
 * Get file type from extension
 */
function getFileType(filePath) {
  const ext = extname(filePath).toLowerCase();
  
  if (['.md', '.markdown', '.mdx'].includes(ext)) return 'markdown';
  if (['.html', '.htm'].includes(ext)) return 'html';
  if (['.adoc', '.asciidoc', '.asc'].includes(ext)) return 'asciidoc';
  if (['.xml', '.dita', '.ditamap'].includes(ext)) return 'xml';
  
  return 'markdown'; // Default
}

/**
 * Get markup patterns for file type, merging with config if present
 */
function getMarkupPatterns(fileType, config) {
  let patterns = DEFAULT_MARKUP_PATTERNS[fileType] || DEFAULT_MARKUP_PATTERNS.markdown;
  
  // Merge with config patterns if present
  if (config?.fileTypes) {
    // Handle fileTypes as either array or object
    let fileTypeConfig;
    if (Array.isArray(config.fileTypes)) {
      fileTypeConfig = config.fileTypes.find(ft => ft.name === fileType);
    } else if (typeof config.fileTypes === 'object') {
      fileTypeConfig = config.fileTypes[fileType];
    }
    
    if (fileTypeConfig?.markup) {
      // Convert config regex strings to RegExp objects
      const configPatterns = fileTypeConfig.markup.map(p => ({
        ...p,
        regex: p.regex.map(r => new RegExp(r, 'g')),
      }));
      patterns = [...patterns, ...configPatterns];
    }
    
    // Also check customPatterns at root level
    if (config.customPatterns?.[fileType]) {
      const customPatterns = config.customPatterns[fileType].map(p => ({
        ...p,
        regex: new RegExp(p.regex, 'g'),
        actions: [p.action],
        captureGroups: p.valueGroup ? { value: p.valueGroup } : { value: 1 },
      }));
      patterns = [...patterns, ...customPatterns];
    }
  }
  
  return patterns;
}

/**
 * Find all content matches in source file using markup patterns
 */
function findContentMatches(content, patterns) {
  const matches = [];
  
  for (const pattern of patterns) {
    const regexes = Array.isArray(pattern.regex) ? pattern.regex : [pattern.regex];
    
    for (const regex of regexes) {
      // Reset lastIndex for each search
      regex.lastIndex = 0;
      
      let match;
      while ((match = regex.exec(content)) !== null) {
        matches.push({
          patternName: pattern.name,
          actions: pattern.actions,
          captureGroups: pattern.captureGroups,
          matchText: match[0],
          captures: match.slice(1),
          offset: match.index,
          endOffset: match.index + match[0].length,
          lineNumber: content.substring(0, match.index).split('\n').length,
        });
      }
    }
  }
  
  // Sort by offset
  matches.sort((a, b) => a.offset - b.offset);
  
  return matches;
}

/**
 * Build action object from pattern match
 */
function buildActionFromMatch(match) {
  const action = match.actions[0];
  
  if (typeof action === 'string') {
    // Simple action like 'checkLink', 'click', 'find'
    const captureKey = Object.keys(match.captureGroups || {})[0];
    const captureIndex = match.captureGroups?.[captureKey] ?? 0;
    const value = captureIndex === 0 ? match.matchText : match.captures[captureIndex - 1];
    
    return { [action]: value };
  }
  
  // Complex action object
  return action;
}

/**
 * Calculate similarity between step and content match
 */
function calculateSimilarity(step, match) {
  // Check if step action matches pattern action
  const stepAction = Object.keys(step).find(k => 
    !['stepId', 'description', 'sourceLocation'].includes(k)
  );
  
  const matchAction = match.actions[0];
  const matchActionName = typeof matchAction === 'string' ? matchAction : Object.keys(matchAction)[0];
  
  // Action type match
  if (stepAction === matchActionName) {
    // Value similarity
    const stepValue = step[stepAction];
    const matchValue = match.captures[0] || match.matchText;
    
    if (typeof stepValue === 'string' && typeof matchValue === 'string') {
      // Check if values match or contain each other
      if (stepValue === matchValue) return 1.0;
      if (stepValue.includes(matchValue) || matchValue.includes(stepValue)) return 0.8;
      
      // Partial text match
      const stepWords = stepValue.toLowerCase().split(/\s+/);
      const matchWords = matchValue.toLowerCase().split(/\s+/);
      const commonWords = stepWords.filter(w => matchWords.includes(w));
      if (commonWords.length > 0) {
        return 0.5 * (commonWords.length / Math.max(stepWords.length, matchWords.length));
      }
    }
    
    return 0.3; // Action type match but value mismatch
  }
  
  return 0;
}

/**
 * Match steps to content using semantic patterns and sequential ordering
 */
function matchStepsToContent(steps, contentMatches) {
  const matchedSteps = [];
  const usedMatches = new Set();
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let bestMatch = null;
    let bestScore = 0;
    
    for (let j = 0; j < contentMatches.length; j++) {
      if (usedMatches.has(j)) continue;
      
      const match = contentMatches[j];
      let score = calculateSimilarity(step, match);
      
      // Sequential bonus: prefer matches that maintain order
      if (matchedSteps.length > 0) {
        const lastMatchedOffset = matchedSteps[matchedSteps.length - 1].contentMatch?.offset ?? -1;
        if (match.offset > lastMatchedOffset) {
          score += 0.2; // Bonus for maintaining sequence
        } else {
          score -= 0.1; // Penalty for breaking sequence
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { matchIndex: j, ...match };
      }
    }
    
    if (bestMatch && bestScore >= 0.3) {
      usedMatches.add(bestMatch.matchIndex);
      matchedSteps.push({
        step,
        stepIndex: i,
        contentMatch: bestMatch,
        score: bestScore,
      });
    } else {
      // Unmatched step - suggest position based on sequential order
      let suggestedOffset = 0;
      if (matchedSteps.length > 0) {
        // Place after last matched step
        const lastMatched = matchedSteps[matchedSteps.length - 1];
        suggestedOffset = lastMatched.contentMatch?.endOffset ?? 0;
      }
      
      matchedSteps.push({
        step,
        stepIndex: i,
        contentMatch: null,
        suggestedOffset,
        unmatched: true,
      });
    }
  }
  
  return matchedSteps;
}

/**
 * Generate update operations for matched steps
 */
function generateUpdates(matchedSteps, test, commentFormat, syntaxFormat) {
  const updates = [];
  
  // Add test start if test has metadata
  if (test.testId || test.description) {
    const firstStep = matchedSteps[0];
    const offset = firstStep?.contentMatch?.offset ?? firstStep?.suggestedOffset ?? 0;
    
    updates.push({
      offset,
      newContent: serializeTestToInline({
        test,
        commentFormat,
        syntaxFormat,
      }),
      insertAfter: false,
      type: 'testStart',
    });
  }
  
  // Add step updates
  for (const matched of matchedSteps) {
    const { step, contentMatch, suggestedOffset, unmatched } = matched;
    
    const offset = contentMatch?.endOffset ?? suggestedOffset ?? 0;
    
    updates.push({
      offset,
      newContent: serializeStepToInline({
        step,
        commentFormat,
        syntaxFormat,
      }),
      insertAfter: !!contentMatch, // Insert after matched content
      type: 'step',
      unmatched,
      matchedTo: contentMatch?.matchText,
    });
  }
  
  // Add test end
  if (test.testId || test.description) {
    const lastStep = matchedSteps[matchedSteps.length - 1];
    const offset = lastStep?.contentMatch?.endOffset ?? lastStep?.suggestedOffset ?? 0;
    
    updates.push({
      offset: offset + 1, // After last step
      newContent: serializeTestEnd(commentFormat),
      insertAfter: true,
      type: 'testEnd',
    });
  }
  
  return updates;
}

/**
 * Main injection function
 */
function injectInlineTests(specPath, sourcePath, options = {}) {
  const { apply = false, syntax, configPath } = options;
  
  // Load spec and source
  const spec = parseTestSpec(specPath);
  const sourceContent = readFileSync(sourcePath, 'utf8');
  
  // Load config if available
  const config = loadConfig(configPath);
  
  // Determine file type and formats
  const fileType = getFileType(sourcePath);
  const commentFormat = getCommentFormat(extname(sourcePath));
  const syntaxFormat = syntax || 'json';
  
  // Get patterns for this file type
  const patterns = getMarkupPatterns(fileType, config);
  
  // Find content matches
  const contentMatches = findContentMatches(sourceContent, patterns);
  
  // Process each test
  const allUpdates = [];
  const unmatchedSteps = [];
  
  const tests = spec.tests || [spec]; // Handle single test or tests array
  
  for (const test of tests) {
    const steps = test.steps || [];
    
    if (steps.length === 0) continue;
    
    // Match steps to content
    const matchedSteps = matchStepsToContent(steps, contentMatches);
    
    // Track unmatched steps
    const testUnmatched = matchedSteps.filter(m => m.unmatched);
    if (testUnmatched.length > 0) {
      unmatchedSteps.push({
        testId: test.testId,
        steps: testUnmatched,
      });
    }
    
    // Generate updates
    const updates = generateUpdates(matchedSteps, test, commentFormat, syntaxFormat);
    allUpdates.push(...updates);
  }
  
  // Report unmatched steps
  if (unmatchedSteps.length > 0) {
    console.log('\n⚠️  Unmatched steps (will be inserted at suggested positions):');
    for (const { testId, steps } of unmatchedSteps) {
      console.log(`\n  Test: ${testId || '(unnamed)'}`);
      for (const { step, stepIndex, suggestedOffset } of steps) {
        const action = Object.keys(step).find(k => !['stepId', 'description'].includes(k));
        console.log(`    - Step ${stepIndex + 1}: ${action} (suggested line ${sourceContent.substring(0, suggestedOffset).split('\n').length})`);
      }
    }
    console.log('');
  }
  
  if (apply) {
    // Apply changes
    const updatedContent = batchUpdateContent({
      content: sourceContent,
      updates: allUpdates,
    });
    
    writeFileSync(sourcePath, updatedContent, 'utf8');
    console.log(`✅ Injected ${allUpdates.filter(u => u.type === 'step').length} steps into ${sourcePath}`);
    
    return { applied: true, updates: allUpdates };
  } else {
    // Preview mode
    const preview = generatePreview(sourceContent, allUpdates, sourcePath);
    console.log(preview);
    console.log(`\n📋 Preview: ${allUpdates.filter(u => u.type === 'step').length} steps would be injected`);
    console.log('   Run with --apply to apply changes\n');
    
    return { applied: false, preview, updates: allUpdates };
  }
}

// CLI handling
const args = process.argv.slice(2);

if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node inject-inline.mjs <spec-file> <source-file> [options]

Arguments:
  spec-file     Path to test spec file (JSON or YAML)
  source-file   Path to documentation source file

Options:
  --apply       Apply changes directly (default: preview mode)
  --syntax      Force syntax format: json, yaml, or xml
  --config      Path to Doc Detective config file

Examples:
  node inject-inline.mjs tests/search.yaml docs/guide.md
  node inject-inline.mjs tests/search.yaml docs/guide.md --apply
  node inject-inline.mjs tests/api.json docs/api.mdx --syntax yaml
`);
  process.exit(0);
}

const specPath = args[0];
const sourcePath = args[1];

const options = {
  apply: args.includes('--apply'),
  syntax: args.includes('--syntax') ? args[args.indexOf('--syntax') + 1] : null,
  configPath: args.includes('--config') ? args[args.indexOf('--config') + 1] : null,
};

try {
  injectInlineTests(specPath, sourcePath, options);
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
}

export { injectInlineTests, matchStepsToContent, findContentMatches };
