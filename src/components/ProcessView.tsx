import { useState } from 'react';
import { ChevronRight, ChevronDown, Layers, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ChecklistConfig } from '@/types';

/**
 * Read-only, collapsible, human-readable view of a full process
 * (Checklist → Stage → Task → Parameter), mirroring the platform layout.
 */
export default function ProcessView({ config }: { config: ChecklistConfig[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="space-y-3">
      {config.map((checklist, ci) => (
        <div key={ci} className="space-y-2">
          <div className="text-sm font-semibold">{checklist.name?.trim() || 'Checklist'}</div>
          {(checklist.stageRequests || []).map((stage: any, si: number) => {
            const sKey = `c${ci}s${si}`;
            const sOpen = open.has(sKey);
            return (
              <div key={stage.id || si} className="rounded-md border">
                <button
                  onClick={() => toggle(sKey)}
                  className="flex w-full items-center gap-2 p-2 text-left hover:bg-accent"
                >
                  {sOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Layers className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">Stage {si + 1}</span>
                  <span className="font-medium">{stage.name}</span>
                  <Badge variant="secondary" className="ml-auto">{(stage.taskRequests || []).length} tasks</Badge>
                </button>

                {sOpen && (
                  <div className="space-y-2 border-t p-2">
                    {(stage.taskRequests || []).map((task: any, ti: number) => {
                      const tKey = `${sKey}t${ti}`;
                      const tOpen = open.has(tKey);
                      return (
                        <div key={task.id || ti} className="rounded-md bg-muted/30">
                          <button
                            onClick={() => toggle(tKey)}
                            className="flex w-full items-center gap-2 p-2 text-left hover:bg-accent"
                          >
                            {tOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <ListChecks className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="text-xs text-muted-foreground">Task {si + 1}.{ti + 1}</span>
                            <span>{task.name}</span>
                            <Badge variant="outline" className="ml-auto">
                              {(task.parameterRequests || []).length} params
                            </Badge>
                          </button>

                          {tOpen && (
                            <ul className="space-y-2 border-t p-3">
                              {(task.parameterRequests || []).map((p: any, pi: number) => (
                                <li key={p.id || pi} className="text-sm">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{p.label || `Parameter ${pi + 1}`}</span>
                                    <Badge variant="secondary" className="text-[10px]">{p.type}</Badge>
                                    {p.mandatory && <Badge variant="outline" className="text-[10px]">mandatory</Badge>}
                                    {p.hidden && <Badge variant="outline" className="text-[10px]">hidden</Badge>}
                                  </div>
                                  {Array.isArray(p.data) && p.data.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1 pl-2">
                                      {p.data.map((o: any, oi: number) => (
                                        <span
                                          key={o.id || oi}
                                          className="rounded bg-background border px-2 py-0.5 text-xs"
                                        >
                                          {o.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
