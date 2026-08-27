import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // 快速笔记
  getQuickNote: () => ipcRenderer.invoke('get-quick-note'),
  saveQuickNote: (content: string) => ipcRenderer.send('save-quick-note', content),
  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.send('save-settings', settings),
  // 主题同步
  updateTheme: (theme: string) => ipcRenderer.send('update-theme', theme),
  // 主窗口控制
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),
  winIsMaximized: () => ipcRenderer.invoke('win-is-maximized'),
  // 窗口控制
  toggleQuickNote: () => ipcRenderer.send('toggle-quick-note'),
  closeQuickNote: () => ipcRenderer.send('close-quick-note'),
  minimizeQuickNote: () => ipcRenderer.send('minimize-quick-note'),
  toggleTodayPlanWindow: () => ipcRenderer.send('toggle-today-plan-window'),
  closeTodayPlanWindow: () => ipcRenderer.send('close-today-plan-window'),
  minimizeTodayPlanWindow: () => ipcRenderer.send('minimize-today-plan-window'),
  // 透明度
  setOpacity: (opacity: number) => ipcRenderer.send('set-opacity', opacity),
  getOpacity: () => ipcRenderer.invoke('get-opacity'),
  // 便签数据
  getNotes: () => ipcRenderer.invoke('get-notes'),
  saveNotes: (notes: string) => ipcRenderer.invoke('save-notes', notes),
  getAttachments: () => ipcRenderer.invoke('get-attachments'),
  saveAttachments: (attachments: string) => ipcRenderer.invoke('save-attachments', attachments),
  createQuickNote: (noteJson: string) => ipcRenderer.invoke('create-quick-note', noteJson),
  updateQuickNoteContent: (noteId: string, content: string) => ipcRenderer.invoke('update-quick-note-content', noteId, content),
  updateQuickNote: (noteId: string, updates: string) => ipcRenderer.invoke('update-quick-note', noteId, updates),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  // 笔记重载监听（跨窗口同步）
  onReloadNotes: (callback: () => void) => ipcRenderer.on('reload-notes', callback),
  // 快速笔记关闭前保存
  onSaveBeforeClose: (callback: () => void) => ipcRenderer.on('save-before-close', callback),
  // 菜单事件监听
  onNewNote: (callback: () => void) => ipcRenderer.on('new-note', callback),
  onExportData: (callback: () => void) => ipcRenderer.on('export-data', callback),
  onImportData: (callback: () => void) => ipcRenderer.on('import-data', callback),
  // 数据导入导出
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: (data: string) => ipcRenderer.invoke('import-data', data),
  // 导出为 Word（通过 pandoc 编译原始内容）
  exportWord: (title: string, content: string) => ipcRenderer.invoke('export-word', title, content),
  // 导出为 PDF（通过 pandoc + xelatex，需要用户已安装 LaTeX）
  exportPdf: (title: string, content: string) => ipcRenderer.invoke('export-pdf', title, content),
  // Pandoc 编译
  pandocCompile: (source: string, fromFormat?: string) => ipcRenderer.invoke('pandoc-compile', source, fromFormat),
  // 命令主窗口重载笔记
  reloadNotesFromDisk: () => ipcRenderer.send('reload-notes-from-disk'),
  // 通知主窗口选中指定便签
  selectNote: (noteId: string) => ipcRenderer.send('select-note', noteId),
  onSelectNote: (callback: (noteId: string) => void) => ipcRenderer.on('select-note', (_e, noteId) => callback(noteId)),
  // 任务计时
  saveTimerRecord: (record: any) => ipcRenderer.invoke('save-timer-record', record),
  getTimerRecords: () => ipcRenderer.invoke('get-timer-records'),
  saveActiveSession: (session: any) => ipcRenderer.invoke('save-active-session', session),
  loadActiveSession: () => ipcRenderer.invoke('load-active-session'),
  // 统计窗口
  toggleTimerStatsWindow: () => ipcRenderer.send('toggle-timer-stats-window'),
  closeTimerStatsWindow: () => ipcRenderer.send('close-timer-stats-window'),
  minimizeTimerStatsWindow: () => ipcRenderer.send('minimize-timer-stats-window'),
  // 学习工作台（文件系统能力经主进程收口）
  getWorkspaceState: () => ipcRenderer.invoke('workspace-get-state'),
  saveWorkspaceState: (state: string) => ipcRenderer.invoke('workspace-save-state', state),
  resetWorkspace: () => ipcRenderer.invoke('workspace-reset'),
  getWorkspaceRoot: () => ipcRenderer.invoke('workspace-get-root'),
  chooseWorkspaceRoot: () => ipcRenderer.invoke('workspace-choose-root'),
  migrateWorkspace: (destination: string) => ipcRenderer.invoke('workspace-migrate', destination),
  backupWorkspace: () => ipcRenderer.invoke('workspace-backup'),
  restoreWorkspace: () => ipcRenderer.invoke('workspace-restore'),
  chooseQuestionBook: () => ipcRenderer.invoke('workspace-choose-question-book'),
  readQuestionBook: (folder: string) => ipcRenderer.invoke('workspace-read-question-book', folder),
  chooseBook: () => ipcRenderer.invoke('workspace-choose-book'),
  generateBookCover: (sourcePath: string) => ipcRenderer.invoke('workspace-generate-book-cover', sourcePath),
  openWorkspacePath: (target: string) => ipcRenderer.invoke('workspace-open-path', target),
  openWorkspaceExamples: () => ipcRenderer.invoke('workspace-open-examples'),
  getQuestionBookSkill: () => ipcRenderer.invoke('workspace-question-book-skill'),
  getPlanImportSkill: () => ipcRenderer.invoke('workspace-plan-skill'),
  notifyWorkspace: (title: string, body: string) => ipcRenderer.invoke('workspace-notify', title, body),
  getAiConfig: () => ipcRenderer.invoke('ai-get-config'),
  saveAiConfig: (config: { baseUrl: string; model: string; apiKey?: string; clearApiKey?: boolean }) => ipcRenderer.invoke('ai-save-config', config),
  testAiConnection: () => ipcRenderer.invoke('ai-test-connection'),
  startAi: (request: { action: 'summarize' | 'outline' | 'review-cards' | 'rewrite'; content: string }) => ipcRenderer.invoke('ai-start', request),
  cancelAi: (requestId: string) => ipcRenderer.invoke('ai-cancel', requestId),
  onAiStream: (callback: (event: { requestId: string; delta?: string; done?: boolean; error?: string }) => void) => {
    const listener = (_event: unknown, value: { requestId: string; delta?: string; done?: boolean; error?: string }) => callback(value);
    ipcRenderer.on('ai-stream', listener);
    return () => ipcRenderer.removeListener('ai-stream', listener);
  },
});
