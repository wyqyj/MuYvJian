import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttachmentLibrary } from './AttachmentLibrary';
import { Editor } from './Editor';
import { Preview } from './Preview';
import { VersionHistory } from './VersionHistory';
import { useAttachmentStore } from '../store/attachmentStore';
import { CanvasItem, CanvasLink, Note, useNoteStore } from '../store/noteStore';
import { generateId, renderMarkdown } from '../utils/markdown';
import { isCanvasBackgroundWheelTarget } from '../utils/canvasWheel';

type Camera = { x: number; y: number; scale: number };
type Interaction =
  | { type: 'pan'; startX: number; startY: number; camera: Camera }
  | { type: 'drag'; id: string; startX: number; startY: number; itemX: number; itemY: number; scale: number }
  | { type: 'resize'; id: string; startX: number; startY: number; width: number; height: number; scale: number }
  | null;
type ContextMenuState = { x: number; y: number; canvasX: number; canvasY: number; itemId?: string } | null;
type InspectorResize = { startY: number; startPreviewRatio: number; availableHeight: number } | null;

const clampScale = (value: number) => Math.min(2.5, Math.max(0.35, value));
const minimumItemHeight = (item: CanvasItem) => item.type === 'note' ? 142 : item.type === 'image' ? Math.max(180, item.width * 0.62) : 122;
const defaultItemHeight = (item: CanvasItem) => minimumItemHeight(item);
const itemHeight = (item: CanvasItem) => Math.max(item.height || defaultItemHeight(item), minimumItemHeight(item));

function getVisibleItems(items: CanvasItem[], camera: Camera, viewport: { width: number; height: number }): CanvasItem[] {
  const margin = 240;
  return items.filter((item) => {
    const screenX = item.x * camera.scale + camera.x;
    const screenY = item.y * camera.scale + camera.y;
    const screenWidth = item.width * camera.scale;
    const screenHeight = itemHeight(item) * camera.scale;
    return screenX + screenWidth > -margin && screenX < viewport.width + margin && screenY + screenHeight > -margin && screenY < viewport.height + margin;
  });
}

function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const templates: Record<string, { label: string; items: Omit<CanvasItem, 'id'>[] }> = {
  blank: { label: '空白画布', items: [] },
  project: { label: '项目拆解', items: [
    { type: 'text', x: 100, y: 100, width: 250, content: '目标\n写下本次项目的最终结果', color: '#1e293b' },
    { type: 'text', x: 420, y: 40, width: 230, content: '待开始\n下一步行动', color: '#1e293b' },
    { type: 'text', x: 420, y: 200, width: 230, content: '进行中\n当前最重要的任务', color: '#1e293b' },
    { type: 'text', x: 420, y: 360, width: 230, content: '已完成\n留下成果与复盘', color: '#1e293b' },
  ] },
  research: { label: '阅读研究', items: [
    { type: 'text', x: 120, y: 90, width: 310, content: '核心问题\n本次阅读想要回答什么？', color: '#1e293b' },
    { type: 'text', x: 500, y: 70, width: 280, content: '关键观点\n摘录或归纳结论', color: '#1e293b' },
    { type: 'text', x: 500, y: 250, width: 280, content: '待验证\n需要继续查找的证据', color: '#1e293b' },
  ] },
  weekly: { label: '周复盘', items: [
    { type: 'text', x: 80, y: 100, width: 240, content: '本周完成\n值得记录的推进', color: '#1e293b' },
    { type: 'text', x: 370, y: 100, width: 240, content: '遇到的问题\n卡点与原因', color: '#1e293b' },
    { type: 'text', x: 660, y: 100, width: 240, content: '下周重点\n只保留三件重要事', color: '#1e293b' },
  ] },
};

const CanvasImage: React.FC<{ src?: string }> = ({ src }) => {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  useEffect(() => { setState('loading'); }, [src]);
  return <>
    {state !== 'loaded' && <div className="canvas-image-placeholder" aria-hidden="true">{state === 'error' ? <span>图片加载失败</span> : <svg className="canvas-image-loading" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /></svg>}</div>}
    {state !== 'error' && <img src={src} alt="画布图片" draggable={false} onLoad={() => setState('loaded')} onError={() => setState('error')} aria-busy={state === 'loading'} />}
  </>;
};

