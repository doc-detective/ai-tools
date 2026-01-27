/**
 * Configuration loader for Doc Detective
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

export interface DocDetectiveConfig {
  input?: string[];
  output?: string;
  recursive?: boolean;
  logLevel?: string;
  [key: string]: unknown;
}

const DEFAULT_CONFIG: DocDetectiveConfig = {
  input: ['**/*.md'],
  output: './test-results',
  recursive: true,
  logLevel: 'info',
};

/**
 * Load Doc Detective configuration from file or return defaults
 */
export function loadConfig(configPath?: string, baseDir?: string): DocDetectiveConfig {
  // If explicit path provided, try to load it
  if (configPath && fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const ext = path.extname(configPath).toLowerCase();
      const parsed = (ext === '.yaml' || ext === '.yml')
        ? yaml.load(content) as DocDetectiveConfig
        : JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  
  // Search for config file in common locations
  const searchDirs = [
    baseDir || process.cwd(),
    path.dirname(baseDir || process.cwd()),
  ];
  
  const configNames = ['.doc-detective.json', 'doc-detective.json', '.doc-detective.yaml', '.doc-detective.yml'];
  
  for (const dir of searchDirs) {
    for (const name of configNames) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const ext = path.extname(name).toLowerCase();
          const parsed = (ext === '.yaml' || ext === '.yml')
            ? yaml.load(content) as DocDetectiveConfig
            : JSON.parse(content);
          return { ...DEFAULT_CONFIG, ...parsed };
        } catch {
          continue;
        }
      }
    }
  }
  
  return DEFAULT_CONFIG;
}

/**
 * Merge provided options with loaded config
 */
export function mergeConfig(
  config: DocDetectiveConfig,
  options: Partial<DocDetectiveConfig>
): DocDetectiveConfig {
  return {
    ...config,
    ...options,
  };
}
