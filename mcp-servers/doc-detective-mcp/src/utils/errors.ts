/**
 * Custom error types for doc-detective-mcp
 */

export class DocDetectiveError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'DocDetectiveError';
    this.code = code;
    this.context = context;
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DocDetectiveError);
    }
  }
}

export class FileNotFoundError extends DocDetectiveError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND', { filePath });
    this.name = 'FileNotFoundError';
  }
}

export class ValidationError extends DocDetectiveError {
  public readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class ExecutionError extends DocDetectiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EXECUTION_ERROR', context);
    this.name = 'ExecutionError';
  }
}

export class ParseError extends DocDetectiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PARSE_ERROR', context);
    this.name = 'ParseError';
  }
}

/**
 * Convert any error to a standardized error response
 */
export function formatError(error: unknown): { success: false; message: string } {
  if (error instanceof DocDetectiveError) {
    return {
      success: false,
      message: error.message,
    };
  }
  
  if (error instanceof Error) {
    return {
      success: false,
      message: error.message,
    };
  }
  
  return {
    success: false,
    message: String(error),
  };
}