export const CanvasBoard: React.FC<{ note: Note }> = ({ note }) => {
  const { notes, updateNote, setActiveNoteId } = useNoteStore();
  const { attachments, addAttachment } = useAttachmentStore();
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const interactionRef = useRef<Interaction>(null);
  const doubleTapRef = useRef<{ id: string; at: number } | null>(null);
  const inspectorResizeRef = useRef<InspectorResize>(null);
  const itemsRef = useRef<CanvasItem[]>(note.canvasItems || []);
  const [items, setItems] = useState<CanvasItem[]>(note.canvasItems || []);
  const [links, setLinks] = useState<CanvasLink[]>(note.canvasLinks || []);
  const [camera, setCamera] = useState<Camera>({ x: 120, y: 96, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [message, setMessage] = useState('滚轮缩放，拖拽空白处平移');
  const [connectorFrom, setConnectorFrom] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [inspectorNoteId, setInspectorNoteId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [copiedItem, setCopiedItem] = useState<CanvasItem | null>(null);
  const [previewRatio, setPreviewRatio] = useState(60);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY });

  const defaultPosition = () => {
    const index = itemsRef.current.length;
    return { x: 160 + (index % 3) * 300, y: 120 + Math.floor(index / 3) * 180 };
  };

  const fitCanvas = useCallback((source = itemsRef.current) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !source.length) return;
    const left = Math.min(...source.map((item) => item.x));
    const top = Math.min(...source.map((item) => item.y));
    const right = Math.max(...source.map((item) => item.x + item.width));
    const bottom = Math.max(...source.map((item) => item.y + itemHeight(item)));
    const padding = 84;
    const contentWidth = Math.max(1, right - left);
    const contentHeight = Math.max(1, bottom - top);
    const scale = clampScale(Math.min(1.15, (rect.width - padding * 2) / contentWidth, (rect.height - padding * 2) / contentHeight));
    setCamera({ x: (rect.width - contentWidth * scale) / 2 - left * scale, y: (rect.height - contentHeight * scale) / 2 - top * scale, scale });
  }, []);

  useEffect(() => {
    const next = note.canvasItems || [];
    itemsRef.current = next;
    setItems(next);
    setLinks(note.canvasLinks || []);
    setSelectedId(null);
    setEditingTextId(null);
    setInspectorNoteId(null);
    const frame = window.requestAnimationFrame(() => fitCanvas(next));
    return () => window.cancelAnimationFrame(frame);
  }, [note.id, fitCanvas]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateViewport = () => {
      const rect = stage.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const commit = useCallback((nextItems = itemsRef.current, nextLinks = links) => updateNote(note.id, { canvasItems: nextItems, canvasLinks: nextLinks }), [links, note.id, updateNote]);
  const setItemsLocal = useCallback((next: CanvasItem[]) => { itemsRef.current = next; setItems(next); }, []);
  const updateItem = useCallback((id: string, changes: Partial<CanvasItem>, persist = true) => {
    const next = itemsRef.current.map((item) => item.id === id ? { ...item, ...changes } : item);
    setItemsLocal(next);
    if (persist) commit(next);
  }, [commit, setItemsLocal]);

  const addText = useCallback((position?: { x: number; y: number }) => {
    const item: CanvasItem = { id: generateId(), type: 'text', ...(position || defaultPosition()), width: 260, height: 132, content: '点击输入文字', color: '#1e293b' };
    const next = [...itemsRef.current, item];
    setItemsLocal(next); setSelectedId(item.id); commit(next); setMessage('已添加文本块');
  }, [commit, setItemsLocal]);
  const addImageData = useCallback((dataUrl: string, attachmentId?: string, position?: { x: number; y: number }) => {
    const item: CanvasItem = { id: generateId(), type: 'image', ...(position || defaultPosition()), width: 320, height: 220, content: dataUrl, attachmentId };
    const next = [...itemsRef.current, item];
    setItemsLocal(next); setSelectedId(item.id); commit(next); setMessage('图片已放入画布');
  }, [commit, setItemsLocal]);
  const addImage = useCallback(async (file: File, position?: { x: number; y: number }) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) { setMessage('图片不能超过 8MB'); return; }
    try { const dataUrl = await imageToDataUrl(file); const attachment = addAttachment(file, dataUrl); addImageData(dataUrl, attachment.id, position); }
    catch { setMessage('图片读取失败'); }
  }, [addAttachment, addImageData]);
  const addNoteCard = useCallback((noteId: string, position?: { x: number; y: number }) => {
    const source = notes.find((entry) => entry.id === noteId);
    if (!source || source.id === note.id) return;
    const item: CanvasItem = { id: generateId(), type: 'note', ...(position || defaultPosition()), width: 280, height: 148, content: source.id };
    const next = [...itemsRef.current, item];
    setItemsLocal(next); setSelectedId(item.id); commit(next); setMessage(`已关联「${source.title}」`);
  }, [commit, note.id, notes, setItemsLocal]);
  const applyTemplate = (key: string) => {
    const template = templates[key];
    if (!template) return;
    const next = template.items.map((item) => ({ ...item, id: generateId() }));
    setItemsLocal(next); setLinks([]); updateNote(note.id, { canvasItems: next, canvasLinks: [] }); setShowTemplates(false); setMessage(`已应用「${template.label}」模板`);
  };
  const connect = (fromId: string, toId: string) => {
    if (fromId === toId || links.some((link) => link.fromId === fromId && link.toId === toId)) return;
    const nextLinks = [...links, { id: generateId(), fromId, toId, color: '#818cf8' }];
    setLinks(nextLinks); commit(itemsRef.current, nextLinks); setMessage('已创建关系连线');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-canvas-item]')) return;
    setContextMenu(null);
    stageRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = { type: 'pan', startX: event.clientX, startY: event.clientY, camera };
    setSelectedId(null);
  };
  const handleItemPointerDown = (event: React.PointerEvent<HTMLDivElement>, item: CanvasItem) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setContextMenu(null);
    if (connectorFrom) {
      if (connectorFrom === item.id) { setConnectorFrom(null); setMessage('已取消连线'); }
      else { connect(connectorFrom, item.id); setConnectorFrom(null); }
      return;
    }
    const now = Date.now();
    const previousTap = doubleTapRef.current;
    if (event.detail >= 2 || (previousTap?.id === item.id && now - previousTap.at < 700)) {
      doubleTapRef.current = null;
      interactionRef.current = null;
      const linkedNote = item.type === 'note' ? notes.find((entry) => entry.id === item.content) : undefined;
      if (linkedNote) openNoteInspector(item, linkedNote);
      else focusItem(item);
      return;
    }
    doubleTapRef.current = { id: item.id, at: now };
    stageRef.current?.setPointerCapture(event.pointerId);
    const reordered = [...itemsRef.current.filter((entry) => entry.id !== item.id), item];
    setItemsLocal(reordered);
    interactionRef.current = { type: 'drag', id: item.id, startX: event.clientX, startY: event.clientY, itemX: item.x, itemY: item.y, scale: camera.scale };
    setSelectedId(item.id);
  };
  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>, item: CanvasItem) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = { type: 'resize', id: item.id, startX: event.clientX, startY: event.clientY, width: item.width, height: itemHeight(item), scale: camera.scale };
    setSelectedId(item.id);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.type === 'pan') { setCamera({ ...interaction.camera, x: interaction.camera.x + event.clientX - interaction.startX, y: interaction.camera.y + event.clientY - interaction.startY }); return; }
    if (interaction.type === 'resize') {
      const width = Math.min(900, Math.max(120, interaction.width + (event.clientX - interaction.startX) / interaction.scale));
      const height = Math.min(720, Math.max(80, interaction.height + (event.clientY - interaction.startY) / interaction.scale));
      updateItem(interaction.id, { width, height }, false);
      return;
    }
    if (Math.abs(event.clientX - interaction.startX) > 4 || Math.abs(event.clientY - interaction.startY) > 4) doubleTapRef.current = null;
    const rawX = interaction.itemX + (event.clientX - interaction.startX) / interaction.scale;
    const rawY = interaction.itemY + (event.clientY - interaction.startY) / interaction.scale;
    const snap = (value: number) => snapToGrid ? Math.round(value / 20) * 20 : value;
    updateItem(interaction.id, { x: snap(rawX), y: snap(rawY) }, false);
  };
  const finishInteraction = () => { if (interactionRef.current?.type === 'drag' || interactionRef.current?.type === 'resize') commit(); interactionRef.current = null; };
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isCanvasBackgroundWheelTarget(event.target)) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextScale = clampScale(camera.scale * (event.deltaY > 0 ? .9 : 1.1));
    const pointX = event.clientX - rect.left;
    const pointY = event.clientY - rect.top;
    const ratio = nextScale / camera.scale;
    setCamera({ x: pointX - (pointX - camera.x) * ratio, y: pointY - (pointY - camera.y) * ratio, scale: nextScale });
  };
  const deleteItem = (id: string) => {
    const nextItems = itemsRef.current.filter((item) => item.id !== id);
    const nextLinks = links.filter((link) => link.fromId !== id && link.toId !== id);
    setItemsLocal(nextItems); setLinks(nextLinks); setSelectedId((current) => current === id ? null : current); commit(nextItems, nextLinks); setMessage('元素已移除');
  };
  const deleteSelected = () => { if (selectedId) deleteItem(selectedId); };
  const resizeSelected = (axis: 'width' | 'height', delta: number) => {
    const item = itemsRef.current.find((entry) => entry.id === selectedId);
    if (!item) return;
    const value = axis === 'width' ? item.width : itemHeight(item);
    updateItem(item.id, { [axis]: Math.min(axis === 'width' ? 900 : 720, Math.max(axis === 'width' ? 120 : minimumItemHeight(item), value + delta)) });
  };
  const setSelectedSize = (axis: 'width' | 'height', value: number) => {
    const item = itemsRef.current.find((entry) => entry.id === selectedId);
    if (!item || !Number.isFinite(value)) return;
    updateItem(item.id, { [axis]: Math.min(axis === 'width' ? 900 : 720, Math.max(axis === 'width' ? 120 : minimumItemHeight(item), value)) });
  };
  const focusItem = useCallback((item: CanvasItem) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = clampScale(Math.min(1.6, Math.max(.75, Math.min((rect.width * .62) / item.width, (rect.height * .62) / itemHeight(item)))));
    setCamera({ x: rect.width / 2 - (item.x + item.width / 2) * scale, y: rect.height / 2 - (item.y + itemHeight(item) / 2) * scale, scale });
    setSelectedId(item.id);
    setMessage(`已聚焦元素 · ${Math.round(scale * 100)}%`);
  }, []);
  const openNoteInspector = (item: CanvasItem, linkedNote: Note) => {
    setActiveNoteId(linkedNote.id);
    setInspectorNoteId(linkedNote.id);
    window.requestAnimationFrame(() => focusItem(item));
    setMessage(`正在编辑「${linkedNote.title}」`);
  };
  const closeNoteInspector = () => { setInspectorNoteId(null); setActiveNoteId(note.id); };
  const startInspectorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const inspector = event.currentTarget.parentElement;
    if (!inspector) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    inspectorResizeRef.current = { startY: event.clientY, startPreviewRatio: previewRatio, availableHeight: Math.max(240, inspector.clientHeight - 70) };
  };
  const resizeInspector = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = inspectorResizeRef.current;
    if (!resize) return;
    setPreviewRatio(Math.min(72, Math.max(34, resize.startPreviewRatio + (event.clientY - resize.startY) / resize.availableHeight * 100)));
  };
  const stopInspectorResize = () => { inspectorResizeRef.current = null; };
  const canvasPosition = (event: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale } : undefined;
  };
  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const noteId = event.dataTransfer.getData('application/x-muyujian-note');
    const position = canvasPosition(event);
    if (noteId && position) { addNoteCard(noteId, position); return; }
    const file = Array.from(event.dataTransfer.files).find((entry) => entry.type.startsWith('image/'));
    if (file) await addImage(file, position);
  };
  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
    const file = Array.from(event.clipboardData.files).find((entry) => entry.type.startsWith('image/'));
    if (file) { event.preventDefault(); await addImage(file); }
    const text = event.clipboardData.getData('text/plain').trim();
    if (text && !file) { event.preventDefault(); addText(); const last = itemsRef.current.at(-1); if (last) updateItem(last.id, { content: text }); }
  };
  const copyItem = (item?: CanvasItem) => {
    const source = item || itemsRef.current.find((entry) => entry.id === selectedId);
    if (!source) return;
    setCopiedItem({ ...source });
    setMessage('已复制元素，可在画布任意位置粘贴');
  };
  const pasteItem = (position?: { x: number; y: number }) => {
    if (!copiedItem) { setMessage('剪贴板中没有画布元素'); return; }
    const item: CanvasItem = { ...copiedItem, id: generateId(), ...(position || { x: copiedItem.x + 32, y: copiedItem.y + 32 }) };
    const next = [...itemsRef.current, item];
    setItemsLocal(next); setSelectedId(item.id); commit(next); setMessage('已粘贴元素');
  };
  const cutItem = (item?: CanvasItem) => {
    const source = item || itemsRef.current.find((entry) => entry.id === selectedId);
    if (!source) return;
    copyItem(source);
    const nextItems = itemsRef.current.filter((entry) => entry.id !== source.id);
    const nextLinks = links.filter((link) => link.fromId !== source.id && link.toId !== source.id);
    setItemsLocal(nextItems); setLinks(nextLinks); setSelectedId(null); commit(nextItems, nextLinks); setMessage('已剪切元素，可在画布任意位置粘贴');
  };
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>, item?: CanvasItem) => {
    event.preventDefault();
    event.stopPropagation();
    const position = canvasPosition(event);
    if (!position) return;
    if (item) setSelectedId(item.id);
    setContextMenu({ x: event.clientX, y: event.clientY, canvasX: position.x, canvasY: position.y, itemId: item?.id });
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) deleteSelected();
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'c' && selectedId) { event.preventDefault(); copyItem(); }
        if (event.key.toLowerCase() === 'x' && selectedId) { event.preventDefault(); cutItem(); }
        if (event.key.toLowerCase() === 'v') { event.preventDefault(); pasteItem(); }
      }
      if (event.key === 'Escape') { setContextMenu(null); setConnectorFrom(null); if (inspectorNoteId) closeNoteInspector(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const selected = items.find((item) => item.id === selectedId);
  const visibleItems = useMemo(() => getVisibleItems(items, camera, viewport), [camera, items, viewport]);
  const inspectorNote = notes.find((entry) => entry.id === inspectorNoteId && !entry.isDeleted);
  const positions = useMemo(() => new Map(items.map((item) => [item.id, { x: item.x + item.width / 2, y: item.y + itemHeight(item) / 2 }])), [items]);
  const sourceNotes = notes.filter((entry) => !entry.isDeleted && !entry.isArchived && entry.id !== note.id && entry.noteType !== 'canvas').slice(0, 8);

  return <div className="canvas-shell">
    <header className="canvas-header">
      <div className="min-w-0"><input value={note.title} onChange={(event) => updateNote(note.id, { title: event.target.value })} className="canvas-title" aria-label="画布标题" /><p className="canvas-status">{message} · {items.length} 个元素 · {links.length} 条关系</p></div>
      <div className="canvas-tools">
        <button className="canvas-tool" onClick={() => addText()} title="添加文本" aria-label="添加文本">T</button><button className="canvas-tool" onClick={() => fileInputRef.current?.click()} title="添加图片" aria-label="添加图片">▧</button><button className="canvas-tool" onClick={() => setShowLibrary(true)} title="素材库" aria-label="素材库">▦</button><button className={`canvas-tool ${showNotePicker ? 'active' : ''}`} onClick={() => setShowNotePicker(!showNotePicker)} title="放入笔记" aria-label="放入笔记">▤</button><button className={`canvas-tool ${connectorFrom ? 'active' : ''}`} onClick={() => { setConnectorFrom(selectedId || null); setMessage(selectedId ? '请选择第二个元素建立关系' : '先选中一个元素，再点击连线'); }} title="创建连线" aria-label="创建连线">↗</button><button className={`canvas-tool ${showTemplates ? 'active' : ''}`} onClick={() => setShowTemplates(!showTemplates)} title="画布模板" aria-label="画布模板">▦</button><button className="canvas-tool" onClick={() => setShowHistory(true)} title="版本历史" aria-label="版本历史">◷</button><span className="canvas-divider" />
        <button className={`canvas-tool ${snapToGrid ? 'active' : ''}`} onClick={() => setSnapToGrid(!snapToGrid)} title="对齐网格" aria-label="对齐网格">#</button><button className="canvas-tool" onClick={() => setCamera((value) => ({ ...value, scale: clampScale(value.scale - .1) }))} title="缩小" aria-label="缩小">−</button><button className="canvas-zoom" onClick={() => fitCanvas()} title="适配全部元素" aria-label="适配全部元素">{Math.round(camera.scale * 100)}%</button><button className="canvas-tool" onClick={() => setCamera((value) => ({ ...value, scale: clampScale(value.scale + .1) }))} title="放大" aria-label="放大">＋</button><span className="canvas-divider" /><button className="canvas-tool danger" disabled={!selected} onClick={deleteSelected} title="删除选中元素" aria-label="删除选中元素">×</button>
      </div>
      {showTemplates && <div className="canvas-popover template-popover">{Object.entries(templates).map(([key, template]) => <button key={key} onClick={() => applyTemplate(key)}>{template.label}</button>)}</div>}
      {showNotePicker && <div className="canvas-popover note-popover">{sourceNotes.length ? sourceNotes.map((entry) => <button key={entry.id} onClick={() => { addNoteCard(entry.id); setShowNotePicker(false); }}>{entry.noteType === 'todo' ? '☆ ' : ''}{entry.title}</button>) : <span>没有可关联的笔记</span>}</div>}
    </header>
      <div className="canvas-work-area">
      <div ref={stageRef} className="canvas-viewport" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishInteraction} onPointerCancel={finishInteraction} onWheel={handleWheel} onContextMenu={(event) => handleContextMenu(event)} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onPaste={handlePaste}>
        {note.canvasOutline?.length ? <aside className="canvas-outline" onPointerDown={(event) => event.stopPropagation()}><b>章节定位</b>{note.canvasOutline.map((entry) => <button key={entry.itemId} onClick={() => { const target = itemsRef.current.find((item) => item.id === entry.itemId); if (target) focusItem(target); }}>{entry.label}</button>)}</aside> : null}
        <div className="canvas-stage" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
          <svg className="canvas-links" aria-hidden="true">{links.map((link) => { const from = positions.get(link.fromId); const to = positions.get(link.toId); return from && to ? <line key={link.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={link.color || '#818cf8'} strokeWidth="2" /> : null; })}</svg>
          {visibleItems.map((item) => {
            const linkedNote = item.type === 'note' ? notes.find((entry) => entry.id === item.content) : undefined;
            const imageSource = item.attachmentId ? attachments.find((attachment) => attachment.id === item.attachmentId)?.dataUrl || item.content : item.content;
            return <div key={item.id} data-canvas-item className={`canvas-item ${item.type} ${selectedId === item.id ? 'selected' : ''} ${connectorFrom === item.id ? 'link-source' : ''}`} style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.width, height: itemHeight(item) }} onPointerDown={(event) => handleItemPointerDown(event, item)} onContextMenu={(event) => handleContextMenu(event, item)}>
              {item.type === 'image' ? <CanvasImage src={imageSource} /> : item.type === 'note' ? <button className="canvas-note-card" onClick={(event) => { event.stopPropagation(); if (linkedNote) openNoteInspector(item, linkedNote); }}><span>{linkedNote?.noteType === 'todo' ? '待办' : '笔记'}</span><strong>{linkedNote?.title || '已删除的笔记'}</strong><p>{linkedNote?.content.replace(/[#*\[\]`~>_-]/g, '').replace(/\n+/g, ' ').trim().slice(0, 72) || '点击在右侧打开笔记'}</p></button> : editingTextId === item.id ? <textarea autoFocus value={item.content} onPointerDown={(event) => event.stopPropagation()} onBlur={() => setEditingTextId(null)} onChange={(event) => updateItem(item.id, { content: event.target.value })} style={{ color: item.color || '#1e293b' }} aria-label="编辑画布文本" /> : <div className="canvas-text-preview" style={{ color: item.color || '#1e293b' }} onDoubleClick={(event) => { event.stopPropagation(); setEditingTextId(item.id); }} dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} />}
              {selectedId === item.id && <><div className="canvas-item-handle" onPointerDown={(event) => event.stopPropagation()}><button onClick={() => resizeSelected('width', -24)} title="缩窄">←</button><button onClick={() => resizeSelected('width', 24)} title="加宽">→</button><button onClick={() => resizeSelected('height', -20)} title="降低">↓</button><button onClick={() => resizeSelected('height', 20)} title="增高">↑</button><button onClick={() => focusItem(item)} title="居中适配">◎</button>{item.type === 'note' && linkedNote && <button onClick={() => openNoteInspector(item, linkedNote)} title="打开关联笔记">□</button>}</div><button className="canvas-resize-handle" onPointerDown={(event) => handleResizePointerDown(event, item)} aria-label="拖拽调整元素宽高" title="拖拽调整大小" /></>}
            </div>;
          })}
        </div>
        {!items.length && <div className="canvas-empty"><span>+</span><p>从文本、素材或笔记开始构建你的灵感版</p></div>}
      </div>
      {contextMenu && <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(event) => event.preventDefault()}>{contextMenu.itemId ? <>{(() => { const item = itemsRef.current.find((entry) => entry.id === contextMenu.itemId); const linked = item?.type === 'note' ? notes.find((entry) => entry.id === item.content) : undefined; return <><button onClick={() => { copyItem(item); setContextMenu(null); }}>复制</button><button onClick={() => { cutItem(item); setContextMenu(null); }}>剪切</button><button onClick={() => { if (item) focusItem(item); setContextMenu(null); }}>居中适配</button>{linked && <button onClick={() => { if (item) openNoteInspector(item, linked); setContextMenu(null); }}>打开关联笔记</button>}<button className="danger-text" onClick={() => { if (item) deleteItem(item.id); setContextMenu(null); }}>删除</button></>; })()}</> : <button onClick={() => { addText({ x: contextMenu.canvasX, y: contextMenu.canvasY }); setContextMenu(null); }}>在此添加文本</button>}<button onClick={() => { pasteItem({ x: contextMenu.canvasX, y: contextMenu.canvasY }); setContextMenu(null); }}>粘贴</button></div>}
      {inspectorNote && <aside className="canvas-note-inspector"><header><div><b>{inspectorNote.title || '未命名笔记'}</b><small>关联笔记 · 拖动中间分隔条调整预览与编辑区域</small></div><button onClick={closeNoteInspector} title="关闭笔记面板" aria-label="关闭笔记面板">×</button></header><div className="canvas-inspector-preview" style={{ flexGrow: previewRatio }}><Preview /></div><div className="canvas-inspector-splitter" role="separator" aria-label="调整预览与编辑高度" aria-orientation="horizontal" onPointerDown={startInspectorResize} onPointerMove={resizeInspector} onPointerUp={stopInspectorResize} onPointerCancel={stopInspectorResize}><i /></div><div className="canvas-inspector-editor" style={{ flexGrow: 100 - previewRatio }}><Editor /></div></aside>}
    </div>
    {selected && <div className="canvas-size-panel"><span>尺寸</span><label>宽 <input type="number" min="120" max="900" value={selected.width} onChange={(event) => setSelectedSize('width', Number(event.target.value))} /></label><label>高 <input type="number" min={minimumItemHeight(selected)} max="720" value={itemHeight(selected)} onChange={(event) => setSelectedSize('height', Number(event.target.value))} /></label><button onClick={() => focusItem(selected)}>聚焦</button></div>}
    <input ref={fileInputRef} className="hidden" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImage(file); event.target.value = ''; }} />
    {showLibrary && <AttachmentLibrary onClose={() => setShowLibrary(false)} onSelect={(attachment) => { addImageData(attachment.dataUrl, attachment.id); setShowLibrary(false); }} />}
    {showHistory && <VersionHistory note={note} onClose={() => setShowHistory(false)} />}
  </div>;
};
