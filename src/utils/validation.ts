import type {
  ChecklistConfig,
  JsonValidationError,
  ConfigValidationError,
  DuplicationConfig,
} from '@/types';
import { safeJSONParse, validateIDTypes } from './jsonSanitizer';

/**
 * Validate JSON string format
 */
export function validateJsonFormat(input: string): {
  valid: boolean;
  error?: JsonValidationError;
  parsed?: any;
} {
  if (!input || input.trim() === '') {
    return {
      valid: false,
      error: {
        type: 'syntax',
        message: 'Input is empty',
      },
    };
  }

  try {
    const parsed = safeJSONParse(input);
    
    // Optional: Validate ID types in development
    if (process.env.NODE_ENV === 'development') {
      const issues = validateIDTypes(parsed);
      if (issues.length > 0) {
        console.warn('⚠️ Numeric ID fields detected (converted to strings):', issues.slice(0, 5));
        if (issues.length > 5) {
          console.warn(`... and ${issues.length - 5} more`);
        }
      }
    }
    
    return { valid: true, parsed };
  } catch (e) {
    const error = e as Error;
    const lineMatch = error.message.match(/position (\d+)/);
    const position = lineMatch ? parseInt(lineMatch[1]) : undefined;

    return {
      valid: false,
      error: {
        type: 'syntax',
        message: error.message,
        line: position,
      },
    };
  }
}

/**
 * Validate required fields in checklist configuration
 */
