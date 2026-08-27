/// <reference types="vite/client" />

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getQuickNote: () => Promise<string>;
  saveQuickNote: (content: string) => void;
  getSettings: () => Promise<Record<string, unknown>>;
  saveSettings: (settings: Record<string, unknown>) => void;
  updateTheme: (theme: string) => void;
  winMinimize: () => void;
  winMaximize: () => void;
  winClose: () => void;
  winIsMaximized: () => Promise<boolean>;
  toggleQuickNote: () => void;
  closeQuickNote: () => void;
  minimizeQuickNote: () => void;
  toggleTodayPlanWindow: () => void;
  closeTodayPlanWindow: () => void;
  minimizeTodayPlanWindow: () => void;
  setOpacity: (opacity: number) => void;
  getOpacity: () => Promise<number>;
  getNotes: () => Promise<string>;
  saveNotes: (notes: string) => Promise<{ success: boolean }>;
  getAttachments: () => Promise<string>;
  saveAttachments: (attachments: string) => Promise<{ success: boolean }>;
  createQuickNote: (noteJson: string) => Promise<{ success: boolean; noteId?: string; error?: string }>;
  updateQuickNoteContent: (noteId: string, content: string) => Promise<{ success: boolean; error?: string }>;
  updateQuickNote: (noteId: string, updates: string) => Promise<{ success: boolean; error?: string }>;
  getDataPath: () => Promise<string>;
  onReloadNotes: (callback: () => void) => void;
  onSaveBeforeClose: (callback: () => void) => void;
  onNewNote: (callback: () => void) => void;
  onExportData: (callback: () => void) => void;
  onImportData: (callback: () => void) => void;
  exportData: () => Promise<string>;
  importData: (data: string) => Promise<{ success: boolean; error?: string }>;
  exportWord: (title: string, content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  exportPdf: (title: string, content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  pandocCompile: (source: string, fromFormat?: string) => Promise<{ success: boolean; html?: string; error?: string }>;
  reloadNotesFromDisk: () => void;
  selectNote: (noteId: string) => void;
  onSelectNote: (callback: (noteId: string) => void) => void;
  saveTimerRecord: (record: unknown) => Promise<{ success: boolean; error?: string }>;
  getTimerRecords: () => Promise<string>;
  saveActiveSession: (session: unknown) => Promise<{ success: boolean; error?: string }>;
  loadActiveSession: () => Promise<unknown>;
  toggleTimerStatsWindow: () => void;
  closeTimerStatsWindow: () => void;
  minimizeTimerStatsWindow: () => void;
  getWorkspaceState: () => Promise<string>;
  saveWorkspaceState: (state: string) => Promise<{ success: boolean; error?: string }>;
  resetWorkspace: () => Promise<{ success: boolean; error?: string; files?: number; root?: string; initialized?: boolean }>;
  getWorkspaceRoot: () => Promise<string>;
  chooseWorkspaceRoot: () => Promise<{ canceled?: boolean; path?: string }>;
  migrateWorkspace: (destination: string) => Promise<{ success: boolean; error?: string; source?: string; destination?: string; files?: number }>;
  backupWorkspace: () => Promise<{ success: boolean; path?: string; error?: string }>;
  restoreWorkspace: () => Promise<{ success: boolean; error?: string; files?: number }>;
  chooseQuestionBook: () => Promise<{ canceled?: boolean; folder?: string; originalFolder?: string; content?: string }>;
  readQuestionBook: (folder: string) => Promise<{ success: boolean; folder?: string; content?: string; error?: string }>;
  chooseBook: () => Promise<{ canceled?: boolean; path?: string; originalPath?: string; name?: string; coverPath?: string; coverError?: string }>;
  generateBookCover: (sourcePath: string) => Promise<{ success: boolean; coverPath?: string; error?: string }>;
  openWorkspacePath: (target: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  openWorkspaceExamples: () => Promise<{ success: boolean; path?: string; error?: string }>;
  getQuestionBookSkill: () => Promise<{ success: boolean; directory?: string; skillPath?: string; promptPath?: string; prompt?: string; error?: string }>;
  getPlanImportSkill: () => Promise<{ success: boolean; directory?: string; skillPath?: string; promptPath?: string; prompt?: string; error?: string }>;
  notifyWorkspace: (title: string, body: string) => Promise<boolean>;
  getAiConfig: () => Promise<{ baseUrl: string; model: string; configured: boolean; secureStorageAvailable: boolean }> ;
  saveAiConfig: (config: { baseUrl: string; model: string; apiKey?: string; clearApiKey?: boolean }) => Promise<{ success: boolean; config?: { baseUrl: string; model: string; configured: boolean; secureStorageAvailable: boolean }; error?: string }> ;
  testAiConnection: () => Promise<{ success: boolean; error?: string }> ;
  startAi: (request: { action: 'summarize' | 'outline' | 'review-cards' | 'rewrite'; content: string }) => Promise<{ success: boolean; requestId?: string; error?: string }> ;
  cancelAi: (requestId: string) => Promise<boolean>;
  onAiStream: (callback: (event: { requestId: string; delta?: string; done?: boolean; error?: string }) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  __muyujianPendingCanvasId?: string;
  MathJax?: { typesetPromise?: (elements?: Element[]) => Promise<void> };
}
