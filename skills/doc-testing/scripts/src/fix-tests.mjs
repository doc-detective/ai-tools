#!/usr/bin/env node

/**
 * fix-tests.mjs
 * 
 * Analyzes Doc Detective test failures and proposes fixes with confidence scoring.
 * Part of the doc-testing skill for iterative test improvement.
 * 
 * Usage:
 *   node fix-tests.mjs <results-file> [options]
 * 
 * Options:
 *   --spec <path>       Path to test spec file to fix
 *   --threshold <0-100> Confidence threshold for auto-apply (default: 80)
 *   --auto-fix          Apply all fixes regardless of confidence
 *   --dry-run           Show proposed fixes without applying
 *   --max-iterations    Maximum fix attempts per test (default: 3)
 *   --output <path>     Write fixed spec to path (default: overwrite input)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const DEFAULT_THRESHOLD = 80;
const MAX_ITERATIONS = 3;

/**
 * Error patterns and their fix strategies
 */
const ERROR_PATTERNS = [
  {
    pattern: /Element.*not found|selector.*not found|Cannot find/i,
    type: 'element_not_found',
    strategies: [
      { name: 'update_text', confidence: 70, description: 'Element text may have changed' },
      { name: 'add_wait', confidence: 60, description: 'Element may need more time to load' },
      { name: 'update_selector', confidence: 50, description: 'Selector may need adjustment' }
    ]
  },
  {
    pattern: /timeout|timed out|exceeded/i,
    type: 'timeout',
    strategies: [
      { name: 'increase_timeout', confidence: 85, description: 'Increase wait time' },
      { name: 'add_explicit_wait', confidence: 75, description: 'Add explicit wait for element' }
    ]
  },
  {
    pattern: /navigation|redirect|url.*changed|net::ERR/i,
    type: 'navigation',
    strategies: [
      { name: 'update_url', confidence: 90, description: 'URL may have changed' },
      { name: 'handle_redirect', confidence: 70, description: 'Add redirect handling' }
    ]
  },
  {
    pattern: /status.*code|401|403|404|500|HTTP/i,
    type: 'http_error',
    strategies: [
      { name: 'update_expected_status', confidence: 60, description: 'Status code expectation may need update' },
      { name: 'add_auth', confidence: 45, description: 'Authentication may be required' }
    ]
  },
  {
    pattern: /text.*mismatch|expected.*but.*got|does not match/i,
    type: 'text_mismatch',
    strategies: [
      { name: 'update_expected_text', confidence: 88, description: 'Expected text has changed' }
    ]
  },
  {
    pattern: /click.*failed|not clickable|intercepted/i,
    type: 'click_failed',
    strategies: [
      { name: 'wait_for_clickable', confidence: 75, description: 'Wait for element to be clickable' },
      { name: 'scroll_into_view', confidence: 65, description: 'Element may need scrolling' }
    ]
  }
];

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    resultsFile: null,
    specFile: null,
    threshold: DEFAULT_THRESHOLD,
    autoFix: false,
    dryRun: false,
    maxIterations: MAX_ITERATIONS,
    output: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--spec' && args[i + 1]) {
      options.specFile = args[++i];
    } else if (arg === '--threshold' && args[i + 1]) {
      options.threshold = parseInt(args[++i], 10);
    } else if (arg === '--auto-fix') {
      options.autoFix = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--max-iterations' && args[i + 1]) {
      options.maxIterations = parseInt(args[++i], 10);
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (!arg.startsWith('-') && !options.resultsFile) {
      options.resultsFile = arg;
    }
  }

  return options;
}

/**
 * Load and parse a JSON file
 */
function loadJson(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

/**
 * Analyze a single test failure and propose fixes
 */
function analyzeFailure(failure) {
  const { testId, stepId, error, step } = failure;
  const proposals = [];

  // Match error against known patterns
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(error)) {
      for (const strategy of pattern.strategies) {
        proposals.push({
          testId,
          stepId,
          errorType: pattern.type,
          strategy: strategy.name,
          confidence: strategy.confidence,
          description: strategy.description,
          originalStep: step,
          proposedFix: generateFix(strategy.name, step, error)
        });
      }
      break; // Use first matching pattern
    }
  }

  // If no pattern matched, provide generic low-confidence fix
  if (proposals.length === 0) {
    proposals.push({
      testId,
      stepId,
      errorType: 'unknown',
      strategy: 'manual_review',
      confidence: 20,
      description: 'Unknown error pattern - manual review required',
      originalStep: step,
      proposedFix: null
    });
  }

  // Return highest confidence proposal
  return proposals.sort((a, b) => b.confidence - a.confidence)[0];
}

/**
 * Generate a fix based on strategy
 */
