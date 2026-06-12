import { useMemo, useEffect } from 'react';
import { AlertTriangle, Trash2, Link2Off } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { deleteEntities, DEFAULT_DELETION_OPTIONS } from '@/utils/deletionEngine';
import type { DeletionReport } from '@/utils/deletionEngine';
import type { ChecklistConfig, SelectedEntity } from '@/types';

interface Props {
  originalConfig: ChecklistConfig[];
  selectedEntities: SelectedEntity[];
  onComputed: (modified: ChecklistConfig[], report: DeletionReport) => void;
}

export default function Step3DeleteReview({ originalConfig, selectedEntities, onComputed }: Props) {
  const { modifiedConfig, report } = useMemo(
    () => deleteEntities(originalConfig, selectedEntities, DEFAULT_DELETION_OPTIONS),
    [originalConfig, selectedEntities],
  );

  // Push the computed result up to context whenever it changes.
  useEffect(() => {
    onComputed(modifiedConfig, report);
  }, [modifiedConfig, report, onComputed]);

  const c = report.counts;

  return (
    <div className="space-y-6">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Deletion is permanent in the output</AlertTitle>
        <AlertDescription>
          The selected items will be removed and all references to them are cleaned up first.
          Review the cascade below before continuing. Your original file is never modified.
        </AlertDescription>
      </Alert>

      {/* What will be deleted */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            To be deleted ({report.deletedEntities.length})
          </CardTitle>
          <CardDescription>
            {report.deletedParameterIds.length} parameter(s), {report.deletedTaskIds.length} task(s),{' '}
            {report.deletedStageIds.length} stage(s) — including nested children.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {report.deletedEntities.map((e) => (
              <Badge key={e.id} variant="outline" className="gap-1">
                <span className="uppercase text-[10px] text-muted-foreground">{e.type}</span>
                {e.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cascade summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2Off className="h-5 w-5" />
            References that will be cleaned ({c.references})
          </CardTitle>
          <CardDescription>
            Every place that points at a deleted parameter is unlinked or removed first, so the
            export stays valid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Automations unlinked', c.automationsUnlinked],
              ['Automations removed', c.automationsRemoved],
              ['Filters', c.filters],
              ['Validations', c.validations],
              ['Branching rules removed', c.rulesRemoved],
              ['Auto-initialize', c.autoInit],
              ['Calculations', c.calculations],
              ['Task references', c.taskRefs],
              ['Action mentions', c.mentions],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{n as number}</div>
                <div className="text-xs text-muted-foreground">{label as string}</div>
              </div>
            ))}
          </div>

          {report.cleaned.length > 0 ? (
            <>
              <Separator />
              <Label className="text-sm">Details</Label>
              <ScrollArea className="h-48 rounded-md border p-3">
                <div className="space-y-2">
                  {report.cleaned.map((item, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{item.detail}</span>
                      <span className="text-muted-foreground"> — {item.location}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            <Alert>
              <AlertDescription>
                No external references found — the selected item(s) can be removed cleanly.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
