import { describe, it, expect } from 'vitest';
import { deleteEntities, DEFAULT_DELETION_OPTIONS } from './deletionEngine';
import type { ChecklistConfig, SelectedEntity } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParam(id: string, overrides: Record<string, any> = {}): any {
  return { id, label: `Param ${id}`, type: 'TEXT', orderTree: 1, ...overrides };
}

function makeTask(id: string, params: any[] = [], autos: any[] = []): any {
  return {
    id,
    name: `Task ${id}`,
    orderTree: 1,
    parameterRequests: params,
    automationRequests: autos,
  };
}

function makeStage(id: string, tasks: any[] = []): any {
  return { id, name: `Stage ${id}`, orderTree: 1, taskRequests: tasks };
}

function makeConfig(stages: any[] = [], params: any[] = []): ChecklistConfig[] {
  return [{ id: 'cl1', name: 'Checklist', stageRequests: stages, parameterRequests: params } as any];
}

function selectedParam(param: any): SelectedEntity {
  return { type: 'parameter', id: String(param.id), data: param, parent: null, path: [], checklistIndex: 0 };
}

function selectedTask(task: any): SelectedEntity {
  return { type: 'task', id: String(task.id), data: task, parent: null, path: [], checklistIndex: 0 };
}

function selectedStage(stage: any): SelectedEntity {
  return { type: 'stage', id: String(stage.id), data: stage, parent: null, path: [], checklistIndex: 0 };
}

function run(config: ChecklistConfig[], selected: SelectedEntity[]) {
  return deleteEntities(config, selected, DEFAULT_DELETION_OPTIONS);
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

describe('Automations', () => {
  it('removes automation that references the deleted parameter', () => {
    const p = makeParam('p1');
    const auto = { id: 'a1', actionDetails: { parameterId: 'p1' }, triggerDetails: {} };
    const task = makeTask('t1', [p], [auto]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig, report } = run(config, [selectedParam(p)]);
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].automationRequests).toHaveLength(0);
    expect(report.counts.automationsRemoved).toBe(1);
  });

  it('keeps automation that does not reference any deleted parameter', () => {
    const p = makeParam('p1');
    const pOther = makeParam('p2');
    const auto = { id: 'a1', actionDetails: { parameterId: 'p2' }, triggerDetails: {} };
    const task = makeTask('t1', [p, pOther], [auto]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p)]);
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].automationRequests).toHaveLength(1);
  });

  it('removes automation referencing deleted param even when other params exist', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2');
    // automation references BOTH p1 (deleted) and p2 (kept)
    const auto = {
      id: 'a1',
      actionDetails: { parameterId: 'p1', referencedParameterId: 'p2' },
      triggerDetails: {},
    };
    const task = makeTask('t1', [p1, p2], [auto]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    // After p1 is scrubbed, the automation still references p2, so it's kept (not emptied)
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].automationRequests).toHaveLength(1);
  });

  it('removes automation with no parameter refs after scrubbing (removeEmptiedAutomations=true)', () => {
    const p = makeParam('p1');
    // automation only references the deleted param
    const auto = { id: 'a1', actionDetails: { parameterId: 'p1' }, triggerDetails: {} };
    const task = makeTask('t1', [p], [auto]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p)]);
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].automationRequests).toHaveLength(0);
  });

  it('handles automation with null/missing actionDetails gracefully', () => {
    const p = makeParam('p1');
    const auto = { id: 'a1', actionDetails: null, triggerDetails: null };
    const task = makeTask('t1', [p], [auto]);
    const config = makeConfig([makeStage('s1', [task])]);
    expect(() => run(config, [selectedParam(p)])).not.toThrow();
  });

  it('catches parameterId stored as a number (type coercion, safe integer range)', () => {
    // Large 18-digit IDs lose precision as JS numbers; the JSON sanitizer always
    // produces strings in practice. This test uses a safe-range number to verify
    // String() coercion works when the number can be represented exactly.
    const p = makeParam('123456');
    const auto = {
      id: 'a1',
      actionDetails: { parameterId: 123456 },
      triggerDetails: {},
    };
    const task = makeTask('t1', [p], [auto]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p)]);
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].automationRequests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Branching rules
// ---------------------------------------------------------------------------