function generateFix(strategy, originalStep, error) {
  if (!originalStep) return null;

  const fix = JSON.parse(JSON.stringify(originalStep)); // Deep clone

  switch (strategy) {
    case 'update_text':
      // Extract potential new text from error message
      const textMatch = error.match(/found "([^"]+)"|got "([^"]+)"|actual: "([^"]+)"/i);
      if (textMatch) {
        const newText = textMatch[1] || textMatch[2] || textMatch[3];
        if (fix.click && typeof fix.click === 'string') {
          fix.click = newText;
        } else if (fix.find && typeof fix.find === 'string') {
          fix.find = newText;
        }
      }
      break;

    case 'add_wait':
      // Insert a wait before the step
      return {
        _insertBefore: true,
        wait: { selector: extractSelector(originalStep), state: 'visible', timeout: 10000 }
      };

    case 'increase_timeout':
      if (fix.find && typeof fix.find === 'object') {
        fix.find.timeout = (fix.find.timeout || 5000) * 2;
      } else if (fix.click && typeof fix.click === 'object') {
        fix.click.timeout = (fix.click.timeout || 5000) * 2;
      } else if (fix.wait && typeof fix.wait === 'number') {
        fix.wait = fix.wait * 2;
      }
      break;

    case 'add_explicit_wait':
      return {
        _insertBefore: true,
        wait: 5000
      };

    case 'update_url':
      // Try to extract the actual URL from error
      const urlMatch = error.match(/redirected to "([^"]+)"|actual: "([^"]+)"|got "(https?:\/\/[^"]+)"/i);
      if (urlMatch && fix.goTo) {
        const newUrl = urlMatch[1] || urlMatch[2] || urlMatch[3];
        if (typeof fix.goTo === 'string') {
          fix.goTo = newUrl;
        } else if (typeof fix.goTo === 'object') {
          fix.goTo.url = newUrl;
        }
      }
      break;

    case 'update_expected_text':
      const expectedMatch = error.match(/got "([^"]+)"|actual: "([^"]+)"/i);
      if (expectedMatch) {
        const actualText = expectedMatch[1] || expectedMatch[2];
        if (fix.find && typeof fix.find === 'object' && fix.find.matchText) {
          fix.find.matchText = actualText;
        }
      }
      break;

    case 'wait_for_clickable':
      if (fix.click && typeof fix.click === 'object') {
        fix.click.waitForClickable = true;
      }
      break;

    case 'scroll_into_view':
      return {
        _insertBefore: true,
        runCode: {
          language: 'javascript',
          code: `document.querySelector('${extractSelector(originalStep)}')?.scrollIntoView({ behavior: 'smooth', block: 'center' });`
        }
      };

    case 'update_selector':
    case 'update_expected_status':
    case 'add_auth':
    case 'handle_redirect':
    case 'manual_review':
      // These require more context - return null to flag for manual review
      return null;
  }

  return fix;
}

/**
 * Extract selector from a step
 */
function extractSelector(step) {
  if (!step) return '*';
  
  if (step.click) {
    return typeof step.click === 'string' ? `text="${step.click}"` : step.click.selector || '*';
  }
  if (step.find) {
    return typeof step.find === 'string' ? `text="${step.find}"` : step.find.selector || '*';
  }
  if (step.type && step.type.selector) {
    return step.type.selector;
  }
  return '*';
}

/**
 * Extract failures from Doc Detective results
 */
function extractFailures(results) {
  const failures = [];

  const tests = results.tests || results.results?.tests || [];
  
  for (const test of tests) {
    if (test.status === 'FAIL' || test.status === 'failed') {
      const steps = test.steps || [];
      for (const step of steps) {
        if (step.status === 'FAIL' || step.status === 'failed') {
          failures.push({
            testId: test.testId || test.id,
            stepId: step.stepId || step.id,
            error: step.error || step.message || 'Unknown error',
            step: step.step || step.action
          });
        }
      }
    }
  }

  return failures;
}

/**
 * Apply fix to spec
 */
