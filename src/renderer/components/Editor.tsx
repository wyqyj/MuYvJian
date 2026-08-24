import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState, SelectionRange } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { useNoteStore } from '../store/noteStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAutoSave } from '../utils/useAutoSave';
import { VersionHistory } from './VersionHistory';

type AiAction = 'summarize' | 'outline' | 'review-cards' | 'rewrite';
const aiActionLabels: Record<AiAction, string> = { summarize: '摘要', outline: '提纲', 'review-cards': '复习卡片', rewrite: '润色' };

/** 将文件转为 base64 data URL */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 在编辑器光标位置插入文本 */
function insertAtCursor(view: EditorView, text: string) {
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, to: from, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

export const Editor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { notes, activeNoteId, updateNote, updateContent, setActiveNoteId } = useNoteStore();
  const { t } = useSettingsStore();
  const [showHistory, setShowHistory] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiRequestId, setAiRequestId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiAction, setAiAction] = useState<AiAction>('summarize');
  const aiSelectionRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  const activeNote = notes.find((n) => n.id === activeNoteId);
  const backlinks = useMemo(() => activeNote ? notes.filter((note) => note.id !== activeNote.id && !note.isDeleted && (
    note.content.includes(`[[${activeNote.title}]]`) || note.canvasItems?.some((item) => item.type === 'note' && item.content === activeNote.id)
  )) : [], [activeNote, notes]);

  useAutoSave({
    content: activeNote?.content || '',
    saveFn: (content) => { if (activeNoteId) updateNote(activeNoteId, { content }); },
    interval: 60000,
    dependencies: [activeNoteId],
  });

  const wrapSelection = useCallback((view: EditorView, before: string, after: string) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: `${before}${selected}${after}` },
      selection: { anchor: from + before.length, head: to + before.length },
    });
  }, []);

  // 插入图片（base64）
  const insertImage = useCallback(async (file: File) => {
    if (!viewRef.current) return;
    const maxSize = 5 * 1024 * 1024; // 5MB 限制
    if (file.size > maxSize) {
      alert('图片大小不能超过 5MB');
      return;
    }
    try {
      const dataUrl = await fileToBase64(file);
      const name = file.name.replace(/\.[^.]+$/, '');
      const markdown = `![${name}](${dataUrl})`;
      insertAtCursor(viewRef.current, markdown);
    } catch {
      alert('图片读取失败');
    }
  }, []);

  // 从文件选择器插入图片
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        await insertImage(file);
      }
    }
    e.target.value = '';
  }, [insertImage]);

  // 粘贴图片
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void insertImage(file);
      }
    }
  }, [insertImage]);

  // 拖拽图片
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        await insertImage(file);
      }
    }
  }, [insertImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // 工具栏操作
  const handleBold = () => viewRef.current && wrapSelection(viewRef.current, '**', '**');
  const handleItalic = () => viewRef.current && wrapSelection(viewRef.current, '*', '*');
  const handleCode = () => viewRef.current && wrapSelection(viewRef.current, '`', '`');
  const handleCodeBlock = () => viewRef.current && wrapSelection(viewRef.current, '```\n', '\n```');
  const handleTask = () => viewRef.current && insertAtCursor(viewRef.current, '- [ ] ');
  const handleHeading = () => viewRef.current && insertAtCursor(viewRef.current, '## ');
  const handleLink = () => viewRef.current && wrapSelection(viewRef.current, '[', '](url)');
  const handleList = () => viewRef.current && insertAtCursor(viewRef.current, '- ');
  const handleImage = () => fileInputRef.current?.click();

  useEffect(() => {
    if (!window.electronAPI?.onAiStream) return;
    return window.electronAPI.onAiStream((event) => {
      if (event.requestId !== aiRequestId) return;
      if (event.delta) setAiResult((current) => current + event.delta);
      if (event.done) {
        setAiRequestId(null);
        if (event.error) setAiError(event.error);
      }
    });
  }, [aiRequestId]);

  const runAi = async (action: AiAction) => {
    if (!activeNote || !viewRef.current) return;
    const { from, to } = viewRef.current.state.selection.main;
    const selected = viewRef.current.state.sliceDoc(from, to);
    const content = selected.trim() || activeNote.content.trim();
    if (!content) { setAiError('请先输入或选择需要整理的笔记内容。'); return; }
    aiSelectionRef.current = { from, to };
    setAiAction(action);
    setAiResult('');
    setAiError('');
    const result = await window.electronAPI?.startAi({ action, content });
    if (!result?.success || !result.requestId) {
      setAiError(result?.error || '无法启动 AI 整理。请先在外观面板完成 AI 设置。');
      return;
    }
    setAiRequestId(result.requestId);
  };

  const insertAiResult = (mode: 'cursor' | 'append' | 'replace') => {
    const view = viewRef.current;
    if (!view || !aiResult.trim()) return;
    const range = aiSelectionRef.current;
    if (mode === 'append') {
      const at = view.state.doc.length;
      view.dispatch({ changes: { from: at, insert: `${at ? '\n\n' : ''}${aiResult.trim()}\n` }, selection: { anchor: at + aiResult.trim().length } });
    } else if (mode === 'replace' && range.from !== range.to) {
      view.dispatch({ changes: { from: range.from, to: range.to, insert: aiResult.trim() }, selection: { anchor: range.from, head: range.from + aiResult.trim().length } });
    } else {
      insertAtCursor(view, aiResult.trim());
    }
    setAiResult('');
    setShowAi(false);
  };

  useEffect(() => {
    if (!editorRef.current || !activeNote) return;
    if (viewRef.current) viewRef.current.destroy();

    const state = EditorState.create({
      doc: activeNote.content,
      extensions: [
        EditorView.lineWrapping,
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(),
        drawSelection(), history(), bracketMatching(), foldGutter(),
        syntaxHighlighting(defaultHighlightStyle),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        keymap.of([
          { key: 'Mod-b', run: (v) => { wrapSelection(v, '**', '**'); return true; } },
          { key: 'Mod-i', run: (v) => { wrapSelection(v, '*', '*'); return true; } },
          { key: 'Mod-`', run: (v) => { wrapSelection(v, '`', '`'); return true; } },
          { key: 'Mod-k', run: (v) => { wrapSelection(v, '[', '](url)'); return true; } },
          // 复制
          { key: 'Mod-c', run: (v) => {
            const text = v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
            if (text) navigator.clipboard.writeText(text);
            return true;
          }},
          // 剪切
          { key: 'Mod-x', run: (v) => {
            const { from, to } = v.state.selection.main;
            const text = v.state.sliceDoc(from, to);
            if (text) {
              navigator.clipboard.writeText(text);
              v.dispatch({ changes: { from, to } });
            }
            return true;
          }},
          // 粘贴
          { key: 'Mod-v', run: (v) => {
            navigator.clipboard.readText().then((text) => {
              if (!text) return;
              const { from, to } = v.state.selection.main;
              v.dispatch({ changes: { from, to, insert: text } });
            }).catch(() => {});
            return true;
          }},
          // 全选
          { key: 'Mod-a', run: (v) => {
            v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
            return true;
          }},
        ]),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && activeNoteId) {
            updateContent(activeNoteId, update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          paste: handlePaste,
        }),
        EditorView.theme({
          '&': { fontSize: '14px', height: '100%' },
          '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", padding: '16px' },
          '.cm-focused': { outline: 'none' },
          '.cm-editor': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
          '.cm-activeLineGutter': { backgroundColor: 'rgba(244,63,94,0.06)' },
          '.cm-activeLine': { backgroundColor: 'rgba(244,63,94,0.04)' },
          '.cm-foldGutter .cm-gutterElement': { color: '#9ca3af' },
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: editorRef.current });
    // 自动聚焦编辑器
    requestAnimationFrame(() => { viewRef.current?.focus(); });
    return () => { viewRef.current?.destroy(); };
  }, [activeNoteId]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeNoteId) updateNote(activeNoteId, { title: e.target.value });
  };

  if (!activeNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-white to-rose-50/30 dark:from-gray-900 dark:to-gray-950">
        <div className="text-center text-gray-300 dark:text-gray-600">
          <svg className="w-20 h-20 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <p className="text-base">{t.editorPlaceholder}</p>
          <p className="text-sm mt-1 opacity-60">{t.editorHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-shell flex-1 flex flex-col bg-white dark:bg-gray-900 min-w-0">
      {/* 标题 */}
      <div className="editor-note-header px-5 py-3 border-b border-rose-100/60 dark:border-gray-800">
        <div className="flex items-center gap-3">
        <input type="text" value={activeNote.title} onChange={handleTitleChange}
          className="w-full text-xl font-semibold bg-transparent border-none outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-300 tracking-wide"
          placeholder={t.titlePlaceholder} />
          <button onClick={() => setShowHistory(true)} className="p-1.5 rounded-md text-gray-400 hover:bg-indigo-50 hover:text-indigo-500 dark:hover:bg-gray-800 dark:hover:text-indigo-300" title="版本历史" aria-label="版本历史">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 109-9 9 9 0 00-9 9zm9-5v5l3 2" /></svg>
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-300 dark:text-gray-600">
          <span>{t.createdAt} {new Date(activeNote.createdAt).toLocaleString('zh-CN')}</span>
          <span className="text-rose-200">·</span>
          <span>{t.updatedAt} {new Date(activeNote.updatedAt).toLocaleString('zh-CN')}</span>
        </div>
        {backlinks.length > 0 && <div className="flex items-center gap-1.5 mt-2 overflow-x-auto text-[11px]"><span className="text-gray-400 flex-shrink-0">被引用</span>{backlinks.map((note) => <button key={note.id} onClick={() => setActiveNoteId(note.id)} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-500 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 whitespace-nowrap">{note.noteType === 'canvas' ? '▦ ' : ''}{note.title}</button>)}</div>}
      </div>

      {/* 工具栏 */}
      <div className="editor-toolbar flex items-center gap-0.5 px-3 py-1.5 border-b border-rose-100/30 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
        <button onClick={handleHeading} className="toolbar-btn" title="标题"><span className="font-bold text-sm">H</span></button>
        <button onClick={handleBold} className="toolbar-btn" title={t.bold}><span className="font-bold text-sm">B</span></button>
        <button onClick={handleItalic} className="toolbar-btn" title={t.italic}><span className="italic text-sm">I</span></button>
        <button onClick={handleCode} className="toolbar-btn" title={t.code}><span className="text-sm font-mono">&lt;/&gt;</span></button>
        <button onClick={handleCodeBlock} className="toolbar-btn" title={t.codeBlock}><span className="text-xs font-mono">{'{ }'}</span></button>
        <button onClick={handleTask} className="toolbar-btn" title={t.taskList}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </button>
        <button onClick={handleLink} className="toolbar-btn" title={t.link}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
        </button>
        <button onClick={handleList} className="toolbar-btn" title={t.list}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
        </button>
        <div className="w-px h-4 bg-rose-100 dark:bg-gray-700 mx-1" />
        <button onClick={handleImage} className="toolbar-btn" title="插入图片">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>
        <button onClick={() => { setShowAi((visible) => !visible); setAiError(''); }} className="toolbar-btn" title="AI 整理笔记" aria-label="AI 整理笔记">
          <span className="text-xs font-semibold">AI</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
      </div>
      {showAi && <section className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/40 dark:bg-indigo-950/20" aria-label="AI 笔记整理">
        <div className="flex items-center justify-between gap-3"><div><strong className="text-sm text-indigo-950 dark:text-indigo-100">AI 笔记整理</strong><p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">优先整理当前选区；未选择时整理整篇笔记。内容仅在本次操作中发送至已配置的服务。</p></div><button className="toolbar-btn" onClick={() => { if (aiRequestId) void window.electronAPI?.cancelAi(aiRequestId); setShowAi(false); }} title="关闭" aria-label="关闭 AI 整理">×</button></div>
        <div className="mt-2 flex flex-wrap gap-2">{(Object.keys(aiActionLabels) as AiAction[]).map((action) => <button key={action} disabled={Boolean(aiRequestId)} onClick={() => void runAi(action)} className={`rounded px-2 py-1 text-xs ${aiAction === action ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 hover:bg-indigo-100 dark:bg-gray-800 dark:text-indigo-200'}`}>{aiActionLabels[action]}</button>)}{aiRequestId && <button onClick={() => void window.electronAPI?.cancelAi(aiRequestId)} className="rounded px-2 py-1 text-xs text-rose-700 hover:bg-rose-100 dark:text-rose-300">停止生成</button>}</div>
        {aiError && <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{aiError}</p>}
        {(aiResult || aiRequestId) && <div className="mt-3"><textarea readOnly value={aiResult || '正在生成…'} className="min-h-40 w-full resize-y rounded border border-indigo-200 bg-white p-3 font-mono text-xs leading-5 text-gray-800 outline-none dark:border-indigo-900/50 dark:bg-gray-900 dark:text-gray-100" aria-label="AI 生成结果预览" />{!aiRequestId && aiResult && <div className="mt-2 flex flex-wrap gap-2"><button onClick={() => insertAiResult('cursor')} className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700">插入光标处</button><button onClick={() => insertAiResult('append')} className="rounded border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:text-indigo-200">追加到笔记</button>{aiSelectionRef.current.from !== aiSelectionRef.current.to && <button onClick={() => insertAiResult('replace')} className="rounded border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:text-indigo-200">替换原选区</button>}</div>}</div>}
      </section>}

      {/* 编辑器（支持拖拽图片） */}
      <div ref={editorRef} className="editor-surface flex-1 overflow-hidden"
        onDrop={handleDrop} onDragOver={handleDragOver}
        onMouseDown={() => { viewRef.current?.focus(); }} />
      {showHistory && <VersionHistory note={activeNote} onClose={() => setShowHistory(false)} />}
    </div>
  );
};
