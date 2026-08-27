import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasBoard } from './CanvasBoard';
import { Editor } from './Editor';
import { Preview } from './Preview';
import { CanvasItem, Note, useNoteStore } from '../store/noteStore';
import { generateId, normalizeMathMarkdown, renderMarkdown } from '../utils/markdown';
import { useSettingsStore } from '../store/settingsStore';
import type { Book, BookSort, FocusRecord, Mastery, Question, QuestionBook, Subject, Task, TaskBucket, Workspace } from '../../shared/types';
import { parseMarkdownTasks } from '../utils/planTasks';
import { renderQuestionBookMarkdown, sanitizeExportFileName, selectQuestionExportItems, type QuestionExportScope } from '../utils/questionBookExport';
import { AiConfigPanel } from './AiConfigPanel';

type PromptResource = { directory?: string; skillPath?: string; promptPath?: string; prompt?: string; error?: string };

const subjects: Subject[] = ['政治', '英语', '数学', '业务课'];
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const dateOffset = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };

const sampleQuestions: Question[] = [
  { id: 'q-001', chapter: '第一章 极限', number: 'Q001', status: 'wrong', prompt: '求 lim(x→0) sin x / x。', answer: '1', mine: '0', reason: '忽略了重要极限。', mastery: 2, passed: false, tags: ['易错', '基础'] },
  { id: 'q-002', chapter: '第一章 极限', number: 'Q002', status: 'correct', prompt: '判断函数 f(x)=x² 在 x=0 处的连续性。', answer: '连续。', mastery: 4, passed: true, tags: ['连续'] },
  { id: 'q-003', chapter: '第二章 导数', number: 'Q003', status: 'wrong', prompt: '求 y=ln(x²+1) 的导数。', answer: 'y\' = 2x/(x²+1)', mine: '1/(x²+1)', reason: '遗漏链式法则中的 2x。', mastery: 1, passed: false, tags: ['链式法则'] },
  { id: 'q-004', chapter: '第二章 导数', number: 'Q004', status: 'correct', prompt: '求 y=e^x 的二阶导数。', answer: 'y\'\'=e^x', mastery: 5, passed: true, tags: ['基础'] },
  { id: 'q-005', chapter: '第三章 积分', number: 'Q005', status: 'wrong', prompt: '计算 ∫₀¹ x dx。', answer: '1/2', mine: '1', reason: '定积分上下限代入错误。', mastery: 2, passed: false, tags: ['定积分'] },
];

const initialWorkspace = (): Workspace => ({
  version: 3,
  examDate: '2026-12-21',
  phases: [{ name: '一轮', start: '2026-01-01', end: '2026-06-30' }, { name: '二轮', start: '2026-07-01', end: '2026-09-30' }, { name: '冲刺', start: '2026-10-01', end: '2026-12-21' }],
  tasks: [
    { id: 'task-1', title: '整理高等数学第一章错题', subject: '数学', date: today(), completed: false, bucket: 'daily' },
    { id: 'task-2', title: '英语阅读精练 2 篇', subject: '英语', date: today(), completed: false, bucket: 'daily' },
    { id: 'task-3', title: '政治马原知识框架复盘', subject: '政治', date: today(), completed: false, bucket: 'daily' },
    { id: 'task-4', title: '完成专业课章节笔记', subject: '业务课', date: dateOffset(-1), completed: false, bucket: 'daily', due: dateOffset(-1) },
  ],
  focusRecords: [], shelves: ['数学', '英语', '政治', '业务课'], books: [],
  questionBooks: [{ id: 'sample-zhu', title: '张宇一千题基础题', volume: '第一册', subject: '数学', questions: sampleQuestions, overrides: {} }],
  checkins: [dateOffset(-1), dateOffset(-2), dateOffset(-4), dateOffset(-5), dateOffset(-8), dateOffset(-11), dateOffset(-14), dateOffset(-18)], customTags: ['易错', '基础', '链式法则', '定积分'],
});

const uniquePaths = (...paths: (string | undefined)[]) => [...new Set(paths.filter((path): path is string => !!path))];
const managedQuestionBookPaths = (book: QuestionBook) => uniquePaths(...(book.sourcePaths || []), book.sourcePath);
const originalQuestionBookPaths = (book: QuestionBook) => uniquePaths(...(book.originalPaths || []), book.originalPath);
const sharedPath = (left: string[], right: string[]) => left.some((path) => right.includes(path));
const questionKey = (question: Question) => `${question.chapter}\u0000${question.number}`;

function isSameQuestionBook(current: QuestionBook, incoming: QuestionBook) {
  const namedTitle = current.title && current.title !== '未命名题册' && incoming.title && incoming.title !== '未命名题册';
  return (namedTitle && current.title === incoming.title)
    || sharedPath(managedQuestionBookPaths(current), managedQuestionBookPaths(incoming))
    || sharedPath(originalQuestionBookPaths(current), originalQuestionBookPaths(incoming));
}

function mergeQuestionBookRecords(current: QuestionBook, incoming: QuestionBook): QuestionBook {
  const sourcePaths = uniquePaths(...managedQuestionBookPaths(current), ...managedQuestionBookPaths(incoming));
  const originalPaths = uniquePaths(...originalQuestionBookPaths(current), ...originalQuestionBookPaths(incoming));
  const incomingByKey = new Map(incoming.questions.map((question) => [questionKey(question), question]));
  const overrides: QuestionBook['overrides'] = { ...current.overrides };
  const questions = current.questions.map((question) => {
    const replacement = incomingByKey.get(questionKey(question));
    if (!replacement) return question;
    incomingByKey.delete(questionKey(question));
    const override = current.overrides[question.id];
    if (override) overrides[question.id] = override;
    return { ...replacement, id: question.id, ...override };
  });
  for (const question of incomingByKey.values()) questions.push(question);
  return { ...current, title: incoming.title || current.title, subject: incoming.subject || current.subject, sourcePath: sourcePaths[0], originalPath: originalPaths[0], sourcePaths, originalPaths, overrides, questions };
}

function groupQuestionBooks(questionBooks: QuestionBook[]): QuestionBook[] {
  return questionBooks.reduce<QuestionBook[]>((grouped, book) => {
    const normalized = { ...book, sourcePaths: managedQuestionBookPaths(book), originalPaths: originalQuestionBookPaths(book) };
    const index = grouped.findIndex((candidate) => isSameQuestionBook(candidate, normalized));
    if (index < 0) grouped.push(normalized);
    else {
      const existing = grouped[index];
      if (existing) grouped[index] = mergeQuestionBookRecords(existing, normalized);
    }
    return grouped;
  }, []);
}

function normalizeWorkspace(value: unknown): Workspace {
  const base = initialWorkspace();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<Workspace>;
  return { ...base, ...raw, phases: raw.phases?.length ? raw.phases : base.phases, tasks: Array.isArray(raw.tasks) ? raw.tasks : base.tasks, focusRecords: Array.isArray(raw.focusRecords) ? raw.focusRecords : [], shelves: raw.shelves?.length ? raw.shelves : base.shelves, books: Array.isArray(raw.books) ? raw.books : [], questionBooks: Array.isArray(raw.questionBooks) ? groupQuestionBooks(raw.questionBooks) : base.questionBooks, checkins: Array.isArray(raw.checkins) ? raw.checkins : base.checkins, customTags: Array.isArray(raw.customTags) ? raw.customTags : base.customTags };
}