function applyFix(spec, proposal) {
  if (!proposal.proposedFix) return false;

  const tests = spec.tests || [];
  
  for (const test of tests) {
    if (test.testId === proposal.testId) {
      const steps = test.steps || [];
      
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].stepId === proposal.stepId || i === parseInt(proposal.stepId, 10)) {
          if (proposal.proposedFix._insertBefore) {
            // Insert a new step before
            const newStep = { ...proposal.proposedFix };
            delete newStep._insertBefore;
            steps.splice(i, 0, newStep);
          } else {
            // Replace the step
            steps[i] = { ...steps[i], ...proposal.proposedFix };
          }
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Format proposal for display
 */
function formatProposal(proposal, threshold, autoFix) {
  const willApply = autoFix || proposal.confidence >= threshold;
  const status = proposal.proposedFix 
    ? (willApply ? '🔧' : '⚠️')
    : '❌';
  
  const confidenceLabel = proposal.confidence >= 80 ? 'HIGH' 
    : proposal.confidence >= 60 ? 'MEDIUM' 
    : 'LOW';

  let output = `
${status} ${proposal.testId} → Step: ${proposal.stepId}
   Error Type: ${proposal.errorType}
   Strategy: ${proposal.strategy}
   Confidence: ${proposal.confidence}% (${confidenceLabel})
   ${proposal.description}
`;

  if (proposal.proposedFix) {
    output += `
   Original: ${JSON.stringify(proposal.originalStep, null, 2).split('\n').join('\n            ')}
   Proposed: ${JSON.stringify(proposal.proposedFix, null, 2).split('\n').join('\n            ')}
`;
    if (!willApply && !autoFix) {
      output += `
   → Below threshold (${threshold}%) - flagging for user review
`;
    }
  } else {
    output += `
   → No automatic fix available - manual review required
`;
  }

  return output;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
fix-tests.mjs - Analyze and fix Doc Detective test failures

Usage:
  node fix-tests.mjs <results-file> [options]

Options:
  --spec <path>         Path to test spec file to fix
  --threshold <0-100>   Confidence threshold for auto-apply (default: 80)
  --auto-fix            Apply all fixes regardless of confidence
  --dry-run             Show proposed fixes without applying
  --max-iterations      Maximum fix attempts per test (default: 3)
  --output <path>       Write fixed spec to path (default: overwrite input)
  --help, -h            Show this help message

Examples:
  node fix-tests.mjs results.json --spec tests/login.json --dry-run
  node fix-tests.mjs results.json --spec tests/login.json --threshold 70
  node fix-tests.mjs results.json --spec tests/login.json --auto-fix
`);
    process.exit(0);
  }

  const options = parseArgs(args);

  if (!options.resultsFile) {
    console.error('Error: Results file required');
    process.exit(1);
  }

  // Load results
  console.log(`\n📊 Loading results from: ${options.resultsFile}`);
  const results = loadJson(options.resultsFile);
  
  // Extract failures
  const failures = extractFailures(results);
  
  if (failures.length === 0) {
    console.log('✅ No failures found in results!');
    process.exit(0);
  }

  console.log(`\n❌ Found ${failures.length} failure(s)\n`);

  // Analyze each failure
  const proposals = failures.map(analyzeFailure);
  
  // Display proposals
  console.log('─'.repeat(60));
  console.log('PROPOSED FIXES');
  console.log('─'.repeat(60));
  
  for (const proposal of proposals) {
    console.log(formatProposal(proposal, options.threshold, options.autoFix));
  }

  // Summary
  const autoApplicable = proposals.filter(p => 
    p.proposedFix && (options.autoFix || p.confidence >= options.threshold)
  );
  const needsReview = proposals.filter(p => 
    !p.proposedFix || (!options.autoFix && p.confidence < options.threshold)
  );

  console.log('─'.repeat(60));
  console.log('SUMMARY');
  console.log('─'.repeat(60));
  console.log(`  Total failures:     ${failures.length}`);
  console.log(`  Auto-applicable:    ${autoApplicable.length}`);
  console.log(`  Needs review:       ${needsReview.length}`);
  console.log(`  Threshold:          ${options.threshold}%`);
  console.log(`  Mode:               ${options.dryRun ? 'dry-run' : options.autoFix ? 'auto-fix' : 'threshold-based'}`);

  // Apply fixes if not dry-run and we have a spec file
  if (!options.dryRun && options.specFile && autoApplicable.length > 0) {
    console.log(`\n📝 Applying ${autoApplicable.length} fix(es) to: ${options.specFile}`);
    
    const spec = loadJson(options.specFile);
    let appliedCount = 0;
    
    for (const proposal of autoApplicable) {
      if (applyFix(spec, proposal)) {
        appliedCount++;
      }
    }

    const outputPath = options.output || options.specFile;
    writeFileSync(outputPath, JSON.stringify(spec, null, 2));
    
    console.log(`✅ Applied ${appliedCount} fix(es) to: ${outputPath}`);
    
    if (needsReview.length > 0) {
      console.log(`\n⚠️  ${needsReview.length} issue(s) require manual review`);
    }
  } else if (options.dryRun) {
    console.log('\n📋 Dry run complete - no changes made');
  } else if (!options.specFile) {
    console.log('\n💡 Provide --spec <path> to apply fixes');
  }

  // Exit with error code if there are unresolved issues
  process.exit(needsReview.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
