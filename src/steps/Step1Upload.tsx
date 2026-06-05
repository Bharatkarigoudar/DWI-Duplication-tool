import { useState, useCallback } from 'react';
import { Upload, FileJson, AlertCircle, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  validateJsonFormat,
  validateRequiredFields,
  validateStructure,
} from '@/utils/validation';
import { formatJson, recentFilesStorage, formatFileSize, getTimeAgo } from '@/utils/helpers';
import { MAX_FILE_SIZE_BYTES } from '@/utils/constants';
import type { ChecklistConfig, RecentFile } from '@/types';

interface Step1UploadProps {
  onJsonLoaded: (json: string, parsed: ChecklistConfig[]) => void;
}

export default function Step1Upload({ onJsonLoaded }: Step1UploadProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(recentFilesStorage.get());

  const validateAndLoad = useCallback((content: string) => {
    setError(null);
    setSuccess(false);

    const formatValidation = validateJsonFormat(content);
    if (!formatValidation.valid) {
      setError(formatValidation.error!.message);
      return;
    }

    const parsed = formatValidation.parsed;

    const fieldsValidation = validateRequiredFields(parsed);
    if (!fieldsValidation.valid) {
      setError(fieldsValidation.errors.map(e => e.message).join(', '));
      return;
    }

    const structureValidation = validateStructure(parsed);
    if (!structureValidation.valid) {
      setError(structureValidation.errors.map(e => e.message).join(', '));
      return;
    }

    setSuccess(true);
    onJsonLoaded(content, parsed);
  }, [onJsonLoaded]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
      return;
    }

    const lower = file.name.toLowerCase();
    const isZip = lower.endsWith('.zip');
    const isJson = lower.endsWith('.json');
    if (!isZip && !isJson) {
      setError('Please upload a .json or .zip file');
      return;
    }

    try {
      let content: string;
      if (isZip) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const entry = Object.values(zip.files).find(
          (f) => !f.dir && f.name.toLowerCase().endsWith('.json') && !f.name.startsWith('__MACOSX'),
        );
        if (!entry) {
          setError('No .json file was found inside the zip archive.');
          return;
        }
        content = await entry.async('string');
      } else {
        content = await file.text();
      }

      setJsonInput(content);
      validateAndLoad(content);

      const recentFile: RecentFile = {
        name: file.name,
        content,
        timestamp: Date.now(),
        size: file.size,
      };
      recentFilesStorage.add(recentFile);
      setRecentFiles(recentFilesStorage.get());
    } catch (err) {
      setError('Failed to read file: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [validateAndLoad]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  }, [handleFileUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFileUpload(e.target.files[0]);
  }, [handleFileUpload]);

  return (
    <div className="space-y-6">
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            MES Deletion Tool
          </CardTitle>
          <CardDescription>
            Upload your MES configuration. You'll then select entities to delete — all references
            (automations, filters, rules, calculations, task prerequisites) are automatically
            cleaned up before removal.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload File</TabsTrigger>
          <TabsTrigger value="paste">Paste JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Configuration (JSON or ZIP)</CardTitle>
              <CardDescription>
                Drop a <strong>.json</strong> file or a <strong>.zip</strong> export from the MES platform.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  dragActive
                    ? 'border-destructive bg-destructive/5'
                    : 'border-muted-foreground/25 hover:border-destructive/50'
                }`}
              >
                <input
                  type="file"
                  accept=".json,.zip"
                  onChange={handleFileInput}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Click to upload</span> or drag and drop
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">.json</span> or{' '}
                    <span className="font-medium text-foreground">.zip</span> — up to 50MB
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paste" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Paste JSON Configuration</CardTitle>
              <CardDescription>Paste your MES configuration JSON directly</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste your JSON here..."
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button onClick={() => setJsonInput(formatJson(jsonInput))} variant="outline" size="sm">
                  Format JSON
                </Button>
                <Button onClick={() => jsonInput.trim() && validateAndLoad(jsonInput)} size="sm">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Validate
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Validation Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Configuration Loaded Successfully</AlertTitle>
          <AlertDescription>
            Your JSON has been validated. Click "Next" to select entities to delete.
          </AlertDescription>
        </Alert>
      )}

      {recentFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Files
            </CardTitle>
            <CardDescription>Quickly reload recently uploaded files</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[120px]">
              <div className="space-y-2">
                {recentFiles.map((file, idx) => (
                  <div key={idx}>
                    <button
                      onClick={() => { setJsonInput(file.content); validateAndLoad(file.content); }}
                      className="w-full flex items-start gap-3 p-3 rounded-md hover:bg-accent text-left transition-colors"
                    >
                      <FileJson className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{file.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)} • {getTimeAgo(file.timestamp)}
                        </div>
                      </div>
                    </button>
                    {idx < recentFiles.length - 1 && <Separator className="mt-2" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