function parseQuestionBook(markdown: string, sourcePath?: string): QuestionBook {
  const frontMatter = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  const frontMatterBody = frontMatter?.[1] || '';
  const field = (name: string) => frontMatterBody.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim() || '';
  if (field('format') !== 'muyujian-question-book/v1') throw new Error('题册格式不匹配：缺少 format: muyujian-question-book/v1');
  const subject = subjects.includes(field('subject') as Subject) ? field('subject') as Subject : '业务课';
  const body = markdown.slice(frontMatter ? frontMatter[0].length : 0);
  let currentChapter = '未分章';
  const questionBlocks = body.split(/^##\s+(?=Q\d+)/m).filter(Boolean);
  const questions = questionBlocks.map((block, index): Question | null => {
    const heading = block.match(/^(Q\d+)/m)?.[1];
    if (!heading) {
      const chapter = block.match(/^#\s+(.+)$/m)?.[1];
      if (chapter) currentChapter = chapter.trim();
      return null;
    }
    const before = body.slice(0, body.indexOf(block));
    const chapters = [...before.matchAll(/^#\s+(.+)$/gm)];
    currentChapter = chapters.length ? chapters[chapters.length - 1]?.[1]?.trim() || currentChapter : currentChapter;
    const section = (name: string) => block.match(new RegExp(`###\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+|$)`))?.[1]?.trim() || '';
    const status = /状态:\s*correct/.test(block) ? 'correct' : 'wrong';
    const tagLine = block.match(/^标签:\s*(.+)$/m)?.[1] || '';
    return { id: uid('question'), chapter: currentChapter, number: heading, status, prompt: normalizeMathMarkdown(section('题干')), answer: normalizeMathMarkdown(section('标准答案')), mine: normalizeMathMarkdown(section('我的答案')) || undefined, reason: normalizeMathMarkdown(section('错误原因')) || undefined, mastery: status === 'wrong' ? 1 : 4, passed: status === 'correct', tags: tagLine.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) };
  }).filter((question): question is Question => !!question);
  if (!questions.length) throw new Error('题册中没有可识别的 ## Q001 格式题目');
  return { id: uid('book'), title: field('book') || '未命名题册', volume: field('volume') || '第一册', subject, sourcePath, sourcePaths: sourcePath ? [sourcePath] : [], questions, overrides: {} };
}

function buildQuestionCanvas(book: QuestionBook): Pick<Note, 'canvasItems' | 'canvasOutline'> {
  const items: CanvasItem[] = [];
  const outline: NonNullable<Note['canvasOutline']> = [];
  const groups = [...new Set(book.questions.map((question) => question.chapter))].map((chapter) => ({ chapter, questions: book.questions.filter((question) => question.chapter === chapter) }));
  items.push({ id: `question-book-${book.id}-title`, type: 'text', x: 280, y: 60, width: 760, height: 92, color: '#1e3a8a', content: `${book.title} · ${book.volume}\n${book.subject} · ${book.questions.length} 道题 · 自动同步自题册 Markdown` });
  let y = 180;
  groups.forEach(({ chapter, questions }, chapterIndex) => {
    const chapterId = `question-book-${book.id}-chapter-${chapterIndex}`;
    items.push({ id: chapterId, type: 'text', x: 280, y, width: 760, height: 70, color: '#2563eb', content: `# ${chapter}\n${questions.length} 道题` });
    outline.push({ label: chapter, itemId: chapterId });
    y += 96;
    let rowHeight = 0;
    questions.forEach((question, index) => {
      if (index > 0) y += rowHeight + 26;
      const status = question.status === 'wrong' ? `错误题${question.passed ? ' · 已通过' : ' · 待复盘'}` : '正确题';
      const content = `${question.number} · ${status}\n\n题干\n${question.prompt || '未提供题干'}\n\n标准答案\n${question.answer || '未提供标准答案'}${question.mine ? `\n\n我的答案\n${question.mine}` : ''}${question.reason ? `\n\n错误原因\n${question.reason}` : ''}${question.tags.length ? `\n\n标签：${question.tags.join('、')}` : ''}`;
      const height = Math.min(680, Math.max(260, 144 + Math.ceil(content.length / 34) * 21));
      rowHeight = Math.max(rowHeight, height);
      items.push({ id: `question-book-${book.id}-question-${question.id}`, type: 'text', x: 280, y, width: 760, height, color: question.status === 'wrong' ? '#991b1b' : '#166534', content });
    });
    y += rowHeight + 42;
  });
  return { canvasItems: items, canvasOutline: outline };
}

function formatDuration(minutes: number): string { return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`; }
function remaining(examDate: string) { const ms = new Date(`${examDate}T00:00:00`).getTime() - Date.now(); return Math.max(0, Math.floor(ms / 86400000)); }

const WorkspaceWallpaperSettings: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resetting, setResetting] = useState(false);
  const { settings, updateSettings } = useSettingsStore();
  const selectWallpaper = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('请选择图片文件。'); return; }
    if (file.size > 8 * 1024 * 1024) { alert('壁纸图片不能超过 8MB。'); return; }
    const reader = new FileReader();
    reader.onload = () => updateSettings({ wallpaper: typeof reader.result === 'string' ? reader.result : undefined });
    reader.onerror = () => alert('壁纸读取失败，请换一张图片后重试。');
    reader.readAsDataURL(file);
  };
  const resetWorkspace = async () => {
    if (resetting) return;
    const confirmation = prompt('初始化会删除当前工作台的便签、附件、计划、题册、书籍、画布、计时记录和工作台内备份，且不可恢复。请输入“初始化”继续：');
    if (confirmation === null) return;
    if (confirmation.trim() !== '初始化') { alert('输入内容不正确，初始化已取消。'); return; }
    setResetting(true);
    try {
      const result = await window.electronAPI?.resetWorkspace();
      if (!result?.success) { alert(`初始化失败：${result?.error || '未知错误'}`); setResetting(false); return; }
      localStorage.removeItem('lingxi-settings');
      window.location.reload();
    } catch (error) {
      setResetting(false);
      alert(`初始化失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return <><section className="panel"><h2>工作台壁纸</h2><p className="muted">上传本地图片作为整个学习工作台的统一背景，图片仅保存于本机设置中。</p><div className="inline-actions"><button onClick={() => inputRef.current?.click()}>上传壁纸</button>{settings.wallpaper && <button onClick={() => updateSettings({ wallpaper: undefined })}>清除壁纸</button>}</div><input ref={inputRef} className="hidden" type="file" accept="image/*" onChange={(event) => { selectWallpaper(event.target.files?.[0]); event.currentTarget.value = ''; }} />{settings.wallpaper && <div className="workspace-wallpaper-preview" style={{ backgroundImage: `url(${settings.wallpaper})` }} aria-label="当前工作台壁纸预览" />}</section><section className="panel reset-panel"><h2>初始化工作台</h2><p className="muted">恢复到刚安装时的状态。会删除当前工作台数据和工作台内的备份文件，保留当前数据目录位置；其他位置的手动备份不会被删除。</p><button className="danger" disabled={resetting} onClick={resetWorkspace}>{resetting ? '正在初始化…' : '初始化全部数据'}</button></section></>;
};

const localFileUrl = (filePath?: string) => {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${normalized.split('/').map((part, index) => index === 0 ? part : encodeURIComponent(part)).join('/')}`;
};

const BookCover: React.FC<{ book: Book; className?: string }> = ({ book, className = '' }) => {
  const coverUrl = localFileUrl(book.coverPath);
  return <div className={`book-cover-visual ${coverUrl ? 'has-cover' : 'fallback'} ${className}`}><span aria-hidden="true">{(book.title || '书').slice(0, 1)}</span>{coverUrl && <img src={coverUrl} alt={`《${book.title || '未命名书籍'}》首页预览`} onError={(event) => { event.currentTarget.dataset.loadState = 'error'; }} />}</div>;
};

const BookInspector: React.FC<{ book?: Book; shelves: string[]; onClose: () => void; onUpdate: (changes: Partial<Book>) => void; onOpen: () => void; onDelete: () => void }> = ({ book, shelves, onClose, onUpdate, onOpen, onDelete }) => {
  if (!book) return <aside className="book-inspector empty" aria-label="书本详情"><div className="book-inspector-empty-icon">⌁</div><h2>选择一本书开始管理</h2><p>导入本地文件后，在这里编辑书目信息、调整阅读进度并直接打开原文件。</p></aside>;
  const openedAt = book.lastOpenedAt ? new Date(book.lastOpenedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '尚未打开';
  return <aside className="book-inspector" aria-label={`管理书本 ${book.title}`}>
    <header className="book-inspector-header"><div><span>书本详情</span><h2>{book.title || '未命名书籍'}</h2></div><button onClick={onClose} title="收起详情面板" aria-label="收起详情面板">×</button></header>
    <div className="book-inspector-cover"><BookCover book={book} /><div><b>{book.progress}%</b><small>当前阅读进度</small></div></div>
    <label>书名<input value={book.title} onChange={(event) => onUpdate({ title: event.target.value })} placeholder="请输入书名" /></label>
    <label>作者或来源<input value={book.author} onChange={(event) => onUpdate({ author: event.target.value })} placeholder="例如：张宇 / 课程讲义" /></label>
    <label>所在书架<select value={book.shelf} onChange={(event) => onUpdate({ shelf: event.target.value })}>{shelves.map((targetShelf) => <option key={targetShelf}>{targetShelf}</option>)}</select></label>
    <section className="book-progress-control"><div><b>阅读进度</b><output>{book.progress}%</output></div><input type="range" min="0" max="100" step="5" value={book.progress} onChange={(event) => onUpdate({ progress: Number(event.target.value) })} aria-label="阅读进度" /><div className="book-progress-actions"><button onClick={() => onUpdate({ progress: Math.max(0, book.progress - 10) })}>− 10%</button><button onClick={() => onUpdate({ progress: Math.min(100, book.progress + 10) })}>+ 10%</button></div></section>
    <section className="book-source-summary"><b>本地文件</b>{book.sourcePath ? <><code title={book.sourcePath}>{book.sourcePath}</code><small>文件首页已作为封面预览 · {openedAt}</small></> : <small>这是旧版手动书目；请移除后重新导入本地文件。</small>}</section>
    <footer>{book.sourcePath && <button className="primary" onClick={onOpen}>打开本地文件</button>}<button className="danger" onClick={onDelete}>从书架移除</button></footer>
  </aside>;
};

const MarkdownContent: React.FC<{ className?: string; source: string }> = ({ className, source }) => <div className={className} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;

const PromptResourcePanel: React.FC<{ title: string; description: string; resource: PromptResource | null; loadingText: string; onCopy: () => void }> = ({ title, description, resource, loadingText, onCopy }) => <section className="panel"><h2>{title}</h2><p className="muted">{description}</p>{resource?.prompt ? <><p className="muted">技能位置：<code>{resource.skillPath}</code><br />提示词位置：<code>{resource.promptPath}</code></p><div className="inline-actions"><button onClick={() => resource.directory && window.electronAPI?.openWorkspacePath(resource.directory)}>打开技能目录</button><button onClick={() => resource.promptPath && window.electronAPI?.openWorkspacePath(resource.promptPath)}>打开提示词文件</button><button onClick={onCopy}>复制 Agent 提示词</button></div><textarea className="agent-prompt" readOnly value={resource.prompt} aria-label={`${title}内容`} /></> : <p className="muted">{resource?.error || loadingText}</p>}</section>;

const WorkbenchItem: React.FC<{ active: boolean; detail: string; note: Note; onDelete: () => void; onOpen: () => void }> = ({ active, detail, note, onDelete, onOpen }) => <div className={`workbench-list-item ${active ? 'active' : ''}`}><button className="workbench-list-select" onClick={onOpen}><strong>{note.title || (note.noteType === 'canvas' ? '未命名画布' : '未命名笔记')}</strong><small>{detail}</small></button><button className="workbench-list-delete" onClick={onDelete} title="移至回收站" aria-label={`删除 ${note.title || '未命名项目'}`}>×</button></div>;

export const StudyWorkbench: React.FC = () => {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace());
  const [view, setView] = useState<'overview' | 'plan' | 'focus' | 'books' | 'questions' | 'notes' | 'canvas' | 'settings'>('overview');
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const [taskTitle, setTaskTitle] = useState(''); const [taskSubject, setTaskSubject] = useState<Subject>('数学');
  const [focusName, setFocusName] = useState('数学复习'); const [focusSubject, setFocusSubject] = useState<Subject>('数学'); const [focusLength, setFocusLength] = useState(25);
  const [activeFocus, setActiveFocus] = useState<{ remaining: number; started: number; paused: boolean } | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null); const [selectedChapter, setSelectedChapter] = useState<string | null>(null); const [questionFilter, setQuestionFilter] = useState<'all' | 'wrong' | 'correct' | 'retry' | 'passed'>('all'); const [questionMode, setQuestionMode] = useState<'canvas' | 'reader'>('canvas'); const questionPanelRef = useRef<HTMLElement | null>(null);
  const [bookShelf, setBookShelf] = useState('数学');
  const [newShelfName, setNewShelfName] = useState(''); const [selectedLibraryBookId, setSelectedLibraryBookId] = useState<string | null>(null); const [bookSearch, setBookSearch] = useState(''); const [bookShelfFilter, setBookShelfFilter] = useState('all'); const [bookSort, setBookSort] = useState<BookSort>('recent');
  const [skillInfo, setSkillInfo] = useState<PromptResource | null>(null);
  const [planSkillInfo, setPlanSkillInfo] = useState<PromptResource | null>(null);
  const [questionExportScope, setQuestionExportScope] = useState<QuestionExportScope>('filtered');
  const [questionExportCount, setQuestionExportCount] = useState(1);
  const [questionExporting, setQuestionExporting] = useState(false);
  const { notes, activeNoteId, addNote, updateNote, deleteNote, setActiveNoteId, loaded: notesLoaded } = useNoteStore();
  const { settings } = useSettingsStore();
  const initializedQuestionCanvases = useRef(false);
  const attemptedBookCoverGeneration = useRef(new Set<string>());
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => { window.electronAPI?.getAppVersion().then((value) => setAppVersion(value)).catch(() => {}); }, []);

  useEffect(() => { (async () => { const content = await window.electronAPI?.getWorkspaceState(); try { const restored = normalizeWorkspace(content ? JSON.parse(content) : null); const yesterday = dateOffset(-1); restored.tasks = restored.tasks.map((task) => !task.completed && task.bucket === 'daily' && task.date === yesterday ? { ...task, date: today(), sourceDate: yesterday } : task); setWorkspace(restored); } catch { setWorkspace(initialWorkspace()); } setLoaded(true); })(); }, []);
  useEffect(() => { if (!loaded) return; const timer = window.setTimeout(() => window.electronAPI?.saveWorkspaceState(JSON.stringify(workspace, null, 2)), 350); return () => window.clearTimeout(timer); }, [workspace, loaded]);
  useEffect(() => { if (!activeFocus || activeFocus.paused) return; const interval = window.setInterval(() => setActiveFocus((current) => current && !current.paused ? { ...current, remaining: Math.max(0, current.remaining - 1) } : current), 1000); return () => window.clearInterval(interval); }, [activeFocus?.paused]);
  useEffect(() => { if (activeFocus?.remaining === 0) finishFocus(); }, [activeFocus?.remaining]);

  const mutate = (fn: (current: Workspace) => Workspace) => setWorkspace((current) => fn(current));
  useEffect(() => {
    if (!loaded) return;
    workspace.books.filter((book) => book.sourcePath && !book.coverPath && !attemptedBookCoverGeneration.current.has(book.id)).forEach((book) => {
      attemptedBookCoverGeneration.current.add(book.id);
      window.electronAPI?.generateBookCover(book.sourcePath!).then((result) => {
        if (!result?.success || !result.coverPath) return;
        mutate((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, coverPath: result.coverPath } : item) }));
      });
    });
  }, [loaded, workspace.books]);
  const checkedIn = workspace.checkins.includes(today());
  const dailyTasks = workspace.tasks.filter((task) => task.bucket === 'daily' && task.date === today());
  const overdue = workspace.tasks.filter((task) => !task.completed && task.bucket === 'daily' && task.date < today());
  const retryCount = workspace.questionBooks.flatMap((book) => book.questions).filter((question) => question.status === 'wrong' && question.mastery < 3 && !question.passed).length;
  const totalFocus = workspace.focusRecords.reduce((sum, record) => sum + record.minutes, 0);
  const weekFocus = workspace.focusRecords.filter((record) => record.date >= dateOffset(-6)).reduce((sum, record) => sum + record.minutes, 0);
  const currentPhase = workspace.phases.find((phase) => phase.start <= today() && phase.end >= today())?.name || '自定义阶段';
  const activeQuestionBook = workspace.questionBooks.find((book) => book.id === selectedBook) || workspace.questionBooks[0];
  useEffect(() => { setSelectedChapter(null); }, [activeQuestionBook?.id]);
  const selectedLibraryBook = selectedLibraryBookId ? workspace.books.find((book) => book.id === selectedLibraryBookId) : undefined;
  const visibleBooks = useMemo(() => workspace.books.filter((book) => {
    const query = bookSearch.trim().toLocaleLowerCase();
    const matchesShelf = bookShelfFilter === 'all' || book.shelf === bookShelfFilter;
    return matchesShelf && (!query || `${book.title} ${book.author} ${book.shelf}`.toLocaleLowerCase().includes(query));
  }).sort((left, right) => {
    if (bookSort === 'title') return left.title.localeCompare(right.title, 'zh-CN');
    if (bookSort === 'progress') return right.progress - left.progress || left.title.localeCompare(right.title, 'zh-CN');
    return (right.lastOpenedAt || 0) - (left.lastOpenedAt || 0) || left.title.localeCompare(right.title, 'zh-CN');
  }), [workspace.books, bookSearch, bookShelfFilter, bookSort]);
  const activeShelfName = bookShelfFilter === 'all' ? '全部书籍' : bookShelfFilter;
  const workbenchNotes = notes.filter((note) => note.noteType === 'note' && !note.isDeleted && !note.isArchived);
  const workbenchCanvases = notes.filter((note) => note.noteType === 'canvas' && !note.isDeleted && !note.isArchived);
  const selectedCanvas = workbenchCanvases.find((note) => note.id === activeNoteId) || workbenchCanvases[0];

  const syncQuestionCanvas = (book: QuestionBook): string => {
    const canvasId = book.canvasId || uid('question-canvas');
    const canvasBook = { ...book, canvasId };
    const title = `${book.title} · ${new Set(book.questions.map((question) => question.chapter)).size} 个章节 · 题册画布`;
    const payload = buildQuestionCanvas(canvasBook);
    const existing = notes.find((note) => note.id === canvasId);
    if (existing) updateNote(canvasId, { title, tags: ['学习工作台', '题册画布', book.subject], isDeleted: false, deletedAt: undefined, ...payload });
    else {
      const now = Date.now();
      addNote({ id: canvasId, title, content: '', tags: ['学习工作台', '题册画布', book.subject], createdAt: now, updatedAt: now, isTodayPlan: false, noteType: 'canvas', isArchived: false, canvasLinks: [], ...payload });
    }
    return canvasId;
  };

  useEffect(() => {
    if (!loaded || !notesLoaded || initializedQuestionCanvases.current) return;
    initializedQuestionCanvases.current = true;
    const missing = workspace.questionBooks.filter((book) => !book.canvasId);
    if (!missing.length) return;
    const canvasIds = new Map(missing.map((book) => [book.id, syncQuestionCanvas(book)]));
    setWorkspace((current) => ({ ...current, questionBooks: current.questionBooks.map((book) => canvasIds.has(book.id) ? { ...book, canvasId: canvasIds.get(book.id) } : book) }));
  }, [loaded, notesLoaded]);

  useEffect(() => {
    if (view === 'notes' && workbenchNotes.length && !workbenchNotes.some((note) => note.id === activeNoteId)) { const first = workbenchNotes[0]; if (first) setActiveNoteId(first.id); }
  }, [view, workbenchNotes, activeNoteId, setActiveNoteId]);

  useEffect(() => {
    if (view === 'canvas' && workbenchCanvases.length && !workbenchCanvases.some((canvas) => canvas.id === activeNoteId)) { const first = workbenchCanvases[0]; if (first) setActiveNoteId(first.id); }
  }, [view, workbenchCanvases, activeNoteId, setActiveNoteId]);

  useEffect(() => {
    const openCanvas = (event: Event) => {
      const canvasId = (event as CustomEvent<string>).detail;
      setView('canvas');
      if (canvasId) setActiveNoteId(canvasId);
      if (canvasId && window.__muyujianPendingCanvasId === canvasId) delete window.__muyujianPendingCanvasId;
    };
    window.addEventListener('muyujian:open-canvas', openCanvas);
    if (window.__muyujianPendingCanvasId) {
      openCanvas(new CustomEvent('muyujian:open-canvas', { detail: window.__muyujianPendingCanvasId }));
      delete window.__muyujianPendingCanvasId;
    }
    return () => window.removeEventListener('muyujian:open-canvas', openCanvas);
  }, [setActiveNoteId]);

  useEffect(() => {
    if (view !== 'settings') return;
    if (!skillInfo) window.electronAPI?.getQuestionBookSkill().then((result) => result?.success ? setSkillInfo(result) : setSkillInfo({ error: `无法读取题册整理技能：${result?.error || '未知错误'}` }));
    if (!planSkillInfo) window.electronAPI?.getPlanImportSkill().then((result) => result?.success ? setPlanSkillInfo(result) : setPlanSkillInfo({ error: `无法读取计划整理技能：${result?.error || '未知错误'}` }));
  }, [view, skillInfo, planSkillInfo]);

  const addTask = () => { if (!taskTitle.trim()) return; mutate((current) => ({ ...current, tasks: [...current.tasks, { id: uid('task'), title: taskTitle.trim(), subject: taskSubject, date: today(), completed: false, bucket: 'daily' }] })); setTaskTitle(''); };
  const toggleTask = (id: string) => mutate((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task), checkins: checkedIn ? current.checkins : [...current.checkins, today()] }));
  const postponeOverdue = () => mutate((current) => ({ ...current, tasks: current.tasks.map((task) => !task.completed && task.bucket === 'daily' && task.date < today() ? { ...task, date: today(), sourceDate: task.date } : task) }));
  const ignoreTask = (id: string) => mutate((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, bucket: 'ignored' } : task) }));
  const finishFocus = () => { if (!activeFocus) return; const minutes = Math.max(1, Math.round((focusLength * 60 - activeFocus.remaining) / 60)); mutate((current) => ({ ...current, focusRecords: [...current.focusRecords, { id: uid('focus'), taskName: focusName, subject: focusSubject, date: today(), minutes, completed: activeFocus.remaining === 0 }], checkins: checkedIn ? current.checkins : [...current.checkins, today()] })); setActiveFocus(null); window.electronAPI?.notifyWorkspace('暮雨笺专注完成', `${focusName} 已记录 ${minutes} 分钟`); };
  const addShelf = () => { const name = newShelfName.trim(); if (!name) { setNotice('请输入书架分组名称。'); return; } if (workspace.shelves.includes(name)) { setNotice('该书架分组已存在。'); return; } mutate((current) => ({ ...current, shelves: [...current.shelves, name] })); setNewShelfName(''); setBookShelf(name); setBookShelfFilter(name); setNotice(`已新建「${name}」书架。`); };
  const selectShelf = (shelf: string) => { setBookShelfFilter(shelf); if (shelf !== 'all') setBookShelf(shelf); };
  const selectLibraryBook = (id: string) => setSelectedLibraryBookId(id);
  const addBook = (sourcePath: string, fallbackTitle?: string, originalPath?: string, coverPath?: string) => { const title = fallbackTitle || '未命名书籍'; const shelf = bookShelfFilter === 'all' ? bookShelf : bookShelfFilter; const id = uid('book'); mutate((current) => ({ ...current, books: [...current.books, { id, title, author: '', shelf, sourcePath, originalPath, coverPath, progress: 0, noteIds: [], questionBookIds: [] }] })); setBookShelf(shelf); setBookShelfFilter(shelf); selectLibraryBook(id); setNotice(`已导入「${title}」，封面来自本地文件首页。`); };
  const updateBook = (id: string, changes: Partial<Book>) => mutate((current) => ({ ...current, books: current.books.map((book) => book.id === id ? { ...book, ...changes } : book) }));
  const openBookFile = (book: Book) => { if (!book.sourcePath) return; window.electronAPI?.openWorkspacePath(book.sourcePath); updateBook(book.id, { lastOpenedAt: Date.now() }); };
  const deleteBook = (id: string) => { const book = workspace.books.find((item) => item.id === id); if (!book || !confirm(`确定从书架移除「${book.title || '未命名书籍'}」吗？原始文件不会被删除。`)) return; mutate((current) => ({ ...current, books: current.books.filter((item) => item.id !== id) })); if (selectedLibraryBookId === id) setSelectedLibraryBookId(null); setNotice('已从书架移除书本记录，原始文件不会被删除。'); };
  const importBook = async () => { const result = await window.electronAPI?.chooseBook(); if (result?.path) { addBook(result.path, result.name?.replace(/\.[^.]+$/, ''), result.originalPath, result.coverPath); if (result.coverError) setNotice(`已导入「${result.name?.replace(/\.[^.]+$/, '') || '未命名书籍'}」，但暂时无法生成首页封面：${result.coverError}`); } };
  const applyQuestionBook = (book: QuestionBook, select = false) => {
    const withCanvas = { ...book, canvasId: book.canvasId || uid('question-canvas') };
    syncQuestionCanvas(withCanvas);
    mutate((current) => ({ ...current, questionBooks: current.questionBooks.some((item) => item.id === withCanvas.id) ? current.questionBooks.map((item) => item.id === withCanvas.id ? withCanvas : item) : [...current.questionBooks, withCanvas] }));
    if (select) setSelectedBook(withCanvas.id);
    return withCanvas;
  };
  const mergeQuestionBook = mergeQuestionBookRecords;
  const importQuestionBook = async () => {
    try {
      const result = await window.electronAPI?.chooseQuestionBook();
      if (!result?.content) return;
      const incoming = { ...parseQuestionBook(result.content, result.folder), originalPath: result.originalFolder, originalPaths: result.originalFolder ? [result.originalFolder] : [] };
      const existing = workspace.questionBooks.find((item) => isSameQuestionBook(item, incoming));
      applyQuestionBook(existing ? mergeQuestionBook(existing, incoming) : incoming, true);
      setNotice(existing ? '已合并到同名题册，章节、题目和已有复习记录均已保留。' : '题册已导入为托管副本，并已同步生成题册画布与章节定位。');
    } catch (error: any) { alert(`导入失败：${error.message}`); }
  };
  const addManualQuestion = () => {
    if (!activeQuestionBook) return;
    const promptText = prompt('题干');
    if (!promptText?.trim()) return;
    const answer = prompt('标准答案') || '待补充';
    const reason = prompt('错误原因（可留空）') || undefined;
    const question: Question = { id: uid('question'), chapter: prompt('章节名称', '手动录入') || '手动录入', number: `Q${String(activeQuestionBook.questions.length + 1).padStart(3, '0')}`, status: 'wrong', prompt: promptText.trim(), answer, mine: prompt('我的答案') || undefined, reason, mastery: 1, passed: false, tags: [] };
    applyQuestionBook({ ...activeQuestionBook, questions: [...activeQuestionBook.questions, question] });
  };
  const refreshActiveBook = async () => {
    if (!activeQuestionBook) return;
    const sourcePaths = managedQuestionBookPaths(activeQuestionBook);
    if (!sourcePaths.length) { alert('此题册没有可刷新的托管目录。请先通过“导入题册 Markdown”导入。'); return; }
    try {
      let refreshed = activeQuestionBook;
      for (const sourcePath of sourcePaths) {
        const result = await window.electronAPI?.readQuestionBook(sourcePath);
        if (!result?.content) throw new Error(result?.error || '题册文件不存在');
        refreshed = mergeQuestionBook(refreshed, parseQuestionBook(result.content, result.folder));
      }
      applyQuestionBook(refreshed);
      setNotice(`已刷新 ${sourcePaths.length} 个题册章节文件，题册画布与章节索引已同步更新。`);
    } catch (error: any) { alert(`刷新失败：${error.message}`); }
  };
  const updateQuestion = (questionId: string, update: Partial<Question>) => {
    if (!activeQuestionBook) return;
    const questions = activeQuestionBook.questions.map((question) => question.id === questionId ? { ...question, ...update } : question);
    applyQuestionBook({ ...activeQuestionBook, questions, overrides: { ...activeQuestionBook.overrides, [questionId]: { ...activeQuestionBook.overrides[questionId], ...update } as Pick<Question, 'mastery' | 'passed' | 'tags'> } });
  };
  const addQuestionTag = (question: Question) => { const tag = prompt('重点标签名称'); if (!tag?.trim() || question.tags.includes(tag.trim())) return; updateQuestion(question.id, { tags: [...question.tags, tag.trim()] }); mutate((current) => ({ ...current, customTags: current.customTags.includes(tag.trim()) ? current.customTags : [...current.customTags, tag.trim()] })); };
  const exportTagBook = (tag: string) => { if (!activeQuestionBook) return; const questions = activeQuestionBook.questions.filter((question) => question.tags.includes(tag)); if (!questions.length) return; const title = `${activeQuestionBook.title} · ${tag}`; applyQuestionBook({ ...activeQuestionBook, id: uid('tagbook'), title, sourcePath: undefined, originalPath: undefined, canvasId: undefined, questions: questions.map((question) => ({ ...question, id: uid('question') })), overrides: {} }, true); setNotice(`已从「${tag}」生成新题册及其题册画布。`); };
  const importPlan = (file: File) => file.text().then((content) => { const parsedTasks = parseMarkdownTasks(content); if (!parsedTasks.length) throw new Error('未找到 Markdown 任务清单'); const tasks = parsedTasks.map((task) => ({ id: uid('plan'), title: task.title, subject: '数学' as Subject, date: today(), completed: task.completed, bucket: 'daily' as TaskBucket })); mutate((current) => ({ ...current, tasks: [...current.tasks, ...tasks] })); setNotice(`已从计划文件导入 ${tasks.length} 项任务，其中 ${tasks.filter((task) => task.completed).length} 项已完成。`); }).catch((error) => alert(`计划导入失败：${error instanceof Error ? error.message : String(error)}`));
  const exportCheckin = () => { const done = dailyTasks.filter((task) => task.completed).length; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="100%" height="100%" fill="#eff6ff"/><rect x="56" y="52" width="1088" height="526" rx="28" fill="white"/><text x="110" y="150" font-family="Segoe UI, Microsoft YaHei" font-size="46" font-weight="700" fill="#1e3a8a">暮雨笺 · 今日学习打卡</text><text x="110" y="225" font-family="monospace" font-size="30" fill="#2563eb">${today()}</text><text x="110" y="335" font-family="Segoe UI, Microsoft YaHei" font-size="74" font-weight="700" fill="#0f172a">${formatDuration(totalFocus)}</text><text x="110" y="385" font-family="Segoe UI, Microsoft YaHei" font-size="26" fill="#64748b">累计专注时长 · 今日任务 ${done}/${dailyTasks.length}</text><circle cx="980" cy="330" r="115" fill="none" stroke="#dbeafe" stroke-width="25"/><circle cx="980" cy="330" r="115" fill="none" stroke="#10b981" stroke-width="25" stroke-linecap="round" stroke-dasharray="${Math.max(1, (dailyTasks.length ? done / dailyTasks.length : 0) * 723)} 723" transform="rotate(-90 980 330)"/></svg>`; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); link.download = `暮雨笺打卡-${today()}.svg`; link.click(); URL.revokeObjectURL(link.href); };
  const createWorkbenchNote = () => { const title = prompt('笔记标题', '新学习笔记'); if (title === null) return; const now = Date.now(); const note: Note = { id: generateId(), title: title.trim() || '新学习笔记', content: '# 学习笔记\n\n', tags: ['学习工作台'], createdAt: now, updatedAt: now, isTodayPlan: false, noteType: 'note', isArchived: false }; addNote(note); setActiveNoteId(note.id); };
  const createWorkbenchCanvas = () => { const now = Date.now(); const canvas: Note = { id: generateId(), title: `新建画布 ${new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, content: '', tags: ['学习工作台'], createdAt: now, updatedAt: now, isTodayPlan: false, noteType: 'canvas', isArchived: false, canvasItems: [], canvasLinks: [] }; addNote(canvas); setActiveNoteId(canvas.id); setView('canvas'); setNotice('已新建空白画布，可直接在画布顶部修改名称。'); };
  const openQuestionCanvas = () => { if (!activeQuestionBook) return; const withCanvas = applyQuestionBook(activeQuestionBook); setActiveNoteId(withCanvas.canvasId!); setView('canvas'); };
  const copyAgentPrompt = () => { if (!skillInfo?.prompt) return; navigator.clipboard.writeText(skillInfo.prompt).then(() => setNotice('已复制 Agent 提示词。')).catch(() => alert('复制失败，请在下方文本框中手动复制。')); };
  const copyPlanAgentPrompt = () => { if (!planSkillInfo?.prompt) return; navigator.clipboard.writeText(planSkillInfo.prompt).then(() => setNotice('已复制计划整理 Agent 提示词。')).catch(() => alert('复制失败，请在下方文本框中手动复制。')); };

  const filteredQuestions = activeQuestionBook?.questions.filter((question) => questionFilter === 'all' || question.status === questionFilter || (questionFilter === 'retry' && question.status === 'wrong' && question.mastery < 3 && !question.passed) || (questionFilter === 'passed' && question.passed)) || [];
  const chapters = [...new Set(activeQuestionBook?.questions.map((question) => question.chapter) || [])];
  const activeChapter = selectedChapter && chapters.includes(selectedChapter) ? selectedChapter : chapters[0];
  const questionExportCandidates = activeQuestionBook ? questionExportScope === 'all' ? activeQuestionBook.questions : questionExportScope === 'chapter' ? filteredQuestions.filter((question) => question.chapter === activeChapter) : filteredQuestions : [];
  useEffect(() => {
    if (questionExportCandidates.length && questionExportCount > questionExportCandidates.length) setQuestionExportCount(questionExportCandidates.length);
  }, [questionExportCandidates.length, questionExportCount]);
  const exportQuestionBookPdf = async () => {
    if (!activeQuestionBook) return;
    const selected = selectQuestionExportItems(activeQuestionBook, filteredQuestions, questionExportScope, activeChapter, questionExportCount);
    if (!selected.length) { setNotice('请先选择有效的导出题目数量。'); return; }
    setQuestionExporting(true);
    try {
      const title = `${sanitizeExportFileName(activeQuestionBook.title)}-${questionExportScope === 'all' ? '全部' : questionExportScope === 'chapter' ? sanitizeExportFileName(activeChapter || '当前章节') : '当前筛选'}-${selected.length}题`;
      const result = await window.electronAPI?.exportPdf(title, renderQuestionBookMarkdown(activeQuestionBook, selected, title));
      if (result?.success) setNotice(`已导出 ${selected.length} 题 PDF：${result.path}`);
      else if (result?.error !== 'cancelled') setNotice(`题册 PDF 导出失败：${result?.error || '未知错误'}`);
    } finally { setQuestionExporting(false); }
  };
  useEffect(() => {
    if (view !== 'questions' || !activeChapter) return;
    questionPanelRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [view, activeChapter]);
  const nav = [['overview', '总览'], ['plan', '规划'], ['focus', '专注'], ['books', '书架'], ['questions', '题册'], ['notes', '笔记'], ['canvas', '画布'], ['settings', '设置']] as const;

  if (!loaded) return <div className="study-loading">正在加载学习工作台…</div>;
  return <div className={`study-shell ${settings.wallpaper ? 'has-workspace-wallpaper' : ''}`} style={settings.wallpaper ? { backgroundImage: `linear-gradient(rgba(247,250,255,.56), rgba(247,250,255,.56)), url("${settings.wallpaper}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : undefined}>
    <aside className="study-nav"><div className="study-brand"><span>暮雨笺</span><small>学习工作台</small></div>{nav.map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}<div className="study-nav-foot">{appVersion ? `v${appVersion} · 本地优先` : '本地优先'}</div></aside>
    <main className="study-main">
      <header className="study-header"><div><h1>{nav.find(([id]) => id === view)?.[1]}</h1><p>{view === 'overview' ? '考研冲刺工作台' : '所有内容仅保存在本机工作台目录'}</p></div><div className="study-header-actions"><button onClick={() => setView('settings')} title="配置 AI 接口和其他应用设置">AI 设置</button><button onClick={() => window.electronAPI?.backupWorkspace().then((result) => setNotice(result?.success ? `已导出综合备份：${result.path}` : '已取消备份'))}>导出综合备份</button><button onClick={() => { if (confirm('恢复备份会覆盖同名工作台文件，继续？')) window.electronAPI?.restoreWorkspace().then((result) => { if (result?.success) window.location.reload(); else if (result?.error !== 'cancelled') alert(`恢复失败：${result?.error}`); }); }}>导入恢复</button></div></header>
      {workspace.tasks.length + workspace.books.length + workspace.questionBooks.length >= 30 && <div className="study-notice">工作台内容已超过 30 条，建议现在导出一次综合备份。<button onClick={() => setNotice('')}>×</button></div>}
      {notice && <div className="study-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {view === 'overview' && <section className="study-page">
        <div className="countdown-card"><span>距离考研</span><strong>{remaining(workspace.examDate)}</strong><b>天</b><p>{workspace.examDate} · 当前 {currentPhase}</p><button onClick={() => setView('plan')}>调整计划</button></div>
        <div className="study-grid three"><section className="panel"><h2>今天要处理</h2>{overdue.length > 0 && <button className="alert-row" onClick={postponeOverdue}>逾期任务 {overdue.length} 项 · 顺延至今天</button>}<button className="queue-row" onClick={() => setView('plan')}>未完成待办 {dailyTasks.filter((task) => !task.completed).length} 项</button><button className="queue-row" onClick={() => { setView('questions'); setQuestionFilter('retry'); }}>待重做错题 {retryCount} 道</button></section><section className="panel"><h2>科目概览</h2>{subjects.map((subject) => <div className="subject-line" key={subject}><b>{subject}</b><span>{currentPhase}</span><small>{formatDuration(workspace.focusRecords.filter((record) => record.subject === subject && record.date >= dateOffset(-6)).reduce((sum, record) => sum + record.minutes, 0))} · {workspace.focusRecords.filter((record) => record.subject === subject && record.date >= dateOffset(-6)).length} 次</small></div>)}</section><section className="panel"><h2>本月打卡</h2><div className="heatmap">{Array.from({ length: 35 }, (_, index) => { const date = dateOffset(index - 34); return <i key={date} className={workspace.checkins.includes(date) ? 'done' : ''} title={date} />; })}</div><p className="muted">已打卡 {workspace.checkins.length} 天 · 本周 {formatDuration(weekFocus)}</p></section></div>
        <section className="panel today-list"><div className="panel-heading"><h2>今日任务</h2><button onClick={() => setView('plan')}>管理</button></div>{dailyTasks.map((task) => <label key={task.id} className={task.completed ? 'task done' : 'task'}><input type="checkbox" checked={task.completed} onChange={() => toggleTask(task.id)} /><span>{task.title}{task.sourceDate && <em>昨天未完成</em>}</span><small>{task.subject}</small></label>)}</section>
      </section>}
      {view === 'plan' && <section className="study-page"><div className="study-grid two"><section className="panel"><h2>每日任务</h2><div className="inline-form"><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="添加今日任务" /><select value={taskSubject} onChange={(event) => setTaskSubject(event.target.value as Subject)}>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select><button onClick={addTask}>添加</button></div>{[...dailyTasks, ...overdue].map((task) => <div className="task-row" key={task.id}><label><input type="checkbox" checked={task.completed} onChange={() => toggleTask(task.id)} />{task.title}</label><span>{task.date < today() ? '逾期' : task.subject}</span><button title="暂时忽略，移入月综合任务" onClick={() => ignoreTask(task.id)}>暂缓</button></div>)}</section><section className="panel"><h2>计划文件</h2><p className="muted">导入 Markdown 任务清单；支持以 <code>- [ ] 任务名称</code> 编写，也支持 <code>- [x] 已完成任务</code>。</p><div className="inline-actions"><label className="file-button">导入计划文件<input type="file" accept=".md,.markdown,.txt" hidden onChange={(event) => { if (event.target.files?.[0]) importPlan(event.target.files[0]); event.currentTarget.value = ''; }} /></label><button onClick={() => setView('settings')}>查看整理提示词</button></div><h3>月综合任务</h3>{(['monthly', 'ignored', 'backlog'] as TaskBucket[]).map((bucket) => <div className="bucket" key={bucket}><b>{{ monthly: '月计划与总结', ignored: '暂时忽略', backlog: '积压任务', daily: '' }[bucket]}</b>{workspace.tasks.filter((task) => task.bucket === bucket).map((task) => <p key={task.id}>{task.title}</p>)}</div>)}</section></div><section className="panel phases"><h2>考研日期与阶段</h2><label>考试日期<input type="date" value={workspace.examDate} onChange={(event) => mutate((current) => ({ ...current, examDate: event.target.value }))} /></label>{workspace.phases.map((phase, index) => <div className="phase-row" key={phase.name}><input value={phase.name} onChange={(event) => mutate((current) => ({ ...current, phases: current.phases.map((item, position) => position === index ? { ...item, name: event.target.value } : item) }))} /><input type="date" value={phase.start} onChange={(event) => mutate((current) => ({ ...current, phases: current.phases.map((item, position) => position === index ? { ...item, start: event.target.value } : item) }))} /><input type="date" value={phase.end} onChange={(event) => mutate((current) => ({ ...current, phases: current.phases.map((item, position) => position === index ? { ...item, end: event.target.value } : item) }))} /></div>)}</section></section>}
      {view === 'focus' && <section className="study-page focus-page"><section className="focus-card"><span>{activeFocus?.paused ? '已暂停' : activeFocus ? '专注中' : '准备开始'}</span><strong>{String(Math.floor((activeFocus?.remaining ?? focusLength * 60) / 60)).padStart(2, '0')}:{String((activeFocus?.remaining ?? focusLength * 60) % 60).padStart(2, '0')}</strong><div className="focus-controls">{!activeFocus ? <button className="primary" onClick={() => setActiveFocus({ remaining: focusLength * 60, started: Date.now(), paused: false })}>开始计时</button> : <><button onClick={() => setActiveFocus({ ...activeFocus, paused: !activeFocus.paused })}>{activeFocus.paused ? '继续' : '暂停'}</button><button className="danger" onClick={finishFocus}>结束并记录</button></>}</div></section><section className="panel"><h2>专注设置</h2><div className="inline-form"><input value={focusName} onChange={(event) => setFocusName(event.target.value)} placeholder="当前任务名称" /><select value={focusSubject} onChange={(event) => setFocusSubject(event.target.value as Subject)}>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select><input type="number" min="1" max="240" value={focusLength} onChange={(event) => setFocusLength(Number(event.target.value) || 25)} /></div><p className="muted">默认 25 分钟；完成时发送 Windows 通知。休息建议：短休 5 分钟，长休 15 分钟。</p></section><section className="study-grid two"><section className="panel"><h2>学习统计</h2><div className="big-number">{formatDuration(totalFocus)}<small>累计学习时长</small></div>{subjects.map((subject) => { const minutes = workspace.focusRecords.filter((record) => record.subject === subject).reduce((sum, record) => sum + record.minutes, 0); return <div className="bar-row" key={subject}><span>{subject}</span><i><b style={{ width: `${totalFocus ? minutes / totalFocus * 100 : 0}%` }} /></i><small>{formatDuration(minutes)}</small></div>; })}</section><section className="panel"><h2>打卡图片</h2><p className="muted">包含日期、任务完成数、学习时长与完成环。</p><button className="primary" onClick={exportCheckin}>导出今日打卡图片</button></section></section></section>}
      {view === 'books' && <section className="study-page bookshelf-page"><div className="bookshelf-layout"><section className="bookshelf-catalog"><section className="bookshelf-hero"><div><span className="bookshelf-eyebrow">本地学习资料库</span><h2>我的书架</h2><p>仅导入本地文件；文件首页自动生成封面，方便检索、续读和整理。</p></div><div className="bookshelf-hero-stats"><b>{workspace.books.length}</b><span>本书籍</span><i /> <b>{workspace.shelves.length}</b><span>个书架</span></div><div className="bookshelf-hero-actions"><button className="primary" onClick={importBook}>导入本地文件</button></div></section><section className="bookshelf-controls"><div className="bookshelf-search"><span>⌕</span><input value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="搜索书名、作者或书架" aria-label="搜索书架" /></div><select value={bookSort} onChange={(event) => setBookSort(event.target.value as BookSort)} aria-label="书籍排序"><option value="recent">最近打开</option><option value="progress">阅读进度</option><option value="title">书名排序</option></select></section><div className="shelf-filter-row" aria-label="书架筛选"><button className={bookShelfFilter === 'all' ? 'active' : ''} onClick={() => selectShelf('all')}>全部 <span>{workspace.books.length}</span></button>{workspace.shelves.map((shelf) => <button key={shelf} className={bookShelfFilter === shelf ? 'active' : ''} onClick={() => selectShelf(shelf)}>{shelf} <span>{workspace.books.filter((book) => book.shelf === shelf).length}</span></button>)}<details className="shelf-create-menu"><summary>+ 新书架</summary><div><input value={newShelfName} onChange={(event) => setNewShelfName(event.target.value)} placeholder="书架名称" onKeyDown={(event) => { if (event.key === 'Enter') addShelf(); }} /><button onClick={addShelf}>创建</button></div></details></div><div className="bookshelf-results-heading"><div><h2>{activeShelfName}</h2><span>{bookSearch.trim() ? `找到 ${visibleBooks.length} 本` : `${visibleBooks.length} 本书`}</span></div></div><div className="book-grid book-grid-modern">{visibleBooks.map((book) => <article className={`book-card book-card-modern ${selectedLibraryBookId === book.id ? 'active' : ''}`} key={book.id} tabIndex={0} role="button" aria-pressed={selectedLibraryBookId === book.id} aria-label={`查看书本 ${book.title}`} onClick={() => selectLibraryBook(book.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLibraryBook(book.id); } }}><div className="book-cover"><BookCover book={book} /><em>{book.shelf}</em></div><div className="book-card-content"><strong>{book.title || '未命名书籍'}</strong><span>{book.author || '未填写作者或来源'}</span><div className="book-progress-line"><i><b style={{ width: `${book.progress}%` }} /></i><small>{book.progress}%</small></div><div className="book-card-meta"><small>{book.sourcePath ? '本地文件' : '旧版手动书目'}</small>{book.lastOpenedAt && <small>最近打开</small>}</div></div></article>)}<button className="book-add book-import-modern" onClick={importBook} title="导入本地文件" aria-label="导入本地文件"><span>+</span><b>导入本地文件</b><small>支持 PDF、EPUB、DOCX、TXT 等</small></button></div>{visibleBooks.length === 0 && <div className="bookshelf-empty"><b>{bookSearch.trim() ? '没有匹配的书籍' : '这个书架还是空的'}</b><p>{bookSearch.trim() ? '试试更换关键词或切换书架。' : '从本机导入一份学习文件后，它的首页会成为书架封面。'}</p><button className="primary" onClick={bookSearch.trim() ? () => setBookSearch('') : importBook}>{bookSearch.trim() ? '清除搜索' : '导入本地文件'}</button></div>}</section><BookInspector book={selectedLibraryBook} shelves={workspace.shelves} onClose={() => setSelectedLibraryBookId(null)} onUpdate={(changes) => selectedLibraryBook && updateBook(selectedLibraryBook.id, changes)} onOpen={() => selectedLibraryBook && openBookFile(selectedLibraryBook)} onDelete={() => selectedLibraryBook && deleteBook(selectedLibraryBook.id)} /></div></section>}
      {view === 'questions' && <section className="study-page question-page">
        <section className="panel question-toolbar"><div><h2>题册与错题整理</h2><select value={activeQuestionBook?.id || ''} onChange={(event) => setSelectedBook(event.target.value)}>{workspace.questionBooks.map((book) => <option value={book.id} key={book.id}>{book.title} · {new Set(book.questions.map((question) => question.chapter)).size} 个章节</option>)}</select></div><div><button onClick={importQuestionBook}>导入题册 Markdown</button><button onClick={addManualQuestion}>手动添加错题</button><button onClick={refreshActiveBook}>刷新整理文件</button><button onClick={openQuestionCanvas}>打开题册画布</button><button onClick={() => setQuestionMode(questionMode === 'canvas' ? 'reader' : 'canvas')}>{questionMode === 'canvas' ? '连续阅读' : '画布式阅读'}</button></div></section>
        <section className="panel question-export-panel"><strong>导出题册 PDF</strong><label>范围<select value={questionExportScope} onChange={(event) => setQuestionExportScope(event.target.value as QuestionExportScope)}><option value="filtered">当前筛选</option><option value="chapter">当前章节（当前筛选）</option><option value="all">全部题目</option></select></label><label>题数<input type="number" min="1" max={Math.max(1, questionExportCandidates.length)} value={questionExportCount} onChange={(event) => setQuestionExportCount(Number(event.target.value))} /></label><small>可导出 {questionExportCandidates.length} 题</small><button type="button" onClick={() => setQuestionExportCount(questionExportCandidates.length)} disabled={!questionExportCandidates.length}>全部</button><button className="primary" disabled={questionExporting || !questionExportCandidates.length} onClick={exportQuestionBookPdf}>{questionExporting ? '正在导出…' : '导出 PDF'}</button></section>
        <div className="question-layout"><aside className="question-tree" aria-label="章节目录"><b>{activeQuestionBook?.title}</b>{chapters.map((chapter) => <button key={chapter} className={activeChapter === chapter ? 'active' : ''} aria-current={activeChapter === chapter ? 'page' : undefined} onClick={() => setSelectedChapter(chapter)}>{chapter}<small>{activeQuestionBook?.questions.filter((question) => question.chapter === chapter).length}</small></button>)}</aside>
          <section ref={questionPanelRef} className={questionMode === 'canvas' ? 'question-canvas' : 'question-reader'} aria-live="polite"><div className="question-filters">{([['all', '全部'], ['wrong', '错误题'], ['correct', '正确题'], ['retry', '待重做'], ['passed', '已通过']] as const).map(([id, label]) => <button className={questionFilter === id ? 'active' : ''} onClick={() => setQuestionFilter(id)} key={id}>{label}</button>)}</div>
            {activeChapter && <div className="question-chapter" key={activeChapter}><h2>{activeChapter}</h2><div className="question-cards">{filteredQuestions.filter((question) => question.chapter === activeChapter).map((question) => <article className="question-card" key={question.id}><div className="question-tags">{question.status === 'wrong' ? <span className="wrong">错误题</span> : <span className="correct">正确题</span>}{question.tags.map((tag) => <button key={tag} onClick={() => exportTagBook(tag)} title="导出此标签题册">{tag}</button>)}<button onClick={() => addQuestionTag(question)} title="添加重点标签">+标签</button></div><h3>{question.number}</h3><MarkdownContent className="question-prompt" source={question.prompt || '未提供题干'} /><details><summary>查看标准答案</summary><MarkdownContent className="question-answer" source={question.answer || '未提供标准答案'} />{question.mine && <><b>我的答案：</b><MarkdownContent className="question-answer" source={question.mine} /></>}{question.reason && <><b>错误原因：</b><MarkdownContent className="question-answer" source={question.reason} /></>}</details><div className="question-footer"><span>{Array.from({ length: 5 }, (_, star) => <button className={star < question.mastery ? 'star on' : 'star'} key={star} onClick={() => updateQuestion(question.id, { mastery: (star + 1) as Mastery })}>★</button>)}</span>{question.status === 'wrong' && <button onClick={() => updateQuestion(question.id, { passed: !question.passed, mastery: question.passed ? question.mastery : Math.min(5, question.mastery + 1) as Mastery })}>{question.passed ? '取消通过' : '已重做并通过'}</button>}</div></article>)}</div></div>}
          </section>
        </div>
      </section>}
      {view === 'notes' && <section className="study-page workbench-tool-page"><div className="workbench-tool"><aside className="workbench-item-list"><div className="panel-heading"><h2>学习笔记</h2><button onClick={createWorkbenchNote}>新建</button></div><p className="muted">与题册、书本和画布共用本地备份。</p>{workbenchNotes.length ? workbenchNotes.map((note) => <WorkbenchItem key={note.id} note={note} active={activeNoteId === note.id} detail={new Date(note.updatedAt).toLocaleDateString('zh-CN')} onOpen={() => setActiveNoteId(note.id)} onDelete={() => { if (confirm(`将「${note.title || '未命名笔记'}」移至回收站？`)) deleteNote(note.id); }} />) : <div className="workbench-empty">还没有学习笔记。<button onClick={createWorkbenchNote}>创建第一篇</button></div>}</aside><div className="workbench-note-stage"><Editor /><Preview /></div></div></section>}
      {view === 'canvas' && <section className="study-page workbench-tool-page"><div className="workbench-tool"><aside className="workbench-item-list"><div className="panel-heading"><h2>无限画布</h2><button onClick={createWorkbenchCanvas}>新建</button></div><p className="muted">可自由摆放图片、文字与关联笔记。</p>{workbenchCanvases.length ? workbenchCanvases.map((canvas) => <WorkbenchItem key={canvas.id} note={canvas} active={selectedCanvas?.id === canvas.id} detail={`${canvas.canvasItems?.length || 0} 个元素`} onOpen={() => setActiveNoteId(canvas.id)} onDelete={() => { if (confirm(`将「${canvas.title || '未命名画布'}」移至回收站？`)) deleteNote(canvas.id); }} />) : <div className="workbench-empty">还没有学习画布。<button onClick={createWorkbenchCanvas}>创建第一张</button></div>}</aside><div className="workbench-canvas-stage">{selectedCanvas ? <CanvasBoard note={selectedCanvas} /> : <div className="workbench-stage-empty">新建画布后即可开始整理知识框架。</div>}</div></div></section>}
      {view === 'settings' && <section className="study-page"><section className="panel"><h2>新手引导与使用指南</h2><p className="muted">首次启动会自动显示新手引导；完整操作说明保存在“笔记”中的《暮雨笺 v3 使用指南》。</p><button onClick={() => window.dispatchEvent(new Event('muyujian:show-onboarding'))}>重新查看新手引导</button></section><AiConfigPanel /><WorkspaceWallpaperSettings /><section className="panel"><h2>题册整理技能与 Agent 提示词</h2><p className="muted">软件不在本机执行 OCR 或 AI。请让你的 Agent 按技能将图片或文本整理为 <code>questions.md</code>，再导入题册；“刷新整理文件”会直接读取题册托管目录中的该文件。</p>{skillInfo?.prompt ? <><p className="muted">技能位置：<code>{skillInfo.skillPath}</code><br />提示词位置：<code>{skillInfo.promptPath}</code></p><div className="inline-actions"><button onClick={() => skillInfo.directory && window.electronAPI?.openWorkspacePath(skillInfo.directory)}>打开技能目录</button><button onClick={() => skillInfo.promptPath && window.electronAPI?.openWorkspacePath(skillInfo.promptPath)}>打开提示词文件</button><button onClick={copyAgentPrompt}>复制 Agent 提示词</button></div><textarea className="agent-prompt" readOnly value={skillInfo.prompt} aria-label="题册整理 Agent 提示词" /></> : <p className="muted">{skillInfo?.error || '正在读取安装内置的题册整理技能…'}</p>}</section><PromptResourcePanel title="计划 Markdown 整理与 Agent 提示词" description="将计划、待办或 OCR 文本整理为可直接导入的 Markdown 任务清单，支持 - [ ] 任务名称格式。" resource={planSkillInfo} loadingText="正在读取安装内置的计划整理技能…" onCopy={copyPlanAgentPrompt} /><section className="panel"><h2>数据目录与综合备份</h2><p className="muted">当前目录：<code id="workspace-root">正在读取…</code></p><WorkspaceRoot onMigrated={(message) => setNotice(message)} /><p className="muted">迁移时逐文件比对 SHA-256；校验成功后保留旧目录，待你确认后再清理。</p></section><section className="panel"><h2>文件案例</h2><p className="muted">规划、专注、书架、题册、笔记、画布、设置与备份均提供文件案例；题册和计划案例可直接导入。</p><button onClick={() => window.electronAPI?.openWorkspaceExamples().then((result) => { if (!result?.success) alert(`无法打开案例目录：${result?.error || '未知错误'}`); })}>打开案例目录</button></section><section className="panel"><h2>示例数据</h2><p className="muted">当前工作台含预置计划、打卡与题册样例。清除后无法自动恢复。</p><button className="danger" onClick={() => { if (confirm('确定清空学习工作台示例与全部学习数据？此操作不可恢复。')) setWorkspace({ ...initialWorkspace(), tasks: [], questionBooks: [], checkins: [], focusRecords: [], books: [] }); }}>清空示例数据</button></section><section className="panel"><h2>标签</h2><p className="muted">系统状态与自定义重点标签分层保存；导出标签题册时保留全部题目信息和通过记录。</p></section></section>}
    </main><nav className="study-mobile-nav">{nav.map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}</nav>
  </div>;
};

const WorkspaceRoot: React.FC<{ onMigrated: (message: string) => void }> = ({ onMigrated }) => {
  useEffect(() => { window.electronAPI?.getWorkspaceRoot().then((root) => { const target = document.getElementById('workspace-root'); if (target) target.textContent = root; }); }, []);
  const changeRoot = async () => { const picked = await window.electronAPI?.chooseWorkspaceRoot(); if (!picked?.path) return; const result = await window.electronAPI?.migrateWorkspace(picked.path); if (result?.success) { const target = document.getElementById('workspace-root'); if (target) target.textContent = result.destination || picked.path; onMigrated(`迁移完成，已校验 ${result.files || 0} 个文件。旧目录仍保留。`); } else alert(`迁移失败：${result?.error}`); };
  return <button onClick={changeRoot}>修改并迁移数据目录</button>;
};
