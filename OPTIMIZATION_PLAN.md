# 暮雨笺 UI 优化计划 v3.0.8

**目标**：提升画布笔记卡片、看板卡片、侧边栏交互的流畅性和视觉一致性，使体验更流畅、专业。

## 执行结果（已完成 ✅）

**优先级排序与落地文件**：

1. **`CanvasBoard.tsx`（画布笔记卡片）** — 已完成
   - 图片新增加载骨架（旋转占位）与 error 态（"图片加载失败"），失败的图片不再破坏布局
   - 笔记卡片改为点击打开关联笔记，并带 `event.stopPropagation()` 保护，避免与画布拖拽/背景事件冲突
   - 新增 hover 态（边框强调 + 阴影过渡）
   - 文字内容统一 `trim()` 后再截断
2. **`KanbanBoard.tsx`（拖拽看板）** — 已完成
   - 新增卡片完成进度条（0–100%），全完成卡片置灰 + 标题删除线
   - 拖拽目标列高亮（`drag-over` 内描边发光）+ "释放到此列"占位提示
   - `onDragLeave` 用 `contains` 精确判定，避免列间高亮闪烁
   - 拖拽时非拖拽卡片半透明，区分层级
3. **`CommandPalette.tsx`（搜索反馈）** — 已完成
   - 新增 ↑ / ↓ / Enter 键盘导航、当前项 `.active` 高亮、自动 `scrollIntoView` 跟随
   - 选中项随输入复位，越界自动收敛；无结果时安全执行
4. **`Sidebar.tsx` + 其他** — 已完成
   - 复核 `isTodayPlan` / `noteType==='todo'` 双通道过滤口径一致，无需改动
   - 通用：`index.css` 补齐新状态样式（含深色模式），按钮/卡片焦点与 hover 反馈一致

## 验证

- `npm run typecheck` ✅
- `npm test`（4 文件 / 7 用例）✅
- `npm run build` + `electron-builder --win` 打包安装包 ✅

**回滚策略**：`git checkout -- src/renderer/components/… src/renderer/styles/index.css`