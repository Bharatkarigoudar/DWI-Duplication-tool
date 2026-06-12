import { useState } from 'react';
import { CheckCircle2, ArrowRight, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import ProcessView from '@/components/ProcessView';
import { countEntities } from '@/utils/helpers';
import type { DeletionReport } from '@/utils/deletionEngine';
import type { ChecklistConfig } from '@/types';

interface Props {
  originalConfig: ChecklistConfig[];
  modifiedConfig: ChecklistConfig[];
  report: DeletionReport | null;
}

export default function Step4DeletePreview({ originalConfig, modifiedConfig, report }: Props) {
  const before = countEntities(originalConfig);
  const after = countEntities(modifiedConfig);
  const [showPreview, setShowPreview] = useState(false);

  const rows: Array<[string, number, number]> = [
    ['Stages', before.stages, after.stages],
    ['Tasks', before.tasks, after.tasks],
    ['Parameters', before.parameters, after.parameters],
    ['Automations', before.automations, after.automations],
    ['Branching Rules', before.rules, after.rules],
  ];

  return (
    <div className="space-y-6">
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Ready to apply</AlertTitle>
        <AlertDescription>
          Review the before/after totals. Continue to download the cleaned, import-ready file.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Before → After</CardTitle>
          <CardDescription>Net change once the deletion is applied.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rows.map(([label, b, a]) => (
              <div key={label} className="flex items-center justify-between rounded-md border p-3">
                <span className="font-medium">{label}</span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{b}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{a}</span>
                  {b !== a && (
                    <span className="text-destructive font-medium">(-{b - a})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Cleanup applied</CardTitle>
            <CardDescription>
              {report.counts.references} reference(s) cleaned across automations, filters, rules and more.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {report.counts.automationsUnlinked} automation(s) unlinked
            {report.counts.automationsRemoved > 0 && `, ${report.counts.automationsRemoved} removed`}
            , {report.counts.filters} filter condition(s), {report.counts.rulesRemoved} branching rule(s) removed,
            {' '}{report.counts.validations} validation(s), {report.counts.calculations} calculation
            variable(s), {report.counts.taskRefs} task prerequisite/executor reference(s) and{' '}
            {report.counts.autoInit} auto-initialize link(s) handled.
          </CardContent>
        </Card>
      )}

      {/* Full-process preview of the RESULT */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview full process (result)
            </span>
            <Button variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide' : 'Show'}
            </Button>
          </CardTitle>
          <CardDescription>The remaining checklist after deletion, in a readable layout.</CardDescription>
        </CardHeader>
        {showPreview && (
          <CardContent>
            <ProcessView config={modifiedConfig} />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