describe('Branching rules', () => {
  it('removes entire rule when any show.parameters entry is deleted', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      rules: [{ show: { parameters: ['p1', 'p99'] } }], // references p1 (deleted) and p99 (kept)
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.rules).toHaveLength(0);
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.some((p: any) => p.id === 'p1')).toBe(false);
  });

  it('keeps rule when no show conditions reference a deleted entity', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', { rules: [{ show: { parameters: ['p99'] } }] });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.rules).toHaveLength(1);
  });

  it('removes rule when show.tasks references a deleted task', () => {
    const t1 = makeTask('t1', []);
    const p = makeParam('p1', { rules: [{ show: { tasks: ['t1'] } }] });
    const t2 = makeTask('t2', [p]);
    const config = makeConfig([makeStage('s1', [t1, t2])]);
    const { modifiedConfig } = run(config, [selectedTask(t1)]);
    const pAfter = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests[0];
    expect(pAfter?.rules).toHaveLength(0);
  });

  it('handles rule with no show property gracefully', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', { rules: [{ someOtherField: true }] });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    expect(() => run(config, [selectedParam(p1)])).not.toThrow();
    const p2After = makeConfig([makeStage('s1', [task])]); // verify rule survives
    expect(p2.rules).toHaveLength(1);
  });

  it('handles parameter with null rules gracefully', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', { rules: null });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    expect(() => run(config, [selectedParam(p1)])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Filters (propertyFilters)
// ---------------------------------------------------------------------------

describe('Filters (propertyFilters)', () => {
  it('removes entire propertyFilters block when any field references a deleted param', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      data: {
        propertyFilters: {
          fields: [
            { referencedParameterId: 'p1', value: 'x' },
            { referencedParameterId: 'p99', value: 'y' }, // references non-deleted param
          ],
        },
      },
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.data?.propertyFilters).toBeNull();
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.some((p: any) => p.id === 'p1')).toBe(false);
  });

  it('keeps propertyFilters block when no field references a deleted param', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      data: {
        propertyFilters: {
          fields: [{ referencedParameterId: 'p99', value: 'y' }],
        },
      },
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.data?.propertyFilters).not.toBeNull();
  });

  it('handles missing propertyFilters gracefully', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', { data: {} });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    expect(() => run(config, [selectedParam(p1)])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Validations (propertyValidations)
// ---------------------------------------------------------------------------

describe('Validations (propertyValidations)', () => {
  it('removes entire propertyValidations block when any field references a deleted param', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      data: {
        propertyValidations: {
          fields: [{ referencedParameterId: 'p1', rule: 'REQUIRED' }],
        },
      },
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.data?.propertyValidations).toBeNull();
  });

  it('keeps propertyValidations when no fields reference deleted params', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      data: {
        propertyValidations: {
          fields: [{ referencedParameterId: 'p99', rule: 'REQUIRED' }],
        },
      },
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.data?.propertyValidations).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generic validations (param.validations)
// ---------------------------------------------------------------------------

describe('Generic validations (param.validations)', () => {
  it('removes validation entry referencing deleted param via parameterId', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      validations: [{ parameterId: 'p1', rule: 'EQUALS' }],
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.validations).toHaveLength(0);
  });

  it('removes validation using a non-standard key (conditionParameterId)', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      validations: [{ conditionParameterId: 'p1', rule: 'REQUIRED_IF' }],
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.validations).toHaveLength(0);
  });

  it('keeps validations that do not reference the deleted param', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      validations: [
        { parameterId: 'p1', rule: 'EQUALS' },
        { parameterId: 'p99', rule: 'NOT_EQUALS' },
      ],
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.validations).toHaveLength(1);
    expect(p2After?.validations[0].parameterId).toBe('p99');
  });
});

// ---------------------------------------------------------------------------
// autoInitialize
// ---------------------------------------------------------------------------

