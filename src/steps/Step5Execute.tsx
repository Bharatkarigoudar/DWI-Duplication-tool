import { useState, useEffect } from 'react';
import { Download, CheckCircle2, FileJson, RefreshCw, Repeat, Copy, Check, FileCode2, FileArchive, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { downloadFile, formatFileSize, formatDateTime, countEntities } from '@/utils/helpers';
import { serializeConfig } from '@/utils/jsonSanitizer';
import { generateNewId } from '@/utils/idGeneration';
import type { ChecklistConfig, SelectedEntity } from '@/types';

interface Step5ExecuteProps {
  originalConfig: ChecklistConfig[];
  modifiedConfig: ChecklistConfig[];
  selectedEntities: SelectedEntity[];
  onStartOver: () => void;
  onDeleteMore: () => void;
}

export default function Step5Execute({
  originalConfig,
  modifiedConfig,
  selectedEntities,
  onStartOver,
  onDeleteMore,
}: Step5ExecuteProps) {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [downloadedFileName, setDownloadedFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) { clearInterval(interval); setIsComplete(true); return 100; }
        return prev + 10;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const checklistId =
    modifiedConfig[0] && (modifiedConfig[0] as any).id
      ? String((modifiedConfig[0] as any).id)
      : String(Date.now());

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    const fileName = `${checklistId}.json`;
    downloadFile(serializeConfig(modifiedConfig), fileName, 'application/json');
    setDownloadedFileName(fileName);
  };

  const handleDownloadZip = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(`${generateNewId()}.json`, serializeConfig(modifiedConfig));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const fileName = `${checklistId}.zip`;
    triggerBlobDownload(blob, fileName);
    setDownloadedFileName(fileName);
  };

  const handleDownloadPretty = () => {
    downloadFile(serializeConfig(modifiedConfig, true), `configuration_DELETED_${Date.now()}_formatted.json`, 'application/json');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serializeConfig(modifiedConfig));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const originalCounts = countEntities(originalConfig);
  const modifiedCounts = countEntities(modifiedConfig);

  const removed = {
    tasks: originalCounts.tasks - modifiedCounts.tasks,
    parameters: originalCounts.parameters - modifiedCounts.parameters,
    automations: originalCounts.automations - modifiedCounts.automations,
    rules: originalCounts.rules - modifiedCounts.rules,
  };

  const totalRemoved = removed.tasks + removed.parameters + removed.automations + removed.rules;
  const firstEntity = selectedEntities[0];
  const entityName = !firstEntity ? 'configuration'
    : firstEntity.type === 'stage' ? (firstEntity.data as any).name
    : firstEntity.type === 'task' ? (firstEntity.data as any).name
    : (firstEntity.data as any).label || 'Entity';

  const modifiedJsonSize = new Blob([serializeConfig(modifiedConfig)]).size;

  return (
    <div className="space-y-6">
      {!isComplete && (
        <Card>
          <CardHeader>
            <CardTitle>Applying Deletion...</CardTitle>
            <CardDescription>
              Removing "{entityName}"{selectedEntities.length > 1 ? ` and ${selectedEntities.length - 1} more` : ''} and cleaning all references
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress</span><span>{progress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isComplete && (
        <>
          <Card className="border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/40">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-600">
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-green-900 dark:text-green-200">Deletion Successful!</CardTitle>
                  <CardDescription className="text-green-700 dark:text-green-400">
                    Removed {selectedEntities.length} item(s) and cleaned all references
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Separator className="bg-green-200 dark:bg-green-900" />
              <div className="text-sm font-medium text-green-900 dark:text-green-200 mb-3">Entities removed:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Tasks', removed.tasks],
                  ['Parameters', removed.parameters],
                  ['Automations', removed.automations],
                  ['Rules', removed.rules],
                ].map(([label, n]) => (
                  <div key={label as string} className="bg-card rounded-lg p-3 text-center border border-green-200 dark:border-green-900">
                    <div className="text-2xl font-bold text-destructive">{n as number}</div>
                    <div className="text-xs text-green-700 dark:text-green-400">{label as string}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between bg-card rounded-lg p-3 border border-green-200 dark:border-green-900">
                <span className="text-sm font-medium text-green-900 dark:text-green-200">Total Removed:</span>
                <Badge className="bg-destructive text-white text-base px-3 py-1">{totalRemoved}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Modified Configuration Ready
              </CardTitle>
              <CardDescription>Download your cleaned, import-ready configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <FileArchive className="h-8 w-8 text-primary" />
                  <div>
                    <div className="font-semibold">{checklistId}.zip</div>
                    <div className="text-sm text-muted-foreground">
                      contains 1 minified .json • {formatFileSize(modifiedJsonSize)} uncompressed • {formatDateTime(Date.now())}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="hidden sm:inline-flex">Import-ready</Badge>
              </div>

              <Button onClick={handleDownloadZip} size="lg" className="w-full">
                <FileArchive className="mr-2 h-5 w-5" />
                Download as ZIP (import-ready)
              </Button>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button onClick={handleDownload} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  JSON (minified)
                </Button>
                <Button onClick={handleCopy} variant="outline">
                  {copied ? <><Check className="mr-2 h-4 w-4 text-green-600" /> Copied!</> : <><Copy className="mr-2 h-4 w-4" /> Copy JSON</>}
                </Button>
                <Button onClick={handleDownloadPretty} variant="outline">
                  <FileCode2 className="mr-2 h-4 w-4" />
                  Formatted
                </Button>
              </div>

              <Alert>
                <FileArchive className="h-4 w-4" />
                <AlertTitle>How to import</AlertTitle>
                <AlertDescription className="text-sm">
                  Upload the <strong>.zip</strong> to the MES platform. The plain <strong>JSON (minified)</strong> also imports where a raw file is accepted. The <strong>Formatted</strong> download is for human review only.
                </AlertDescription>
              </Alert>

              {downloadedFileName && (
                <Alert className="border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/40">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-900 dark:text-green-200">Downloaded</AlertTitle>
                  <AlertDescription className="text-green-800 dark:text-green-300">
                    <div className="font-medium">{downloadedFileName}</div>
                    <div className="text-sm mt-1">Saved to your downloads folder.</div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What's Next?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={onDeleteMore} variant="outline" size="lg" className="w-full">
                <Trash2 className="mr-2 h-5 w-5" />
                Delete More Entities
              </Button>
              <Button onClick={onStartOver} variant="outline" size="lg" className="w-full">
                <RefreshCw className="mr-2 h-5 w-5" />
                Start Over with New Configuration
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
