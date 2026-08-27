import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { TodayPlan } from './components/TodayPlan';
import { CanvasBoard } from './components/CanvasBoard';
import { KanbanBoard } from './components/KanbanBoard';
import { CommandPalette } from './components/CommandPalette';
import { AttachmentLibrary } from './components/AttachmentLibrary';
import { AppearancePanel } from './components/AppearancePanel';
import { StudyWorkbench } from './components/StudyWorkbench';
import { OnboardingGuide } from './components/OnboardingGuide';
import { useNoteStore, registerReloadListener } from './store/noteStore';
import { useAttachmentStore } from './store/attachmentStore';
import { useUIStore } from './store/uiStore';
import { useSettingsStore } from './store/settingsStore';
import { generateId } from './utils/markdown';

const App: React.FC = () => {
  const { activeNoteId, notes, loaded: notesLoaded, loadNotes, addNote, selectNote } = useNoteStore();
  const { showTodayPlan, showKanban, showWorkbench, setShowTodayPlan, setShowKanban, setShowWorkbench } = useUIStore();
  const { loadAttachments } = useAttachmentStore();
  const { settings, t, toggleTheme, toggleTextMode, updateSettings } = useSettingsStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const activeNote = notes.find((note) => note.id === activeNoteId);
  const isCanvas = activeNote?.noteType === 'canvas';

  // 启动时加载便签数据并注册跨窗口重载监听
  useEffect(() => { void loadNotes(); void loadAttachments(); registerReloadListener(); }, []);

  useEffect(() => {
    if (!notesLoaded) return;
    if (!notes.some((note) => note.title === '暮雨笺 v3 使用指南')) {
      const now = Date.now();
      addNote({ id: generateId(), title: '暮雨笺 v3 使用指南', tags: ['系统指南', '学习工作台'], createdAt: now, updatedAt: now, isTodayPlan: false, noteType: 'note', isArchived: false, content: `# 暮雨笺 v3 使用指南

> 本指南保存在本机，可直接在此笔记中补充自己的流程。

## 1. 开始前的三分钟

1. 打开“规划”，设置考试日期与一轮、二轮、冲刺阶段。
2. 添加今天最重要的任务。昨天未完成的每日任务会自动顺延，并显示“昨天未完成”。
3. 在“设置”确认数据目录，并先导出一份综合备份。

## 2. 学习规划与任务

- **总览**：查看考研倒计时、今日待处理、科目概览与本月打卡。
- **规划**：添加每日任务、勾选完成、将暂时不做的任务移入月综合任务。
- **计划文件**：导入 Markdown 清单。每行使用 \`- [ ] 任务名称\`，软件会生成今日任务。
- **阶段**：可自由修改考试日期、一轮、二轮与冲刺的起止日期。

## 3. 专注与打卡

1. 在“专注”填写本次任务名称、科目和时长。
2. 点击“开始计时”，过程中可暂停、继续或结束并记录。
3. 完成后会计入学习统计与当天打卡；可导出今日打卡图片。

## 4. 书架与题册

- **书架**：默认有数学、英语、政治、业务课，可新建自定义分组。导入书本后可使用系统默认程序打开。
- **题册**：导入按规范整理的 Markdown 题册，按章节、正确题、错误题、待重做和已通过筛选。
- **错题**：可手动新增。已重做并通过不会改变其“错误题”历史，但可单独筛选通过状态。
- **重点标签**：在题目上添加标签，点击标签可生成新的题册副本。

## 5. 笔记与无限画布

- **笔记**：支持 Markdown、公式、图片、版本历史和实时预览。
- **画布添加**：可放入文本、图片、素材库图片和关联笔记；也支持拖入图片、粘贴图片或文字。
- **画布操作**：单击选中元素；右下角紫色点可拖拽调整宽高；尺寸面板可输入精确数值；双击元素可居中适配。
- **关联笔记**：双击或选中后点“打开关联笔记”，右侧上方渲染预览、下方编辑；中间分隔条可调整两区高度。
- **右键菜单**：支持复制、剪切、粘贴、删除、居中适配和打开关联笔记。\`Ctrl+C\`、\`Ctrl+X\`、\`Ctrl+V\` 同样可用。
- **画布壁纸**：点击画布工具栏中的“设置画布壁纸”，可导入本地图片，选择铺满、完整显示或平铺；壁纸随画布备份。

## 6. 数据、迁移与恢复

- 所有工作台数据默认保存于本机，不上传云端。
- “导出综合备份”会打包工作台数据、笔记、附件和托管导入资料。
- 在“设置”修改数据目录时，软件会迁移文件并逐项校验。校验成功后原目录会保留，等待你自行确认清理。
- 恢复综合备份会覆盖同名工作台文件，恢复前请先导出当前备份。

## 7. 推荐每日流程

1. 打开总览，确认倒计时与今日待处理。
2. 在规划中完成或调整今日任务。
3. 使用专注计时记录学习时段。
4. 将错题整理进题册，必要时在画布中连接知识点与笔记。
5. 每周至少导出一次综合备份。` });
    }
  }, [addNote, notes, notesLoaded]);

  useEffect(() => {
    if (notesLoaded && !settings.onboardingCompleted) setShowOnboarding(true);
  }, [notesLoaded, settings.onboardingCompleted]);

  useEffect(() => {
    const reopen = () => setShowOnboarding(true);
    window.addEventListener('muyujian:show-onboarding', reopen);
    return () => window.removeEventListener('muyujian:show-onboarding', reopen);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    window.electronAPI?.updateTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    window.electronAPI?.getSettings().then((saved) => {
      if (saved && typeof saved === 'object') updateSettings(saved as Partial<typeof settings>);
    }).catch(() => {});
  }, [updateSettings]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); setShowPreview((prev) => !prev); }
      if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowCommandPalette(true); }
      if (e.key === 'F11') { e.preventDefault(); setFocusMode((prev) => !prev); }
      if (e.key === 'Escape' && focusMode) { setFocusMode(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode]);

  const createNote = () => {
    const note = { id: generateId(), title: t.newNote, content: '', tags: [], createdAt: Date.now(), updatedAt: Date.now(), isTodayPlan: false, noteType: 'note' as const, isArchived: false };
    addNote(note); selectNote(note.id); setShowTodayPlan(false); setShowKanban(false); setShowWorkbench(true);
  };
  const createCanvas = () => {
    const note = { id: generateId(), title: '未命名画布', content: '', tags: [], createdAt: Date.now(), updatedAt: Date.now(), isTodayPlan: false, noteType: 'canvas' as const, isArchived: false, canvasItems: [], canvasLinks: [] };
    addNote(note); selectNote(note.id); setShowTodayPlan(false); setShowKanban(false); setShowWorkbench(true);
    window.__muyujianPendingCanvasId = note.id;
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('muyujian:open-canvas', { detail: note.id })));
  };

  // 菜单事件监听
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onNewNote?.(() => {
      createNote();
    });
    window.electronAPI.onExportData?.(async () => {
      const data = await window.electronAPI?.exportData();
      if (!data) return;
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'muyujian-backup.json'; a.click();
      URL.revokeObjectURL(url);
    });
    window.electronAPI.onImportData?.(() => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const result = await window.electronAPI?.importData(await file.text());
        if (result?.success) await loadNotes();
        else alert('导入失败：备份文件格式无效');
      };
      input.click();
    });
    // 监听选中便签事件（来自 QuickNote 窗口）
    window.electronAPI.onSelectNote?.((noteId: string) => {
      selectNote(noteId);
    });
  }, [addNote, loadNotes, t.newNote, selectNote]);

  return (
    <div className={`app-shell flex flex-col h-screen overflow-hidden bg-white dark:bg-gray-950 ${showWorkbench ? 'workbench-first' : ''} ${settings.wallpaper ? 'app-with-wallpaper' : ''}`} style={settings.wallpaper ? { backgroundImage: `url(${settings.wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      {/* 自定义标题栏 - 专注模式下隐藏 */}
      {!focusMode && (
      <div className="app-titlebar flex items-center h-9 px-2 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 select-none flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>

        {/* 左侧：应用信息 + 侧边栏按钮 */}
        <div className="app-brand flex items-center gap-1.5 min-w-0 flex-shrink-0">
          {!showWorkbench && <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors flex-shrink-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {sidebarCollapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />}
            </svg>
          </button>}
          <span className="text-sm" role="img" aria-label="暮雨笺">🌧️</span>
          <h1 className="text-sm font-medium text-gray-600 dark:text-gray-300 tracking-widest truncate">{t.appName}</h1>
        </div>

        {/* 中间留空可拖拽 */}
        <div className="flex-1" />

        {/* 右侧：工具按钮 + 窗口控制，紧挨排列 */}
        <div className="app-title-actions flex items-center gap-1 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {activeNoteId && !showTodayPlan && !isCanvas && !showWorkbench && (
            <button onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all whitespace-nowrap ${showPreview
                ? 'bg-indigo-100 dark:bg-rose-900/30 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`}
              title={`${showPreview ? t.hidePreview : t.showPreview} (Ctrl+Shift+P)`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {showPreview ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                )}
              </svg>
              <span className="hidden md:inline">{showPreview ? t.hidePreview : t.showPreview}</span>
            </button>
          )}

          {!showWorkbench && <button onClick={toggleTextMode}
            className="px-2 py-1 text-[11px] rounded transition-all whitespace-nowrap bg-violet-50 dark:bg-violet-900/20 text-violet-500 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30"
            title={t.textMode}>
            {settings.textMode === 'modern' ? t.modernText : t.classicalText}
          </button>}

          <button onClick={toggleTheme}
            className="p-1 rounded hover:bg-amber-50 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            title={settings.theme === 'light' ? t.switchToDark : t.switchToLight}>
            {settings.theme === 'light' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {!showWorkbench && <button onClick={() => window.electronAPI?.toggleQuickNote()}
            className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            title={`${t.shortcutHint} (Alt+Q)`}>
            <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>}

          {!showWorkbench && <button onClick={() => { setShowWorkbench(true); setShowTodayPlan(false); setShowKanban(false); }}
            className="mobile-workbench-trigger p-1 rounded hover:bg-blue-50 dark:hover:bg-gray-800 text-blue-500 transition-colors"
            title="学习工作台">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 15v-3m4 3V8m4 7v-5" /></svg>
          </button>}

          {!showWorkbench && <button onClick={() => setShowAssets(true)} className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-gray-800 text-gray-400 transition-colors" title="素材库">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 9h16M8 13h.01M7 17l3-3 2 2 3-3 2 4" /></svg>
          </button>}
          {!showWorkbench && <button onClick={() => setShowAppearance(true)} className="flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-gray-800 text-indigo-500 transition-colors" title="AI 设置、外观与预览">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3m-4.2-6.8l-2.1 2.1m-7.4 7.4l-2.1 2.1m0-11.6l2.1 2.1m7.4 7.4l2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" /></svg><span className="hidden xl:inline text-[11px]">AI 设置</span>
          </button>}
          {!showWorkbench && <button onClick={() => setShowCommandPalette(true)} className="px-2 py-1 rounded text-[11px] bg-slate-50 dark:bg-gray-800 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" title="命令面板 (Ctrl+K)">Ctrl K</button>}

          {/* 窗口控制按钮 */}
          <div className="flex items-center ml-1 pl-1 border-l border-gray-200 dark:border-gray-700">
            <button onClick={() => window.electronAPI?.winMinimize()}
              className="w-8 h-7 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors rounded">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M5 12h14" /></svg>
            </button>
            <button onClick={() => window.electronAPI?.winMaximize()}
              className="w-8 h-7 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors rounded">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
            </button>
            <button onClick={() => window.electronAPI?.winClose()}
              className="w-8 h-7 flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-400 transition-colors rounded">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 主内容区 */}
      <div className="app-main-area flex-1 flex min-h-0">
        {/* 侧边栏 - 专注模式下隐藏 */}
        {!focusMode && !showWorkbench && (
        <div className={`app-sidebar transition-all duration-300 ease-in-out flex-shrink-0 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-[272px]'}`}>
          <Sidebar />
        </div>
        )}

        {/* 编辑器区 */}
        <div className="app-workspace flex-1 flex flex-col min-w-0">
          {/* 内容区域 */}
          <div className="app-content-area flex-1 flex min-h-0 relative">
            {showWorkbench ? <StudyWorkbench /> : showKanban ? <KanbanBoard /> : showTodayPlan && !focusMode ? <TodayPlan /> : isCanvas ? <CanvasBoard note={activeNote!} /> : <><Editor />{(showPreview && !focusMode) && <Preview onClose={() => setShowPreview(false)} />}</>}
            {/* 专注模式退出提示 */}
            {focusMode && (
              <div className="absolute top-2 right-2 z-50 opacity-0 hover:opacity-100 transition-opacity">
                <button onClick={() => setFocusMode(false)}
                  className="px-2 py-1 text-[10px] rounded-lg bg-gray-800/60 text-gray-300 hover:bg-gray-700/80 backdrop-blur-sm">
                  按 Esc 或 F11 退出专注
                </button>
              </div>
            )}
          </div>

          {/* 底部状态栏 - 专注模式下隐藏 */}
          {!focusMode && !showWorkbench && (
          <div className="app-statusbar flex items-center justify-between px-3 py-1 border-t border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900 flex-shrink-0">
            <div className="flex items-center gap-3 text-[11px] text-gray-300 dark:text-gray-600">
              <span>Alt+Q: {t.shortcutHint}</span>
              <span className="text-slate-300">·</span>
              <span>Ctrl+Shift+P: {t.preview}</span>
              <span className="text-slate-300">·</span>
              <span>F11: 专注模式</span>
              <span className="text-slate-300">·</span>
              <span>Ctrl+B: {t.bold}</span>
              <span className="text-slate-300">·</span>
              <span>Ctrl+I: {t.italic}</span>
            </div>
            <div className="text-[11px] text-gray-300 dark:text-gray-600">
              {settings.theme === 'light' ? t.themeLight : t.themeDark}
            </div>
          </div>
          )}
        </div>
      </div>
      {showCommandPalette && <CommandPalette notes={notes} onClose={() => setShowCommandPalette(false)} onOpenNote={(id) => { selectNote(id); setShowTodayPlan(false); setShowKanban(false); setShowWorkbench(true); }} onNewNote={createNote} onNewCanvas={createCanvas} onTogglePreview={() => setShowPreview((value) => !value)} onOpenAssets={() => setShowAssets(true)} onOpenAppearance={() => setShowAppearance(true)} />}
      {showAssets && <AttachmentLibrary onClose={() => setShowAssets(false)} />}
      {showAppearance && <AppearancePanel onClose={() => setShowAppearance(false)} previewVisible={showPreview} onTogglePreview={() => setShowPreview((value) => !value)} />}
      {showOnboarding && <OnboardingGuide onFinish={() => { updateSettings({ onboardingCompleted: true }); setShowOnboarding(false); }} onSkip={() => { updateSettings({ onboardingCompleted: true }); setShowOnboarding(false); }} />}
    </div>
  );
};

export default App;
