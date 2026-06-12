import type { ChecklistConfig, Stage, Task, Parameter, SelectedEntity } from '@/types';
import { deepClone } from './helpers';

/**
 * Deletion engine.
 *
 * Deletes the selected stage(s) / task(s) / parameter(s) AND scrubs every
 * reference to them from the rest of the configuration BEFORE removing them,
 * so the resulting JSON stays internally consistent and importable.
 *
 * Reference sites handled (discovered from real exports):
 *  - Automations: actionDetails/triggerDetails  -> configuration[].parameterId,
 *    referencedParameterId (unlinked = set to null; optionally drop emptied autos)
 *  - Resource filters: data.propertyFilters.fields[].referencedParameterId  (field removed)
 *  - Resource validations: data.propertyValidations.fields[].referencedParameterId (field removed)
 *  - Parameter rules: rules[].show.{parameters,tasks,stages}  (ids filtered out)
 *  - autoInitialize.parameterId  (autoInitialize cleared)
 *  - CALCULATION: data.variables[*].{parameterId,taskId}  (variable removed)
 *  - Actions/effects: Lexical @p mentions  (replaced with a text marker)
 */

export interface DeletionOptions {
  /** Remove an automation entirely if, after unlinking, it references no parameter at all. */
  removeEmptiedAutomations: boolean;
}

export const DEFAULT_DELETION_OPTIONS: DeletionOptions = {
  removeEmptiedAutomations: true,
};

export interface DeletionReportItem {
  kind:
    | 'automation'
    | 'automation-removed'
    | 'filter'
    | 'validation'
    | 'rule'
    | 'autoInitialize'
    | 'calculation'
    | 'mention'
    | 'taskRef';
  location: string;
  detail: string;
}

export interface DeletionReport {
  deletedEntities: { type: string; name: string; id: string }[];
  deletedParameterIds: string[];
  deletedTaskIds: string[];
  deletedStageIds: string[];
  cleaned: DeletionReportItem[];
  counts: {
    references: number;
    automationsUnlinked: number;
    automationsRemoved: number;
    filters: number;
    validations: number;
    rulesRemoved: number;
    autoInit: number;
    calculations: number;
    mentions: number;
    taskRefs: number;
  };
}

/** Strip deleted task ids from a remaining task's prerequisite / executor-lock refs. */
function cleanTaskReferences(
  task: Task,
  loc: string,
  deletedTasks: Set<string>,
  report: DeletionReport,
): void {
  const anyTask = task as any;
  let removed = 0;

  if (Array.isArray(anyTask.prerequisiteTaskIds)) {
    const before = anyTask.prerequisiteTaskIds.length;
    anyTask.prerequisiteTaskIds = anyTask.prerequisiteTaskIds.filter(
      (id: unknown) => !deletedTasks.has(String(id)),
    );
    removed += before - anyTask.prerequisiteTaskIds.length;
  }

  const lock = anyTask.taskExecutorLock;
  if (lock && typeof lock === 'object') {
    if (lock.hasToBeExecutorId != null && deletedTasks.has(String(lock.hasToBeExecutorId))) {
      lock.hasToBeExecutorId = null;
      removed += 1;
    }
    if (Array.isArray(lock.cannotBeExecutorIds)) {
      const before = lock.cannotBeExecutorIds.length;
      lock.cannotBeExecutorIds = lock.cannotBeExecutorIds.filter(
        (id: unknown) => !deletedTasks.has(String(id)),
      );
      removed += before - lock.cannotBeExecutorIds.length;
    }
  }

  if (removed > 0) {
    report.counts.taskRefs += removed;
    report.counts.references += removed;
    report.cleaned.push({
      kind: 'taskRef',
      location: loc,
      detail: `Removed ${removed} prerequisite/executor reference(s) to deleted task(s)`,
    });
  }
}

const paramLabel = (p: Parameter) => p.label || `Parameter ${p.id}`;