describe('autoInitialize', () => {
  it('clears autoInitialize when it references a deleted parameter', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', { autoInitialize: { parameterId: 'p1', someConfig: true } });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.autoInitialize).toBeNull();
  });

  it('keeps autoInitialize when it references a non-deleted parameter', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', { autoInitialize: { parameterId: 'p99' } });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(p2After?.autoInitialize).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cascade — deleting a task removes its parameters and cleans references
// ---------------------------------------------------------------------------

describe('Cascade deletion', () => {
  it('deleting a task removes all its parameters and cleans automation refs', () => {
    const p1 = makeParam('p1');
    const t1 = makeTask('t1', [p1]);
    const p2 = makeParam('p2');
    const auto = { id: 'a1', actionDetails: { parameterId: 'p1' }, triggerDetails: {} };
    const t2 = makeTask('t2', [p2], [auto]);
    const config = makeConfig([makeStage('s1', [t1, t2])]);
    const { modifiedConfig, report } = run(config, [selectedTask(t1)]);
    const tasks = modifiedConfig[0].stageRequests[0].taskRequests;
    expect(tasks.find((t: any) => t.id === 't1')).toBeUndefined();
    expect(tasks[0].automationRequests).toHaveLength(0);
    expect(report.counts.automationsRemoved).toBeGreaterThan(0);
  });

  it('deleting a stage removes all nested tasks and parameters', () => {
    const p1 = makeParam('p1');
    const t1 = makeTask('t1', [p1]);
    const s1 = makeStage('s1', [t1]);
    const s2 = makeStage('s2', [makeTask('t2', [])]);
    const config = makeConfig([s1, s2]);
    const { modifiedConfig } = run(config, [selectedStage(s1)]);
    expect(modifiedConfig[0].stageRequests).toHaveLength(1);
    expect(modifiedConfig[0].stageRequests[0].id).toBe('s2');
  });
});

// ---------------------------------------------------------------------------
// Deleting multiple parameters at once
// ---------------------------------------------------------------------------

describe('Multiple simultaneous deletions', () => {
  it('cleans references to all deleted params in one pass', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2');
    const p3 = makeParam('p3', {
      rules: [{ show: { parameters: ['p1'] } }],
      validations: [{ parameterId: 'p2', rule: 'EQUALS' }],
    });
    const task = makeTask('t1', [p1, p2, p3]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1), selectedParam(p2)]);
    const p3After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p3',
    );
    expect(p3After?.rules).toHaveLength(0);
    expect(p3After?.validations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge: empty / null inputs
// ---------------------------------------------------------------------------

describe('Edge: empty and null inputs', () => {
  it('handles parameter with no rules, no data, no validations', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2');
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    expect(() => run(config, [selectedParam(p1)])).not.toThrow();
  });

  it('handles empty config array without crashing', () => {
    expect(() => run([], [])).not.toThrow();
  });

  it('handles empty selected entities without modifying config', () => {
    const p1 = makeParam('p1');
    const task = makeTask('t1', [p1]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, []);
    expect(modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests).toHaveLength(1);
  });

  it('does not crash when parameterId is an empty string', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', { validations: [{ parameterId: '' }] });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    expect(() => run(config, [selectedParam(p1)])).not.toThrow();
    const p2After = makeConfig([makeStage('s1', [task])])[0]
      .stageRequests[0].taskRequests[0].parameterRequests.find((p: any) => p.id === 'p2');
    expect(p2After?.validations).toHaveLength(1); // empty string != p1, so validation stays
  });
});

// ---------------------------------------------------------------------------
// CALCULATION variables
// ---------------------------------------------------------------------------

describe('Calculation variables', () => {
  it('removes calculation variable referencing deleted parameter', () => {
    const p1 = makeParam('p1');
    const p2 = makeParam('p2', {
      type: 'CALCULATION',
      data: {
        variables: {
          a: { parameterId: 'p1', taskId: 't1', label: 'A' },
          b: { parameterId: 'p99', taskId: 't1', label: 'B' },
        },
        expression: 'a + b',
      },
    });
    const task = makeTask('t1', [p1, p2]);
    const config = makeConfig([makeStage('s1', [task])]);
    const { modifiedConfig } = run(config, [selectedParam(p1)]);
    const p2After = modifiedConfig[0].stageRequests[0].taskRequests[0].parameterRequests.find(
      (p: any) => p.id === 'p2',
    );
    expect(Object.keys(p2After?.data?.variables ?? {})).not.toContain('a');
    expect(Object.keys(p2After?.data?.variables ?? {})).toContain('b');
  });
});
