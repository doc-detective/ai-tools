/**
 * Utility module for loading and parsing spec files
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { DocDetectiveSpec } from '../types/index.js';

export interface LoadSpecResult {
  success: boolean;
  spec?: DocDetectiveSpec;
  error?: string;
}

/**
 * Load a spec from either a file path or inline JSON/YAML string
 */
export function loadSpec(input: string): LoadSpecResult {
  // Check if input looks like JSON or YAML content
  const trimmed = input.trim();
  
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    // Try parsing as JSON
    try {
      const spec = JSON.parse(trimmed);
      return { success: true, spec };
    } catch (e) {
      return { 
        success: false, 
        error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}` 
      };
    }
  }
  
  // Check if it's a file path
  if (fs.existsSync(input)) {
    try {
      const content = fs.readFileSync(input, 'utf-8');
      const ext = path.extname(input).toLowerCase();
      
      if (ext === '.yaml' || ext === '.yml') {
        const spec = yaml.load(content) as DocDetectiveSpec;
        return { success: true, spec };
      } else {
        // Assume JSON
        const spec = JSON.parse(content);
        return { success: true, spec };
      }
    } catch (e) {
      return { 
        success: false, 
        error: `Failed to load spec file: ${e instanceof Error ? e.message : String(e)}` 
      };
    }
  }
  
  // Try parsing as YAML (for inline YAML content)
  try {
    const spec = yaml.load(trimmed) as DocDetectiveSpec;
    if (spec && typeof spec === 'object') {
      return { success: true, spec };
    }
    return { success: false, error: 'Invalid spec format' };
  } catch (e) {
    return { 
      success: false, 
      error: `File not found and failed to parse as YAML: ${input}` 
    };
  }
}

/**
 * Serialize a spec to JSON string
 */
export function serializeSpec(spec: DocDetectiveSpec, pretty: boolean = true): string {
  return pretty ? JSON.stringify(spec, null, 2) : JSON.stringify(spec);
}

/**
 * Check if a spec has the basic required structure
 */
export function hasValidStructure(spec: unknown): spec is DocDetectiveSpec {
  if (!spec || typeof spec !== 'object') {
    return false;
  }
  
  const s = spec as Record<string, unknown>;
  if (!Array.isArray(s.tests)) {
    return false;
  }
  
  return true;
}