/** Collect every parameter/task/stage id that is going away. */
function collectDeletedIds(selected: SelectedEntity[]) {
  const parameters = new Set<string>();
  const tasks = new Set<string>();
  const stages = new Set<string>();
  const entities: { type: string; name: string; id: string }[] = [];

  for (const sel of selected) {
    if (sel.type === 'parameter') {
      const p = sel.data as Parameter;
      parameters.add(String(p.id));
      entities.push({ type: 'parameter', name: paramLabel(p), id: String(p.id) });
    } else if (sel.type === 'task') {
      const t = sel.data as Task;
      tasks.add(String(t.id));
      entities.push({ type: 'task', name: t.name, id: String(t.id) });
      t.parameterRequests?.forEach((p) => parameters.add(String(p.id)));
    } else if (sel.type === 'stage') {
      const s = sel.data as Stage;
      stages.add(String(s.id));
      entities.push({ type: 'stage', name: s.name, id: String(s.id) });
      s.taskRequests?.forEach((t) => {
        tasks.add(String(t.id));
        t.parameterRequests?.forEach((p) => parameters.add(String(p.id)));
      });
    }
  }
  return { parameters, tasks, stages, entities };
}

/** Remove the selected entities from their parent arrays (by id, order-independent). */
function removeSelected(config: ChecklistConfig[], selected: SelectedEntity[]) {
  const paramIds = new Set(selected.filter((s) => s.type === 'parameter').map((s) => String(s.id)));
  const taskIds = new Set(selected.filter((s) => s.type === 'task').map((s) => String(s.id)));
  const stageIds = new Set(selected.filter((s) => s.type === 'stage').map((s) => String(s.id)));

  for (const checklist of config) {
    const cl = checklist as any;
    if (Array.isArray(cl.parameterRequests)) {
      cl.parameterRequests = cl.parameterRequests.filter((p: Parameter) => !paramIds.has(String(p.id)));
    }
    if (Array.isArray(checklist.stageRequests)) {
      checklist.stageRequests = checklist.stageRequests.filter((s) => !stageIds.has(String(s.id)));
      for (const stage of checklist.stageRequests) {
        if (!Array.isArray(stage.taskRequests)) continue;
        stage.taskRequests = stage.taskRequests.filter((t) => !taskIds.has(String(t.id)));
        for (const task of stage.taskRequests) {
          if (Array.isArray(task.parameterRequests)) {
            task.parameterRequests = task.parameterRequests.filter((p) => !paramIds.has(String(p.id)));
          }
        }
      }
    }
  }
}

/** Generic deep null-out of id references inside automation/action detail blobs. */
function scrubDetailIds(
  node: any,
  del: { parameters: Set<string>; tasks: Set<string>; stages: Set<string> },
  onParamHit: () => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((n) => scrubDetailIds(n, del, onParamHit));
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const key of Object.keys(node)) {
    const val = node[key];
    if (typeof val === 'string' || typeof val === 'number') {
      const s = String(val);
      const lk = key.toLowerCase();
      if ((lk === 'parameterid' || lk === 'referencedparameterid') && del.parameters.has(s)) {
        node[key] = null;
        onParamHit();
      } else if ((lk === 'taskid' || lk === 'triggerentityid') && del.tasks.has(s)) {
        node[key] = null;
      } else if (lk === 'stageid' && del.stages.has(s)) {
        node[key] = null;
      }
    } else if (val && typeof val === 'object') {
      scrubDetailIds(val, del, onParamHit);
    }
  }
}

/** Replace Lexical @p mentions that point at deleted parameters with a text marker. */
function scrubLexicalMentions(
  node: any,
  deletedParams: Set<string>,
  onHit: () => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((n) => scrubLexicalMentions(n, deletedParams, onHit));
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node.children)) {
    node.children = node.children.map((child: any) => {
      if (
        child &&
        child.type === 'custom-beautifulMention' &&
        child.data?.entity === 'parameter' &&
        deletedParams.has(String(child.data?.id))
      ) {
        onHit();
        return {
          mode: 'normal',
          text: `[deleted: ${child.value ?? 'parameter'}]`,
          type: 'text',
          style: '',
          detail: 0,
          format: 0,
          version: 1,
        };
      }
      return child;
    });
    node.children.forEach((c: any) => scrubLexicalMentions(c, deletedParams, onHit));
  }

  for (const key of Object.keys(node)) {
    if (key === 'children') continue;
    const val = node[key];
    if (val && typeof val === 'object') scrubLexicalMentions(val, deletedParams, onHit);
  }
}

