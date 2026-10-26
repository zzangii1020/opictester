import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { ExamResult, ExamState, Level, PracticeRecord, Preferences, SurveyAnswers, TargetGrade } from '../types';
import { loadJson, removeKey, saveJson, STORAGE_KEYS } from '../lib/storage';
import { clearAllAudio, deleteAudioByPrefix } from '../lib/audioDb';

export interface Settings {
  survey: SurveyAnswers | null;
  surveyUpdatedAt: number | null;
  level: Level | null;
  targetGrade: TargetGrade;
  prefs: Preferences;
}

export const defaultPrefs: Preferences = {
  showQuestionText: true,
  replayLimit: 1,
  autoRecord: false,
  ttsRate: 0.95,
  sttEnabled: false,
  strictSurveyRule: false,
};

const defaultSettings: Settings = {
  survey: null,
  surveyUpdatedAt: null,
  level: null,
  targetGrade: 'IM2',
  prefs: defaultPrefs,
};

interface Store {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  updatePrefs: (patch: Partial<Preferences>) => void;
  activeExam: ExamState | null;
  setActiveExam: Dispatch<SetStateAction<ExamState | null>>;
  results: ExamResult[];
  saveResult: (result: ExamResult) => void;
  deleteResult: (id: string) => Promise<void>;
  practice: PracticeRecord[];
  savePractice: (record: PracticeRecord) => void;
  deletePractice: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  storageWarning: string | null;
}

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = loadJson<Partial<Settings>>(STORAGE_KEYS.settings, {});
    return { ...defaultSettings, ...saved, prefs: { ...defaultPrefs, ...saved.prefs } };
  });
  const [activeExam, setActiveExamState] = useState<ExamState | null>(() => loadJson<ExamState | null>(STORAGE_KEYS.activeExam, null));
  const [results, setResults] = useState<ExamResult[]>(() => loadJson<ExamResult[]>(STORAGE_KEYS.results, []));
  const [practice, setPractice] = useState<PracticeRecord[]>(() => loadJson<PracticeRecord[]>(STORAGE_KEYS.practice, []));
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const persist = useCallback((key: string, value: unknown) => {
    if (!saveJson(key, value)) setStorageWarning('브라우저 저장소에 저장하지 못했습니다. 사생활 보호 모드이거나 저장 공간이 가득 찼을 수 있습니다.');
  }, []);

  useEffect(() => persist(STORAGE_KEYS.settings, settings), [settings, persist]);
  useEffect(() => persist(STORAGE_KEYS.results, results), [results, persist]);
  useEffect(() => persist(STORAGE_KEYS.practice, practice), [practice, persist]);
  useEffect(() => {
    if (activeExam) persist(STORAGE_KEYS.activeExam, activeExam);
    else removeKey(STORAGE_KEYS.activeExam);
  }, [activeExam, persist]);

  const store = useMemo<Store>(
    () => ({
      settings,
      updateSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
      updatePrefs: (patch) => setSettings((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })),
      activeExam,
      setActiveExam: setActiveExamState,
      results,
      saveResult: (result) => setResults((rs) => [result, ...rs.filter((r) => r.id !== result.id)]),
      deleteResult: async (id) => {
        await deleteAudioByPrefix(`${id}:`).catch(() => undefined);
        setResults((rs) => rs.filter((r) => r.id !== id));
      },
      practice,
      savePractice: (record) => setPractice((ps) => [record, ...ps.filter((p) => p.id !== record.id)].slice(0, 200)),
      deletePractice: async (id) => {
        await deleteAudioByPrefix(`${id}:`).catch(() => undefined);
        setPractice((ps) => ps.filter((p) => p.id !== id));
      },
      clearAll: async () => {
        await clearAllAudio().catch(() => undefined);
        setResults([]);
        setPractice([]);
        setActiveExamState(null);
        setSettings(defaultSettings);
      },
      storageWarning,
    }),
    [settings, activeExam, results, practice, storageWarning],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider');
  return ctx;
}
