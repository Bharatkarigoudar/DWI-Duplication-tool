import { createContext, useContext, useState, ReactNode } from 'react';
import type { ChecklistConfig, SelectedEntity } from '@/types';
import type { DeletionReport } from '@/utils/deletionEngine';

export type AppMode = 'delete';

interface AppState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  mode: AppMode;
  inputJson: string | null;
  parsedConfig: ChecklistConfig[] | null;
  selectedEntities: SelectedEntity[];
  modifiedConfig: ChecklistConfig[] | null;
  deletionReport: DeletionReport | null;
}

interface AppActions {
  goToStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  nextStep: () => void;
  previousStep: () => void;
  canProceed: () => boolean;
  setJsonLoaded: (json: string, parsed: ChecklistConfig[]) => void;
  setDeletionReport: (report: DeletionReport | null) => void;
  toggleEntitySelection: (entity: SelectedEntity) => void;
  clearSelection: () => void;
  startOver: () => void;
  deleteMore: () => void;
  setInputJson: (json: string | null) => void;
  setParsedConfig: (config: ChecklistConfig[] | null) => void;
  setSelectedEntities: (entities: SelectedEntity[]) => void;
  setModifiedConfig: (config: ChecklistConfig[] | null) => void;
}

type AppContextType = AppState & AppActions;

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const mode: AppMode = 'delete';
  const [inputJson, setInputJson] = useState<string | null>(null);
  const [parsedConfig, setParsedConfig] = useState<ChecklistConfig[] | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<SelectedEntity[]>([]);
  const [modifiedConfig, setModifiedConfig] = useState<ChecklistConfig[] | null>(null);
  const [deletionReport, setDeletionReport] = useState<DeletionReport | null>(null);

  const goToStep = (step: 1 | 2 | 3 | 4 | 5) => setCurrentStep(step);

  const nextStep = () => {
    if (currentStep < 5 && canProceed()) {
      setCurrentStep((prev) => Math.min(5, prev + 1) as 1 | 2 | 3 | 4 | 5);
    }
  };

  const previousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3 | 4 | 5);
    }
  };

  const canProceed = (): boolean => {
    if (currentStep === 1) return inputJson !== null && parsedConfig !== null;
    if (currentStep === 2) return selectedEntities.length > 0;
    if (currentStep === 3) return modifiedConfig !== null;
    if (currentStep === 4) return modifiedConfig !== null;
    return true;
  };

  const setJsonLoaded = (json: string, parsed: ChecklistConfig[]) => {
    setInputJson(json);
    setParsedConfig(parsed);
    setCurrentStep(2);
  };

  const toggleEntitySelection = (entity: SelectedEntity) => {
    setSelectedEntities((prev) => {
      const isSelected = prev.some((e) => e.id === entity.id);
      return isSelected ? prev.filter((e) => e.id !== entity.id) : [...prev, entity];
    });
  };

  const clearSelection = () => setSelectedEntities([]);

  const startOver = () => {
    setCurrentStep(1);
    setInputJson(null);
    setParsedConfig(null);
    setSelectedEntities([]);
    setModifiedConfig(null);
    setDeletionReport(null);
  };

  const deleteMore = () => {
    setCurrentStep(2);
    setSelectedEntities([]);
    setModifiedConfig(null);
    setDeletionReport(null);
  };

  const value: AppContextType = {
    currentStep,
    mode,
    inputJson,
    parsedConfig,
    selectedEntities,
    modifiedConfig,
    deletionReport,
    goToStep,
    nextStep,
    previousStep,
    canProceed,
    setJsonLoaded,
    setDeletionReport,
    toggleEntitySelection,
    clearSelection,
    startOver,
    deleteMore,
    setInputJson,
    setParsedConfig,
    setSelectedEntities,
    setModifiedConfig,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) throw new Error('useAppContext must be used within an AppProvider');
  return context;
}