function cleanParameter(
  param: Parameter,
  loc: string,
  del: { parameters: Set<string>; tasks: Set<string>; stages: Set<string> },
  report: DeletionReport,
): void {
  // 1) rules.show.{parameters,tasks,stages} — drop entire rule if it references any deleted entity
  if (Array.isArray(param.rules)) {
    const keptRules: any[] = [];
    for (const rule of param.rules) {
      const show = (rule as any).show;
      const referencesDeleted =
        show &&
        ((Array.isArray(show.parameters) && show.parameters.some((id: string) => del.parameters.has(String(id)))) ||
         (Array.isArray(show.tasks) && show.tasks.some((id: string) => del.tasks.has(String(id)))) ||
         (Array.isArray(show.stages) && show.stages.some((id: string) => del.stages.has(String(id)))));
      if (referencesDeleted) {
        report.counts.rulesRemoved += 1;
        report.counts.references += 1;
        report.cleaned.push({
          kind: 'rule',
          location: loc,
          detail: `Removed branching rule referencing a deleted parameter`,
        });
      } else {
        keptRules.push(rule);
      }
    }
    param.rules = keptRules;
  }

  // 2) autoInitialize.parameterId
  if (param.autoInitialize && del.parameters.has(String(param.autoInitialize.parameterId))) {
    param.autoInitialize = null as any;
    report.counts.autoInit += 1;
    report.counts.references += 1;
    report.cleaned.push({ kind: 'autoInitialize', location: loc, detail: 'Cleared auto-initialize source' });
  }

  // 3) data.propertyFilters / data.propertyValidations — drop entire block if any field references a deleted param
  const data: any = param.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    (['propertyFilters', 'propertyValidations'] as const).forEach((blockKey) => {
      const block = data[blockKey];
      if (block && Array.isArray(block.fields)) {
        const hasDeletedRef = block.fields.some(
          (f: any) => referencesDeletedParam(f, del.parameters),
        );
        if (hasDeletedRef) {
          const count = block.fields.length;
          data[blockKey] = null;
          report.counts[blockKey === 'propertyFilters' ? 'filters' : 'validations'] += count;
          report.counts.references += count;
          report.cleaned.push({
            kind: blockKey === 'propertyFilters' ? 'filter' : 'validation',
            location: loc,
            detail: `Removed entire ${blockKey === 'propertyFilters' ? 'filter' : 'validation'} block (${count} condition(s))`,
          });
        }
      }
    });

    // 4) CALCULATION variables
    if (param.type === 'CALCULATION' && data.variables && typeof data.variables === 'object') {
      let removed = 0;
      for (const key of Object.keys(data.variables)) {
        const v = data.variables[key];
        if (del.parameters.has(String(v?.parameterId)) || del.tasks.has(String(v?.taskId))) {
          delete data.variables[key];
          removed += 1;
        }
      }
      if (removed > 0) {
        report.counts.calculations += removed;
        report.counts.references += removed;
        // Clear the expression — it likely references the removed variable name(s)
        // and would be invalid without them.
        data.expression = '';
        report.cleaned.push({
          kind: 'calculation',
          location: loc,
          detail: `Removed ${removed} calculation variable(s) and cleared expression (references deleted parameter)`,
        });
      }
    }
  }

  // 5) validations array (generic)
  if (Array.isArray(param.validations) && param.validations.length > 0) {
    const before = param.validations.length;
    param.validations = param.validations.filter(
      (v: any) => !referencesDeletedParam(v, del.parameters),
    );
    const removed = before - param.validations.length;
    if (removed > 0) {
      report.counts.validations += removed;
      report.counts.references += removed;
      report.cleaned.push({ kind: 'validation', location: loc, detail: `Removed ${removed} validation(s)` });
    }
  }
}

function referencesDeletedParam(node: any, deletedParams: Set<string>): boolean {
  if (Array.isArray(node)) return node.some((n) => referencesDeletedParam(n, deletedParams));
  if (!node || typeof node !== 'object') return false;
  for (const key of Object.keys(node)) {
    const val = node[key];
    const lk = key.toLowerCase();
    if (lk.includes('parameterid') && (typeof val === 'string' || typeof val === 'number') && deletedParams.has(String(val))) {
      return true;
    }
    if (val && typeof val === 'object' && referencesDeletedParam(val, deletedParams)) return true;
  }
  return false;
}

