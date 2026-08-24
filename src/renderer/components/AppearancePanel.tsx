import React, { useRef, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

export const AppearancePanel: React.FC<{ onClose: () => void; previewVisible: boolean; onTogglePreview: () => void }> = ({ onClose, previewVisible, onTogglePreview }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resetting, setResetting] = useState(false);
  const [aiConfig, setAiConfig] = useState<{ baseUrl: string; model: string; configured: boolean; secureStorageAvailable: boolean } | null>(null);
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.openai.com/v1');
  const [aiModel, setAiModel] = useState('gpt-4.1-mini');
  const [aiKey, setAiKey] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState('');
  const { settings, updateSettings } = useSettingsStore();
  React.useEffect(() => {
    window.electronAPI?.getAiConfig().then((config) => {
      setAiConfig(config);
      setAiBaseUrl(config.baseUrl);
      setAiModel(config.model);
    }).catch(() => setAiNotice('无法读取 AI 配置。'));
  }, []);
  const saveAi = async (test = false) => {
    if (aiBusy) return;
    setAiBusy(true);
    setAiNotice('');
    try {
      const saved = await window.electronAPI?.saveAiConfig({ baseUrl: aiBaseUrl, model: aiModel, ...(aiKey.trim() ? { apiKey: aiKey.trim() } : {}) });
      if (!saved?.success || !saved.config) { setAiNotice(saved?.error || '保存 AI 配置失败。'); return; }
      setAiConfig(saved.config);
      setAiKey('');
      if (test) {
        const result = await window.electronAPI?.testAiConnection();
        setAiNotice(result?.success ? '连接测试成功。' : `连接测试失败：${result?.error || '未知错误'}`);
      } else setAiNotice('AI 配置已保存。');
    } catch (error) { setAiNotice(`操作失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { setAiBusy(false); }
  };
  const clearAiKey = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const result = await window.electronAPI?.saveAiConfig({ baseUrl: aiBaseUrl, model: aiModel, clearApiKey: true });
      if (result?.success) { setAiConfig(result.config || null); setAiNotice('API Key 已清除。'); }
      else setAiNotice(result?.error || '清除 API Key 失败。');
    } finally { setAiBusy(false); }
  };
  const upload = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) { alert('壁纸图片不能超过 8MB'); return; }
    const reader = new FileReader();
    reader.onload = () => updateSettings({ wallpaper: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const resetWorkspace = async () => {
    if (resetting) return;
    const confirmation = prompt('初始化会删除当前工作台的全部数据和工作台内备份，且不可恢复。请输入“初始化”继续：');
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
  return <div className="overlay-panel" role="dialog" aria-modal="true"><div className="version-panel appearance-panel"><div className="overlay-header"><div><h2>外观与预览</h2><p>壁纸仅保存在本机，可随时清除</p></div><button className="icon-mini" onClick={onClose} title="关闭" aria-label="关闭">×</button></div>
    <div className="appearance-content"><section><div><strong>自定义壁纸</strong><p>{settings.wallpaper ? '已应用一张本地壁纸' : '上传图片作为工作区背景'}</p></div><div className="appearance-buttons"><button className="primary-mini" onClick={() => inputRef.current?.click()}>上传壁纸</button>{settings.wallpaper && <button className="secondary-mini" onClick={() => updateSettings({ wallpaper: undefined })}>清除</button>}</div></section><section><div><strong>实时预览</strong><p>可在编辑时手动关闭渲染窗格</p></div><button className="secondary-mini" onClick={onTogglePreview}>{previewVisible ? '关闭预览' : '显示预览'}</button></section><section><div><strong>AI 写作与学习助手</strong><p>{aiConfig?.configured ? `已配置 ${aiConfig.model}，API Key 仅保存在系统安全存储中。` : '配置后可在编辑器中使用摘要、提纲、复习卡片和润色。'}</p></div><div className="appearance-ai-form"><label>接口地址<input value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></label><label>模型<input value={aiModel} onChange={(event) => setAiModel(event.target.value)} placeholder="gpt-4.1-mini" /></label><label>API Key<input type="password" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder={aiConfig?.configured ? '已保存，留空表示不修改' : 'sk-...'} autoComplete="off" /></label><div className="appearance-buttons"><button className="primary-mini" disabled={aiBusy || !aiConfig?.secureStorageAvailable} onClick={() => void saveAi(false)}>{aiBusy ? '处理中…' : '保存配置'}</button><button className="secondary-mini" disabled={aiBusy || !aiConfig?.secureStorageAvailable || (!aiConfig?.configured && !aiKey.trim())} onClick={() => void saveAi(true)}>保存并测试</button>{aiConfig?.configured && <button className="secondary-mini danger-action" disabled={aiBusy} onClick={() => void clearAiKey()}>清除 Key</button>}</div>{!aiConfig?.secureStorageAvailable && <p className="text-xs text-rose-600">当前系统不支持安全存储，暂不保存 API Key。</p>}{aiNotice && <p className="text-xs text-indigo-600 dark:text-indigo-300">{aiNotice}</p>}</div></section><section className="appearance-reset"><div><strong>初始化全部数据</strong><p>删除便签、附件、学习工作台数据和工作台内备份，保留数据目录位置。</p></div><button className="secondary-mini danger-action" disabled={resetting} onClick={resetWorkspace}>{resetting ? '正在初始化…' : '初始化'}</button></section></div>
    <input ref={inputRef} className="hidden" type="file" accept="image/*" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} />
  </div></div>;
};
