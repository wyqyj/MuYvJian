import React, { useEffect, useState } from 'react';

/** AI 写作与学习助手配置面板（外观面板与工作台设置页共用） */
export const AiConfigPanel: React.FC = () => {
  const [aiConfig, setAiConfig] = useState<{ baseUrl: string; model: string; configured: boolean; secureStorageAvailable: boolean } | null>(null);
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.openai.com/v1');
  const [aiModel, setAiModel] = useState('gpt-4.1-mini');
  const [aiKey, setAiKey] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState('');

  useEffect(() => {
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

  return <section className="panel" aria-label="AI 写作与学习助手配置">
    <div className="panel-heading"><h2>AI 接口设置</h2><span className="muted">编辑器 AI 功能</span></div>
    <p className="muted">{aiConfig?.configured ? `已配置 ${aiConfig.model}，API Key 仅保存在系统安全存储中。` : '配置后可在编辑器中使用摘要、提纲、复习卡片和润色。'}</p>
    <div className="appearance-ai-form">
      <label>接口地址<div><input value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></div></label>
      <label>模型<div><input value={aiModel} onChange={(event) => setAiModel(event.target.value)} placeholder="gpt-4.1-mini" /></div></label>
      <label>API Key<div><input type="password" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder={aiConfig?.configured ? '已保存，留空表示不修改' : 'sk-...'} autoComplete="off" /></div></label>
      <div className="appearance-buttons">
        <button className="primary-mini" disabled={aiBusy || !aiConfig?.secureStorageAvailable} onClick={() => void saveAi(false)}>{aiBusy ? '处理中…' : '保存配置'}</button>
        <button className="secondary-mini" disabled={aiBusy || !aiConfig?.secureStorageAvailable || (!aiConfig?.configured && !aiKey.trim())} onClick={() => void saveAi(true)}>保存并测试</button>
        {aiConfig?.configured && <button className="secondary-mini danger-action" disabled={aiBusy} onClick={() => void clearAiKey()}>清除 Key</button>}
      </div>
      {!aiConfig?.secureStorageAvailable && <p className="muted text-rose-600">当前系统不支持安全存储，暂不保存 API Key。</p>}
      {aiNotice && <p className="muted text-indigo-600 dark:text-indigo-300">{aiNotice}</p>}
    </div>
  </section>;
};