export function validateRequiredFields(config: any): {
  valid: boolean;
  errors: JsonValidationError[];
} {
  const errors: JsonValidationError[] = [];

  // Must be an array
  if (!Array.isArray(config)) {
    errors.push({
      type: 'schema',
      message: 'Configuration must be an array of checklist objects',
    });
    return { valid: false, errors };
  }

  // Check each checklist
  config.forEach((checklist, idx) => {
    if (!checklist.id) {
      errors.push({
        type: 'schema',
        message: `Checklist at index ${idx} is missing required field: id`,
        field: `[${idx}].id`,
      });
    }
    if (!checklist.name) {
      errors.push({
        type: 'schema',
        message: `Checklist at index ${idx} is missing required field: name`,
        field: `[${idx}].name`,
      });
    }
    if (!checklist.stageRequests) {
      errors.push({
        type: 'schema',
        message: `Checklist at index ${idx} is missing required field: stageRequests`,
        field: `[${idx}].stageRequests`,
      });
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validate structure of the configuration
 */
export function validateStructure(config: ChecklistConfig[]): {
  valid: boolean;
  errors: JsonValidationError[];
} {
  const errors: JsonValidationError[] = [];

  config.forEach((checklist, cIdx) => {
    // Validate stages
    if (!Array.isArray(checklist.stageRequests)) {
      errors.push({
        type: 'structure',
        message: `Checklist "${checklist.name}": stageRequests must be an array`,
        field: `[${cIdx}].stageRequests`,
      });
      return;
    }

    checklist.stageRequests.forEach((stage, sIdx) => {
      if (!stage.id || !stage.name || stage.orderTree === undefined) {
        errors.push({
          type: 'structure',
          message: `Stage at index ${sIdx} in "${checklist.name}" is missing required fields`,
          field: `[${cIdx}].stageRequests[${sIdx}]`,
        });
      }

      // Validate tasks
      if (!Array.isArray(stage.taskRequests)) {
        errors.push({
          type: 'structure',
          message: `Stage "${stage.name}": taskRequests must be an array`,
          field: `[${cIdx}].stageRequests[${sIdx}].taskRequests`,
        });
        return;
      }

      stage.taskRequests.forEach((task, tIdx) => {
        if (!task.id || !task.name || task.orderTree === undefined) {
          errors.push({
            type: 'structure',
            message: `Task at index ${tIdx} in stage "${stage.name}" is missing required fields`,
            field: `[${cIdx}].stageRequests[${sIdx}].taskRequests[${tIdx}]`,
          });
        }

        // Validate parameters
        if (!Array.isArray(task.parameterRequests)) {
          errors.push({
            type: 'structure',
            message: `Task "${task.name}": parameterRequests must be an array`,
            field: `[${cIdx}].stageRequests[${sIdx}].taskRequests[${tIdx}].parameterRequests`,
          });
        }
      });
    });
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validate number of copies
 */
export function validateCopyCount(count: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isInteger(count)) {
    return { valid: false, error: 'Must be a whole number' };
  }
  if (count < 1) {
    return { valid: false, error: 'Must be at least 1' };
  }
  if (count > 100) {
    return { valid: false, error: 'Maximum 100 copies allowed' };
  }
  return { valid: true };
}

/**
 * Validate naming pattern
 */
export function validateNamingPattern(
  pattern: string,
  baseName: string
): {
  valid: boolean;
  error?: string;
} {
  if (!pattern.includes('{n}')) {
    return { valid: false, error: 'Pattern must include {n} placeholder' };
  }

  // Generate a sample name to check length
  const sample = pattern
    .replace('{base_name}', baseName)
    .replace('{n}', '001');

  if (sample.length > 512) {
    return {
      valid: false,
      error: 'Generated names would be too long (>512 characters)',
    };
  }

  return { valid: true };
}

/**
 * Validate duplication configuration
 */
export function validateDuplicationConfig(
  config: DuplicationConfig,
  entityName: string
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  // Validate copy count
  const copyCountValidation = validateCopyCount(config.numberOfCopies);
  if (!copyCountValidation.valid) {
    errors.push({
      field: 'numberOfCopies',
      message: copyCountValidation.error!,
    });
  }

  // Validate naming pattern
  const baseName = config.namingPattern.baseNameOverride || entityName;
  const namingValidation = validateNamingPattern(
    config.namingPattern.template,
    baseName
  );
  if (!namingValidation.valid) {
    errors.push({
      field: 'namingPattern.template',
      message: namingValidation.error!,
    });
  }

  return errors;
}

/**
 * Post-operation integrity check.
 *
 * Walks the produced config and verifies it is safe to import:
 *  - no duplicate entity IDs
 *  - every task reference (prerequisiteTaskIds / executor lock) resolves to a
 *    real task in the same checklist
 *  - no id-bearing field is still a JS number beyond the safe integer range
 *    (which would mean a big-int slipped through un-protected and got rounded)
 */
export interface IntegrityReport {
  ok: boolean;
  duplicateIds: string[];
  danglingTaskRefs: { task: string; ref: string }[];
  unsafeNumbers: string[];
  checkedTasks: number;
}

/** Collect duplicate `id` values and any unsafe (>2^53) numeric id fields. */
function collectIdIssues(config: ChecklistConfig[]): { dupes: Set<string>; unsafe: string[] } {
  const counts = new Map<string, number>();
  const unsafe: string[] = [];
  const walk = (node: any, path: string) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'id' && typeof v === 'string') counts.set(v, (counts.get(v) || 0) + 1);
      if (typeof v === 'number' && k.toLowerCase().includes('id') && Math.abs(v) > Number.MAX_SAFE_INTEGER) {
        unsafe.push(`${path}.${k} = ${v}`);
      }
      if (v && typeof v === 'object') walk(v, `${path}.${k}`);
    }
  };
  walk(config, 'root');
  const dupes = new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  return { dupes, unsafe };
}

/** Task references that don't resolve to a task anywhere in the SAME checklist. */
function collectDanglingRefs(config: ChecklistConfig[]): { list: { task: string; ref: string }[]; checked: number } {
  const list: { task: string; ref: string }[] = [];
  let checked = 0;
  config.forEach((checklist) => {
    // A reference is valid if the task exists anywhere in this checklist
    // (prerequisites / executor locks may legitimately span stages).
    const taskIds = new Set<string>();
    (checklist.stageRequests || []).forEach((s) =>
      (s.taskRequests || []).forEach((t) => taskIds.add(String(t.id))),
    );
    (checklist.stageRequests || []).forEach((stage) => {
      (stage.taskRequests || []).forEach((task) => {
        checked += 1;
        const anyTask = task as any;
        const refs: string[] = [];
        (anyTask.prerequisiteTaskIds || []).forEach((r: unknown) => refs.push(String(r)));
        const lock = anyTask.taskExecutorLock;
        if (lock) {
          if (lock.hasToBeExecutorId != null) refs.push(String(lock.hasToBeExecutorId));
          (lock.cannotBeExecutorIds || []).forEach((r: unknown) => refs.push(String(r)));
        }
        refs.forEach((ref) => {
          if (!taskIds.has(ref)) list.push({ task: task.name, ref });
        });
      });
    });
  });
  return { list, checked };
}

/**
 * @param config   the produced (modified) config
 * @param baseline the original config; when provided, only issues NOT already
 *                 present in the original are reported (so we surface problems
 *                 the operation introduced, not pre-existing source quirks).
 */
export function validateReferences(
  config: ChecklistConfig[],
  baseline?: ChecklistConfig[],
): IntegrityReport {
  const cur = collectIdIssues(config);
  const danglingCur = collectDanglingRefs(config);

  let duplicateIds = [...cur.dupes];
  let unsafeNumbers = cur.unsafe;
  let danglingTaskRefs = danglingCur.list;

  if (baseline) {
    const base = collectIdIssues(baseline);
    const baseDangling = new Set(collectDanglingRefs(baseline).list.map((d) => `${d.task}|${d.ref}`));
    duplicateIds = duplicateIds.filter((id) => !base.dupes.has(id));
    danglingTaskRefs = danglingTaskRefs.filter((d) => !baseDangling.has(`${d.task}|${d.ref}`));
    // unsafe numbers should never be pre-existing after safe-parse, keep as-is
  }

  return {
    ok: duplicateIds.length === 0 && danglingTaskRefs.length === 0 && unsafeNumbers.length === 0,
    duplicateIds,
    danglingTaskRefs,
    unsafeNumbers,
    checkedTasks: danglingCur.checked,
  };
}

/**
 * Check for name conflicts
 */
export function detectNameConflicts(
  proposedNames: string[],
  existingNames: string[]
): string[] {
  const existingSet = new Set(existingNames);
  return proposedNames.filter(name => existingSet.has(name));
}

/**
 * Check for duplicate order trees
 */
export function detectOrderTreeDuplicates(orders: number[]): number[] {
  const seen = new Set<number>();
  const duplicates: number[] = [];

  orders.forEach(order => {
    if (seen.has(order)) {
      duplicates.push(order);
    }
    seen.add(order);
  });

  return duplicates;
}
