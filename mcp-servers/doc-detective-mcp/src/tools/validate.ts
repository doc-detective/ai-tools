/**
 * Validate Tool - Validates Doc Detective test specifications
 */

import * as fs from 'fs';
import type { ValidateInput, ValidateOutput, DocDetectiveSpec } from '../types/index.js';
import { loadSpec, hasValidStructure } from '../utils/spec-handler.js';
import { formatError } from '../utils/errors.js';

// Valid Doc Detective actions
const VALID_ACTIONS = [
  'goTo', 'find', 'click', 'type', 'httpRequest', 
  'screenshot', 'runShell', 'wait', 'checkLink',
  'setVariables', 'record', 'stopRecord', 'saveRecording'
];

/**
 * Validate a Doc Detective test specification
 */
export async function validateTool(input: ValidateInput): Promise<ValidateOutput> {
  try {
    // Load the spec
    const loadResult = loadSpec(input.spec_input);
    
    if (!loadResult.success || !loadResult.spec) {
      return {
        success: false,
        valid: false,
        errors: [loadResult.error || 'Failed to load spec'],
        warnings: [],
        message: loadResult.error || 'Failed to load spec',
      };
    }
    
    const spec = loadResult.spec;
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check basic structure
    if (!hasValidStructure(spec)) {
      errors.push('Spec must have a "tests" array');
      return {
        success: true,
        valid: false,
        errors,
        warnings,
        message: 'Validation failed: Spec must have a "tests" array',
      };
    }
    
    // Validate each test
    spec.tests.forEach((test, testIndex) => {
      const testId = test.id || test.testId || `test-${testIndex}`;
      
      // Check for steps
      if (!test.steps || !Array.isArray(test.steps)) {
        errors.push(`Test "${testId}": Missing or invalid "steps" array`);
        return;
      }
      
      if (test.steps.length === 0) {
        warnings.push(`Test "${testId}": Has empty steps array`);
      }
      
      // Validate each step
      test.steps.forEach((step, stepIndex) => {
        const stepId = step.stepId || `step-${stepIndex}`;
        
        // Find the action key
        const actionKey = Object.keys(step).find(key => VALID_ACTIONS.includes(key));
        const hasActionProperty = step.action !== undefined;
        
        if (!actionKey && !hasActionProperty) {
          errors.push(`Test "${testId}", Step ${stepIndex}: No valid action found. Valid actions: ${VALID_ACTIONS.join(', ')}`);
        }
        
        // Validate specific actions
        if (step.goTo !== undefined) {
          if (typeof step.goTo !== 'string' && typeof step.goTo !== 'object') {
            errors.push(`Test "${testId}", Step ${stepIndex}: "goTo" must be a string URL or object with url property`);
          }
        }
        
        if (step.find !== undefined) {
          if (typeof step.find !== 'string' && typeof step.find !== 'object') {
            errors.push(`Test "${testId}", Step ${stepIndex}: "find" must be a string or object`);
          }
        }
        
        if (step.click !== undefined) {
          if (typeof step.click !== 'string' && typeof step.click !== 'object') {
            errors.push(`Test "${testId}", Step ${stepIndex}: "click" must be a string or object`);
          }
        }
        
        if (step.type !== undefined) {
          if (typeof step.type !== 'object') {
            errors.push(`Test "${testId}", Step ${stepIndex}: "type" must be an object with keys and selector`);
          }
        }
        
        if (step.wait !== undefined) {
          if (typeof step.wait !== 'number' && typeof step.wait !== 'object') {
            errors.push(`Test "${testId}", Step ${stepIndex}: "wait" must be a number (ms) or object`);
          }
        }
      });
    });
    
    const valid = errors.length === 0;
    
    return {
      success: true,
      valid,
      errors,
      warnings,
      spec: valid ? spec : undefined,
      message: valid 
        ? `Validation passed. ${spec.tests.length} test(s) found.`
        : `Validation failed with ${errors.length} error(s).`,
    };
  } catch (error) {
    return {
      ...formatError(error),
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}
