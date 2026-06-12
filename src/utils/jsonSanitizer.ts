/**
 * JSON Sanitizer Utility
 * 
 * Handles JavaScript number precision loss for large integer IDs (18-19 digits)
 * by converting them to strings before JSON.parse() is called.
 * 
 * Problem: JavaScript cannot safely represent integers > 2^53-1 (16 digits)
 * Solution: Pre-process JSON string to wrap large numeric IDs in quotes
 */

/**
 * Pre-process JSON string to wrap large numbers (18-19 digits) in quotes
 * This prevents JavaScript from losing precision when parsing
 * 
 * @param jsonString - Raw JSON string before parsing
 * @returns Preprocessed JSON string with large IDs as strings
 * 
 * @example
 * Input:  '{"id": 684743578985398272, "name": "test"}'
 * Output: '{"id": "684743578985398272", "name": "test"}'
 */
export function preprocessJSONString(jsonString: string): string {
  let s = jsonString;

  // 1) Scalar id-bearing fields. NOTE: uses 16+ digits (anything > 2^53-1, i.e.
  //    16+ digits, is unsafe in JS). `hasToBeExecutorId` is included here —
  //    its omission previously let executor-lock task IDs get rounded.
  s = s.replace(
    /("(?:id|triggerEntityId|parameterId|taskId|stageId|checklistId|actionId|effectId|referencedParameterId|hasToBeExecutorId)"\s*:\s*)(\d{16,})\b/g,
    '$1"$2"',
  );

  // 2) ARRAY id fields (the case the old regex missed entirely). Task IDs inside
  //    `prerequisiteTaskIds` / `cannotBeExecutorIds` are unquoted numbers and
  //    were silently corrupted on parse, breaking import after duplication.
  s = s.replace(
    /("(?:prerequisiteTaskIds|cannotBeExecutorIds)"\s*:\s*\[)([^\]]*)(\])/g,
    (_m, open, inner, close) => open + inner.replace(/(\d{16,})/g, '"$1"') + close,
  );

  return s;
}

/**
 * Inverse of the array/scalar protection above: re-emit the task-reference
 * fields as RAW (unquoted) numbers, matching the platform's own export format.
 * Entity `id` fields stay strings (the platform exports those as strings too).
 *
 * Works on both minified and pretty-printed JSON (tolerant of whitespace).
 */
export function postprocessJSONString(jsonString: string): string {
  let s = jsonString;
  s = s.replace(/("hasToBeExecutorId"\s*:\s*)"(\d{16,})"/g, '$1$2');
  s = s.replace(
    /("(?:prerequisiteTaskIds|cannotBeExecutorIds)"\s*:\s*\[)([^\]]*)(\])/g,
    (_m, open, inner, close) => open + inner.replace(/"(\d{16,})"/g, '$1') + close,
  );
  return s;
}

/**
 * Serialize a config for download/import, preserving big-int IDs exactly and
 * restoring the platform's numeric formatting for task-reference fields.
 * Pass `pretty` only for human-readable (review) output.
 */
export function serializeConfig(config: any, pretty = false): string {
  return postprocessJSONString(JSON.stringify(config, null, pretty ? 2 : undefined));
}

/**
 * Safe JSON parse that preserves large integer IDs
 * Use this instead of JSON.parse() for config files
 * 
 * @param jsonString - Raw JSON string to parse
 * @returns Parsed JavaScript object with IDs as strings
 * 
 * @example
 * const config = safeJSONParse(fileContent);
 * // All ID fields will be strings, not numbers
 */
export function safeJSONParse(jsonString: string): any {
  const preprocessed = preprocessJSONString(jsonString);
  return JSON.parse(preprocessed);
}

/**
 * Validate that all IDs in config are strings
 * Returns list of paths where numeric IDs were found
 * 
 * Useful for debugging and validation in development
 * 
 * @param config - Parsed configuration object
 * @param path - Starting path for recursion (default: 'root')
 * @returns Array of paths where numeric IDs were detected
 * 
 * @example
 * const issues = validateIDTypes(config);
 * if (issues.length > 0) {
 *   console.warn('Numeric IDs found:', issues);
 * }
 */
export function validateIDTypes(config: any, path: string = 'root'): string[] {
  const issues: string[] = [];

  function check(value: any, currentPath: string): void {
    if (value === null || value === undefined) return;

    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, val] of Object.entries(value)) {
        const newPath = `${currentPath}.${key}`;
        
        // Check if this is an ID field with numeric value
        if (key.toLowerCase().includes('id') && typeof val === 'number') {
          issues.push(`${newPath} = ${val} (number, should be string)`);
        }
        
        check(val, newPath);
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        check(item, `${currentPath}[${index}]`);
      });
    }
  }

  check(config, path);
  return issues;
}
