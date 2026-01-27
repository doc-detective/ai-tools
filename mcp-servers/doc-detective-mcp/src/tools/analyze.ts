/**
 * Analyze Tool - Analyzes test execution results and generates plaintext reports
 */

import * as fs from 'fs';
import type { AnalyzeInput, AnalyzeOutput, DocDetectiveResults } from '../types/index.js';
import { formatError } from '../utils/errors.js';

/**
 * Analyze test execution results
 */
export async function analyzeTool(input: AnalyzeInput): Promise<AnalyzeOutput> {
  try {
    const { results_input, detailed = false, focus } = input;
    
    // Load results
    let results: DocDetectiveResults;
    
    // Check if input is a file path
    if (fs.existsSync(results_input)) {
      const content = fs.readFileSync(results_input, 'utf-8');
      results = JSON.parse(content);
    } else {
      // Try parsing as JSON string
      try {
        results = JSON.parse(results_input);
      } catch {
        return {
          success: false,
          message: 'Invalid results: Could not parse as JSON and file not found.',
        };
      }
    }
    
    // Validate results structure
    if (!isValidResults(results)) {
      return {
        success: false,
        message: 'Invalid results format: Missing required "results" or "summary" fields.',
      };
    }
    
    // Calculate metrics
    const metrics = calculateMetrics(results);
    
    // Generate analysis
    const analysis = generateAnalysis(results, metrics, detailed, focus);
    
    // Generate recommendations
    const recommendations = generateRecommendations(results, metrics);
    
    // Identify critical failures
    const criticalFailures = identifyCriticalFailures(results);
    
    return {
      success: true,
      analysis,
      summary: {
        total_tests: metrics.totalTests,
        pass_rate: metrics.passRate,
        failure_rate: metrics.failureRate,
        critical_failures: criticalFailures,
        recommendations,
      },
      message: `Analysis complete. ${metrics.totalTests} tests analyzed.`,
    };
  } catch (error) {
    return {
      ...formatError(error),
    };
  }
}

/**
 * Check if results have valid structure
 */
function isValidResults(results: unknown): results is DocDetectiveResults {
  if (!results || typeof results !== 'object') {
    return false;
  }
  
  const r = results as Record<string, unknown>;
  
  // Must have either results array or summary
  return Array.isArray(r.results) || (r.summary !== undefined && typeof r.summary === 'object');
}

interface Metrics {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  failureRate: number;
  avgDuration: number;
  totalDuration: number;
}

/**
 * Calculate metrics from results
 */
function calculateMetrics(results: DocDetectiveResults): Metrics {
  const summary = results.summary || {
    tests: results.results?.length || 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };
  
  // If summary doesn't have pass/fail counts, calculate from results
  let passed = summary.passed || 0;
  let failed = summary.failed || 0;
  let skipped = summary.skipped || 0;
  let totalDuration = 0;
  
  if (results.results && (!summary.passed && !summary.failed)) {
    for (const result of results.results) {
      if (result.status === 'PASSED') passed++;
      else if (result.status === 'FAILED') failed++;
      else if (result.status === 'SKIPPED') skipped++;
      
      totalDuration += result.duration || 0;
    }
  } else if (results.results) {
    for (const result of results.results) {
      totalDuration += result.duration || 0;
    }
  }
  
  const totalTests = summary.tests || (passed + failed + skipped);
  const passRate = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0;
  const failureRate = totalTests > 0 ? Math.round((failed / totalTests) * 100) : 0;
  const avgDuration = totalTests > 0 ? Math.round(totalDuration / totalTests) : 0;
  
  return {
    totalTests,
    passed,
    failed,
    skipped,
    passRate,
    failureRate,
    avgDuration,
    totalDuration,
  };
}

/**
 * Generate plaintext analysis
 */
