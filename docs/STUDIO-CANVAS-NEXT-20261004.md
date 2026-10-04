# Studio 画布交互：2026-10-04 实现与后续边界

## 本轮实现

Studio 演示页预览接入现有 `createSlidePreview` / `slideBridge` 的显式 selection-only 模式：点击或 Enter/Space 选择对象，图层选择反向高亮；切页清除图层选择，属性草稿和保存期间禁止从画布切换对象。

对象 ID 与 DocumentObjectPanel 的 ID 并不相同，必须在同一源稿中按源码 start offset 映射，并校验当前页。父窗口只接受当前 iframe + 当前随机 channel 的消息，当前渲染 token 和 disabled 用 ref 再检查。切源稿/切页重新生成 channel。注入标注和高亮只作用于清洗后的预览，不写入原 HTML。

selection-only 在注册编辑监听器前返回，不注册 pointerdown/move/up、dblclick、beforeinput、input 或 focusout，不处理 apply-placement/flush。方向键/Delete 不修改源稿。iframe 使用实际容器尺寸，由已有 bridge fit 页面，取消缩略图外部 CSS scale。

长文仍是只读预览，修改沿用共享对象面板；未交付直接拖动、双击文字、自由布局转换。

## 已有可复用契约

- `slideBridge`: `slide-ready` / `request-ready`, `object-select` / `object-clear` / `select-object`, `placement` / `apply-placement`, `editing` / `edit` / `ended`, `flush` / `flushed` / `flush-blocked`, `layout-locked`。
- `SlidesEditor`: frame source + channel 过滤；`sourceRef` 为最新源稿，`renderSource` 可滞后以保留 iframe 中手势；undo 需要额外 renderRevision 强制重绘；selectionRef 避免 React 渲染时序造成丢消息。
- placement x/y 上限绝对值 10000，scale 0.1–5；持久化 x/y 四舍五入至 0.1px、scale 至 0.001；ack 排队避免快速键盘/下一次手势被旧回执覆盖。
- bridge 内部 zoom 来自实际 iframe viewport，指针差值除 zoom；外部 viewport camera 如复用必须保持其独立职责，不能将缩略图比例再乘入对象坐标。
- `patchPlacement` 校验对象 ID/start/raw，只修改起始标签样式；已有 transform/rotate/复杂父级变换及 inline 不支持自由移动，必须沿用 editable 判定。
- 中文 IME composition 或 settling 时 flush-blocked，保存/切页/导出不得绕过；三秒无响应保留原工作区并提示。
- Studio `applyWorkspaceChange` 校验 expected source 相等及 200000 字符上限；外层 onSave 保留 Studio 的版本/CAS 持久化，不能调用 Docs saveDocument。
- `LongEditor` 有独立 object-focus/select 与文档流编辑桥，不应强行套用演示页 translate/scale。

## 下一批：可编辑画布

先从 SlidesEditor 抽取可复用的画布 host controller（保留原测试和 Docs 持久化适配），Studio 继续拥有历史、版本保存和 AI 基线。按“可支持对象拖动+等比缩放 → 撤销/重做 → flush 后保存/切页 → 双击文字”的顺序交付。不能复制第二套手势引擎或直接整挂带 Docs 存储的 SlidesEditor。

验收需覆盖：非 100% 视口、连续拖动/键盘回执、切页旧消息、undo 原源稿重绘、属性草稿互斥、取消手势、中文输入法、保存失败保留修改、AI 旧版本拒绝。源码未改区段字节一致，浏览器真实点击/保存恢复另验。

## 本轮检查

针对性测试：slides-bridge 37 项、slides 8 项、studio-workspace-model 5 项，共 50 项通过。新增覆盖 selection-only 无编辑监听器、非法父窗口/channel、disabled 阻止选中、跨页/非法对象映射。原完整编辑模式回归通过。浏览器实际交互由主任务继续验证；本文件不是公网验收回执。
