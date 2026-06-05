import Step1Upload from './steps/Step1Upload'
import Step2Select from './steps/Step2Select'
import Step3DeleteReview from './steps/Step3DeleteReview'
import Step4DeletePreview from './steps/Step4DeletePreview'
import Step5Execute from './steps/Step5Execute'
import { Button } from './components/ui/button'
import { ThemeToggle } from './components/ThemeToggle'
import { useAppContext } from './contexts/AppContext'

const STEP_LABELS = ['Upload', 'Select', 'Review', 'Confirm', 'Download'] as const;
const STEP_HEADINGS = [
  'Upload Configuration',
  'Select Entities to Delete',
  'Review Deletion & References',
  'Confirm Changes',
  'Download Result',
] as const;

function App() {
  const {
    currentStep,
    parsedConfig,
    selectedEntities,
    modifiedConfig,
    deletionReport,
    nextStep,
    previousStep,
    canProceed,
    setJsonLoaded,
    toggleEntitySelection,
    clearSelection,
    setModifiedConfig,
    setDeletionReport,
    startOver,
    deleteMore,
  } = useAppContext();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        role="banner"
        className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive text-destructive-foreground font-bold">
              ✕
            </div>
            <div className="leading-tight">
              <div className="text-lg font-bold">MES Deletion Tool</div>
              <div className="hidden text-xs text-muted-foreground sm:block">
                Remove stages, tasks &amp; parameters · clean all references · import-ready output
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto max-w-5xl p-4">
        <div className="bg-card rounded-lg shadow-lg p-6" role="main">
          {/* Progress indicator */}
          <nav aria-label="Progress" className="mb-8">
            <div className="flex items-center justify-between">
              {STEP_LABELS.map((_label, idx) => {
                const step = idx + 1;
                const isLast = step === STEP_LABELS.length;
                return (
                  <div key={step} className={`flex items-center ${!isLast ? 'flex-1' : ''}`}>
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                        step <= currentStep
                          ? 'border-destructive bg-destructive text-destructive-foreground'
                          : 'border-muted-foreground text-muted-foreground'
                      }`}
                      aria-current={step === currentStep ? 'step' : undefined}
                    >
                      {step}
                    </div>
                    {!isLast && (
                      <div className={`flex-1 h-0.5 mx-2 ${step < currentStep ? 'bg-destructive' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2">
              {STEP_LABELS.map((label, idx) => (
                <span
                  key={label}
                  className={`text-xs ${
                    idx + 1 === currentStep ? 'font-semibold text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </nav>

          {/* Main content area */}
          <div className="min-h-[400px]" role="region" aria-label="Step content">
            <h2 className="text-xl font-semibold mb-6" id="step-heading">
              Step {currentStep}: {STEP_HEADINGS[currentStep - 1]}
            </h2>

            {currentStep === 1 && (
              <Step1Upload onJsonLoaded={setJsonLoaded} />
            )}

            {currentStep === 2 && parsedConfig && (
              <Step2Select
                config={parsedConfig}
                selectedEntities={selectedEntities}
                onToggleEntity={toggleEntitySelection}
                onClearSelection={clearSelection}
              />
            )}

            {currentStep === 3 && selectedEntities.length > 0 && parsedConfig && (
              <Step3DeleteReview
                originalConfig={parsedConfig}
                selectedEntities={selectedEntities}
                onComputed={(modified, report) => {
                  setModifiedConfig(modified);
                  setDeletionReport(report);
                }}
              />
            )}

            {currentStep === 4 && parsedConfig && modifiedConfig && (
              <Step4DeletePreview
                originalConfig={parsedConfig}
                modifiedConfig={modifiedConfig}
                report={deletionReport}
              />
            )}

            {currentStep === 5 && parsedConfig && modifiedConfig && selectedEntities.length > 0 && (
              <Step5Execute
                originalConfig={parsedConfig}
                modifiedConfig={modifiedConfig}
                selectedEntities={selectedEntities}
                onStartOver={startOver}
                onDeleteMore={deleteMore}
              />
            )}
          </div>

          {/* Navigation buttons */}
          <nav aria-label="Step navigation" className="flex justify-between mt-8">
            <Button
              onClick={previousStep}
              disabled={currentStep === 1}
              variant="outline"
            >
              ← Back
            </Button>
            <Button
              onClick={nextStep}
              disabled={currentStep >= STEP_LABELS.length || !canProceed()}
              variant={currentStep === STEP_LABELS.length ? 'outline' : 'default'}
            >
              Next →
            </Button>
          </nav>
        </div>
      </div>
    </div>
  );
}

export default App;