function generateAnalysis(
  results: DocDetectiveResults,
  metrics: Metrics,
  detailed: boolean,
  focus?: string
): string {
  const lines: string[] = [];
  
  // Header
  lines.push('Test Results Analysis');
  lines.push('====================');
  lines.push('');
  
  // Summary
  lines.push(`Total: ${metrics.totalTests} tests | Passed: ${metrics.passed} | Failed: ${metrics.failed} | Skipped: ${metrics.skipped}`);
  lines.push(`Pass Rate: ${metrics.passRate}%`);
  if (metrics.totalDuration > 0) {
    lines.push(`Total Duration: ${(metrics.totalDuration / 1000).toFixed(2)}s | Average: ${(metrics.avgDuration / 1000).toFixed(2)}s per test`);
  }
  lines.push('');
  
  // Focus on specific area if requested
  if (focus === 'failures' || (!focus && metrics.failed > 0)) {
    lines.push('Failures:');
    lines.push('---------');
    
    if (results.results) {
      for (const result of results.results) {
        if (result.status === 'FAILED') {
          lines.push(`- ${result.testId || result.description || 'Unknown test'}`);
          
          // Find the failed step
          if (result.steps) {
            for (const step of result.steps) {
              if (step.status === 'FAILED') {
                lines.push(`  Step: ${step.action || step.stepId || 'Unknown step'}`);
                if (step.error) {
                  lines.push(`  Error: ${step.error}`);
                }
              }
            }
          }
        }
      }
    }
    lines.push('');
  }
  
  if (focus === 'performance' || detailed) {
    lines.push('Performance:');
    lines.push('------------');
    
    if (results.results) {
      // Find slowest and fastest tests
      const sortedByDuration = [...results.results]
        .filter(r => r.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0));
      
      if (sortedByDuration.length > 0) {
        const slowest = sortedByDuration[0];
        const fastest = sortedByDuration[sortedByDuration.length - 1];
        
        lines.push(`- Slowest test: ${slowest.testId || slowest.description} (${((slowest.duration || 0) / 1000).toFixed(2)}s)`);
        lines.push(`- Fastest test: ${fastest.testId || fastest.description} (${((fastest.duration || 0) / 1000).toFixed(2)}s)`);
      }
    }
    lines.push('');
  }
  
  // Detailed test-by-test breakdown
  if (detailed && results.results) {
    lines.push('Detailed Results:');
    lines.push('-----------------');
    
    for (const result of results.results) {
      const status = result.status === 'PASSED' ? '[PASS]' : result.status === 'FAILED' ? '[FAIL]' : '[SKIP]';
      lines.push(`${status} ${result.testId || result.description}`);
      
      if (result.steps && result.steps.length > 0) {
        for (const step of result.steps) {
          const stepStatus = step.status === 'PASSED' ? '  [OK]' : step.status === 'FAILED' ? '  [X]' : '  [-]';
          lines.push(`${stepStatus} ${step.action || step.stepId}`);
        }
      }
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generate recommendations based on results
 */
function generateRecommendations(results: DocDetectiveResults, metrics: Metrics): string[] {
  const recommendations: string[] = [];
  
  // High failure rate
  if (metrics.failureRate > 50) {
    recommendations.push('High failure rate detected. Consider reviewing test specifications or checking if the application under test is running correctly.');
  }
  
  // All tests passed
  if (metrics.passRate === 100 && metrics.totalTests > 0) {
    recommendations.push('All tests passed! Documentation appears to match application behavior.');
  }
  
  // Look for common failure patterns
  if (results.results) {
    const failedSteps: string[] = [];
    
    for (const result of results.results) {
      if (result.status === 'FAILED' && result.steps) {
        for (const step of result.steps) {
          if (step.status === 'FAILED' && step.error) {
            failedSteps.push(step.error);
          }
        }
      }
    }
    
    // Check for timeout issues
    const timeoutCount = failedSteps.filter(e => e.toLowerCase().includes('timeout')).length;
    if (timeoutCount > 0) {
      recommendations.push(`${timeoutCount} timeout error(s) detected. Consider increasing timeout values or checking network connectivity.`);
    }
    
    // Check for element not found issues
    const notFoundCount = failedSteps.filter(e => e.toLowerCase().includes('not found')).length;
    if (notFoundCount > 0) {
      recommendations.push(`${notFoundCount} "element not found" error(s) detected. Verify selectors match the current application state.`);
    }
  }
  
  // Slow tests
  if (metrics.avgDuration > 10000) {
    recommendations.push('Average test duration is over 10 seconds. Consider optimizing test steps or parallelizing test execution.');
  }
  
  return recommendations;
}

/**
 * Identify critical failures (tests that block workflows)
 */
function identifyCriticalFailures(results: DocDetectiveResults): string[] {
  const criticalFailures: string[] = [];
  
  if (results.results) {
    for (const result of results.results) {
      if (result.status === 'FAILED') {
        // Check if it's a navigation/setup failure (likely critical)
        if (result.steps && result.steps.length > 0) {
          const firstStep = result.steps[0];
          if (firstStep.status === 'FAILED') {
            criticalFailures.push(
              `${result.testId || result.description}: Failed at first step - may indicate application unavailability`
            );
          }
        }
      }
    }
  }
  
  return criticalFailures;
}