export function deleteEntities(
  config: ChecklistConfig[],
  selected: SelectedEntity[],
  options: DeletionOptions = DEFAULT_DELETION_OPTIONS,
): { modifiedConfig: ChecklistConfig[]; report: DeletionReport } {
  const modifiedConfig = deepClone(config);
  const del = collectDeletedIds(selected);

  const report: DeletionReport = {
    deletedEntities: del.entities,
    deletedParameterIds: [...del.parameters],
    deletedTaskIds: [...del.tasks],
    deletedStageIds: [...del.stages],
    cleaned: [],
    counts: {
      references: 0,
      automationsUnlinked: 0,
      automationsRemoved: 0,
      filters: 0,
      validations: 0,
      rulesRemoved: 0,
      autoInit: 0,
      calculations: 0,
      mentions: 0,
      taskRefs: 0,
    },
  };

  // 1) Scrub references from everything that REMAINS.
  for (const checklist of modifiedConfig) {
    // checklist-level parameters
    (checklist as any).parameterRequests?.forEach((p: Parameter) =>
      cleanParameter(p, `Checklist › ${paramLabel(p)}`, del, report),
    );

    checklist.stageRequests?.forEach((stage) => {
      if (del.stages.has(String(stage.id))) return; // will be removed anyway
      stage.taskRequests?.forEach((task) => {
        if (del.tasks.has(String(task.id))) return; // will be removed anyway
        const taskLoc = `${stage.name} › ${task.name}`;

        // Strip prerequisite / executor-lock references to any deleted task.
        if (del.tasks.size > 0) cleanTaskReferences(task, taskLoc, del.tasks, report);

        // Automations on this task
        if (Array.isArray(task.automationRequests)) {
          const keep: any[] = [];
          for (const auto of task.automationRequests) {
            let hits = 0;
            scrubDetailIds(auto.actionDetails, del, () => (hits += 1));
            scrubDetailIds(auto.triggerDetails, del, () => (hits += 1));
            if (hits > 0) {
              report.counts.references += hits;
              const stillRefs = referencesDeletedParam(auto.actionDetails, del.parameters);
              if (options.removeEmptiedAutomations && !hasAnyParameterLink(auto)) {
                report.counts.automationsRemoved += 1;
                report.cleaned.push({
                  kind: 'automation-removed',
                  location: taskLoc,
                  detail: `Removed automation "${auto.displayName || auto.actionType || auto.id}" (no parameters left)`,
                });
                continue; // drop it
              }
              report.counts.automationsUnlinked += 1;
              report.cleaned.push({
                kind: 'automation',
                location: taskLoc,
                detail: `Unlinked ${hits} parameter reference(s) in "${auto.displayName || auto.actionType || auto.id}"`,
              });
              void stillRefs;
            }
            keep.push(auto);
          }
          task.automationRequests = keep;
        }

        // Parameters on this task
        task.parameterRequests?.forEach((p) => {
          if (del.parameters.has(String(p.id))) return;
          cleanParameter(p, `${taskLoc} › ${paramLabel(p)}`, del, report);
        });
      });
    });

    // Actions / effects (lexical mentions)
    if (Array.isArray((checklist as any).actionRequests)) {
      (checklist as any).actionRequests.forEach((action: any) => {
        scrubLexicalMentions(action, del.parameters, () => {
          report.counts.mentions += 1;
          report.counts.references += 1;
        });
      });
      if (report.counts.mentions > 0) {
        report.cleaned.push({
          kind: 'mention',
          location: 'Checklist actions',
          detail: `Replaced ${report.counts.mentions} action/effect reference(s) to deleted parameters`,
        });
      }
    }
  }

  // 2) Now remove the selected entities themselves.
  removeSelected(modifiedConfig, selected);

  return { modifiedConfig, report };
}

/** Does the automation still link to ANY parameter after scrubbing? */
function hasAnyParameterLink(auto: any): boolean {
  let found = false;
  const walk = (n: any) => {
    if (found) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    for (const k of Object.keys(n)) {
      const lk = k.toLowerCase();
      if ((lk === 'parameterid' || lk === 'referencedparameterid') && n[k]) {
        found = true;
        return;
      }
      if (n[k] && typeof n[k] === 'object') walk(n[k]);
    }
  };
  walk(auto.actionDetails);
  walk(auto.triggerDetails);
  return found;
}
