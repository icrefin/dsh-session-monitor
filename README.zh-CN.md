# dsh-session-monitor

一个实时网格，覆盖每个活跃和最近使用过的会话：对话记录、待办问答、排队消息。
[English](README.md) | **简体中文**

[![License](https://img.shields.io/github/license/icrefin/dsh-session-monitor?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/icrefin/dsh-session-monitor?style=flat-square)](https://github.com/icrefin/dsh-session-monitor/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/icrefin/dsh-session-monitor/ci.yml?branch=main&style=flat-square)](https://github.com/icrefin/dsh-session-monitor/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/icrefin/dsh-session-monitor?style=flat-square)](https://github.com/icrefin/dsh-session-monitor/commits/main)
[![Stars](https://img.shields.io/github/stars/icrefin/dsh-session-monitor?style=flat-square)](https://github.com/icrefin/dsh-session-monitor/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](.github/CONTRIBUTING.md)
[![Node](https://img.shields.io/badge/node-%3E%3D22.17-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5-4B5563?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

DeepSeek Harness 一次只显示一个会话。几个会话并行工作时，侧边栏只能告诉你某个会话
*在*运行或在等待——它到底在问什么、进行到哪一轮、想发出哪条消息，都留在那一行背后。
本插件在左侧边栏 **Plugins** 正下方加入 **Session Monitor**，打开后是一个网格，每个
活跃或最近使用过的会话一张卡片：

```
┌ Session Monitor ─────────────────┬ Session Monitor ─────────────────┐
│ ● dsh-plugins · working · 2m     │ ● release notes · waiting · 4m   │
│   you  Add a --dry-run flag…     │   ┌ This session is asking you ┐  │
│   bash  command=pnpm test        │   │ Which branch should ship? │  │
│   …                              │   │ ( ) main  ( ) next        │  │
│   [Message this session…] [Send] │   └───────────────────────────┘  │
└──────────────────────────────────┴──────────────────────────────────┘
```

对你**没有**在看的会话，每张卡片都带着这些：

- **它的实时对话记录**——你的提示词、助手正在流式输出的文本、工具调用及其结果，
  以及批准/重试通知，随会话写入即时更新；
- **待办问答或批准请求**，可以直接在卡片上作答；
- **一个输入框**，用来向该会话发送提示词；会话运行期间，消息进入下一轮收件箱
  （没有 Queue/Steer 开关）；
- **一个 Stop 按钮**，会话运行期间出现，通过会话自身的 `cancel()` 中止本轮；
- **可点击的标题**：点击卡片标题会在对话视图中打开该会话
  （`ctx.uiWorkspace.openSession(id)`）；缺少导航服务的组合里，标题就只是一个普通标题；
- **完成提醒**：运行已经结束、但还没有被看过的会话会画一个绿色圆点和 `done`（已完成）标记；
  点击卡片任意位置后，它会回到灰色的空闲状态，下一轮运行结束时会再次亮起；
- **它的权限预设**，可在卡片上切换（Read Only、Workspace Write、Full access，
  以及宿主提供的其它预设），不必打开会话；
- **排队等待它下一轮的消息**，每条都带队列停靠区自己的 **Steer**（会话运行期间可用）、
  **Edit** 和 **Discard** 操作；
- **它的模型**，与权限预设同一行即可切换，用的是会话共享的模型目录（输入框的选择器
  和 `/model` 用的正是这一个）；
- **用量读数**，与权限、模型选择在同一行：已消耗的 token 数、提示缓存命中率，以及
  上下文窗口占用率；读取的是原生输入区底部所用的同一对 `tokenUsage` 与
  `contextPressure` 投影；
- 一个 **remove** 按钮，只把这个会话从本网格上拿掉。

工具栏还能**新建会话**：一个 **New Session** 按钮，旁边带工作区下拉框。选好会话该在哪个
工作区，点按钮，卡片就会出现在网格里，**监控面板不会关闭，别的卡片也不会动**：还有空位时
从末尾加入，网格已满时接替最旧那张卡的位置。下拉框的最后一行 **Choose a folder…** 会打开
宿主的文件夹选择器，先把选中的目录接纳为新的工作区，这样你就能在侧边栏还没列出的文件夹里
开始一个会话。选过的工作区会在这个浏览器里记住。

## 在别处接手这项工作

这个目录里有一份 [HANDOFF.md](./HANDOFF.md)：当前状态、架构及其确切的数据来源、活性
判断方式、已经验证和尚未验证的部分、容易踩的坑，以及接下来要做的事。改动行为之前先读它。

## 卡片网格

- **哪些会话。** 客户端目录里所有非空白的根会话。子 agent 的子行和临时的 New Session
  行，都不是需要在这里监控的会话——只有这个工具栏刚刚创建的那条空白会话例外：在它的第一轮
  给它标题之前，它的卡片正是用户要的那一张。
- **卡片一上屏，顺序就冻结。** 网格只在开始时排一次序（等待 → 运行 → 最近使用），然后
  把它存进 `localStorage`。此后，一条提示词、一个新回合或一次状态变化，只更新卡片内容，
  绝不改变它的位置——刚刚变成最活跃的会话不会跳到最前面，离开面板或重启应用也会恢复同样的
  格子，而不是重新排一遍。一张卡片会一直待在自己的位置，直到它成为**最旧**的那张、并且有
  新会话需要这个位置：新来者接替的正是这个格子，被挤下的卡片留在顺序的尾部。后来出现的
  会话在还有空位时从末尾加入。等待中的卡片永远不会被挤掉。由这个工具栏创建的会话遵循同样的
  规则，所以开始一个会话永远不会打乱页面。
- **没有任何控件会重排网格。** 调小卡片预算只是把冻结顺序的尾部藏起来，调大又把同一段尾部
  原地显出来；什么都不重新排序，所以卡片绝不会因为活动或一次设置改动而换格子。
- **卡片预算。** 工具栏的 **卡片数** 步进器一次把预算加减一张，范围从 **2** 到 **24**
  （默认 9 张），作用于闲置和运行中的会话。中间的数值可以直接编辑，输入超出范围的值会在
  离开输入框时归一到范围内。**正在等待用户的会话永远不会被预算截掉**——那正是这个面板存在
  的理由。
- **每行卡片数。** 工具栏的 **Per row** 控件可以指定确切数量（2–6），也可以让网格留在
  **Auto**，用 260px 的卡片填满这一列。这个选择会和被移除的 id 一起记住。
- **移除。** 被移除的 id 存在本浏览器的 `localStorage`
  （`dsh-session-monitor:prefs`）里。被移除的会话继续运行、保留历史、留在侧边栏；只有
  这个网格忘了它。工具栏的 **Restore removed** 按钮会把它们全部找回来。
- **开始一个会话。** 工具栏的 **New Session** 按钮调用
  `ctx.sessions.create({ workspaceId })`，并且保持监控面板打开：宿主返回新会话的 id，页面
  把它记作一张*刚创建的空白卡片*，下一次核对就把它的卡片放好——还有空位时放在末尾，网格已满
  时放进最旧卡片的位置。这张卡片标题是 "New Session"，带着平常的输入框，所以第一条提示词
  就在这里输入。下拉框默认选最近使用过的会话所在的工作区，你上一次选的工作区会和被移除的 id
  一起记在 `localStorage` 里。**Choose a folder…** 是同一个下拉框里的一行：它调用宿主的
  文件夹选择器，把该目录接纳为工作区（`ctx.workspaces.create({ path })`），并在那里创建
  会话。取消选择器什么也不改，被拒绝的启动会在工具栏上用宿主自己的消息报告出来。缺少会话
  创建能力的组合完全不渲染新建会话控件，缺少文件夹选择器时这一行也不出现。
- **一张卡片，一条流。** 卡片在挂载期间持有一个 Session 引用
  （`ctx.sessions.retain()`），卸载时释放，所以网格打开多少张卡片，就正好打开多少条
  历史流，离开面板时全部关闭。

## 数据来源与操作方式

这个插件的行为完全在浏览器侧。它只注册一行侧边栏、一个 `main` 面板和两份 locale
字典——没有宿主路由、没有工具、没有事件监听——因为它需要的每个事实，客户端里都已经有：

| 事实 | 来源 |
|---|---|
| 会话标识、标题、工作区路径、最近使用时间、运行状态回退值 | `ctx.sessions.list` |
| 卡片上显示的工作区标题 | `ctx.workspaces.list` |
| 待办问答 / 批准请求 | `ctx.uiSession.sessionStatus` |
| 单张卡片的实时运行状态 | `binding.session.getSnapshot().running` |
| 实时对话记录 | `ctx.sessions.retain()` → `binding.eventSource` |
| 发送提示词 | `binding.session.prompt(content, 'queue')` |
| 回答一个待处理请求 | 载体自身的 `answer()` |
| 当前权限预设 | `binding.session.projections.faceOf('permissions')` |
| 可选的权限预设 | `ctx.remote.permissionPresets.catalog()` |
| 切换预设 | `binding.session.command('/permission <preset>')` |
| 排队消息 | `binding.session.projections.faceOf('inbox')` → `next-turn` |
| 转向 / 编辑 / 丢弃一条排队消息 | `binding.session.updateQueue(id, { kind: 'steer' \| 'edit' \| 'remove' })` |
| 中止正在运行的一轮 | `binding.session.cancel()` |
| 打开会话 | `ctx.uiWorkspace.openSession(sessionId)` |
| 当前模型与目录 | `ctx.modelDirectories.directoryFor(sessionId)` |
| 切换模型 | 同一目录的 `select({ provider, model })` |
| 就地创建会话 | `ctx.sessions.create({ workspaceId })`（回退到 `ctx.uiWorkspace.connectWorkspace`） |
| 把刚创建的空白会话保留为卡片 | 监控面板在本浏览器 `localStorage` 里的 `spawned` 集合 |
| 把文件夹接纳为工作区 | `ctx.workspaces.create({ path })` |
| 请求选择文件夹 | `ctx.remote.directoryPicker.pick()` |

**为什么能在另一个会话的卡片上作答。** 内置的批准面板和问答面板会把请求发布到统一的
pending-interaction 投影里，两个载体（`PendingApproval`、`PendingQuestion`）都暴露了
它们各自输入面板所调用的同一个 `answer()`——批准请求接受
`'allowed-once' | 'rejected'`，问答接受 `{ answers: [{ id, selected, custom }] }`。
监控面板驱动的是这个方法，没有另写一条回答路径。没有提供 `answer()` 的载体什么也不渲染；
被拒绝的回答会在卡片上显示为一次失败。

**为什么权限控件能切换另一个会话。** 它从该会话自己的 `permissions` 投影读出当前预设，
列出宿主进程目录中登记的预设，并提交与内置输入框选择器完全相同的那行
`/permission <preset>`——切换由宿主执行，投影报告出的新值就是卡片得到的答复。
Full access 的切换不需要额外一步：在这个选择器里选中它，本身就是明确的授权。
Auto review 保留一次就地确认，因为它改变的是每一个请求的审查方式。这个命名空间是可选的
——它不在本 bundle 的必需 `inject` 列表里，而是通过
`ctx.get('remote.permissionPresets')` 反射解析——所以缺少权限预设的组合不会发布任何
目录，整个面板照常挂载，卡片上也不会渲染这个控件。

**为什么排队消息和模型同样属于会话自己。** 卡片列出的是会话 `inbox` 投影里
`next-turn` 的那些行——也就是主视图队列停靠区渲染的同一批行——它的三个按钮调用的正是
停靠区上的操作：**Steer**（`{ kind: 'steer' }`，仅在会话运行期间）、**Edit**（一个就地
编辑器，保存 `{ kind: 'edit', content: [{ type: 'text', text }] }`）和 **Discard**
（`{ kind: 'remove' }`）。对已经先结束的一轮，或 agent 已经认领的一行，同样是这套一致的
处理。输入框没有 Queue/Steer 开关：发送永远是 `queue`，转向是队列行上的操作，输入框上的
**Stop** 按钮（仅在会话运行期间显示）调用 `session.cancel()`——也就是主视图的 Stop 操作。
模型控件通过 `ctx.modelDirectories` 解析共享的按会话目录（在一个可选子作用域里等待它，
该作用域同时注入 `remote.session`，因为那个服务要经过调用方的上下文才能到达这个命名
空间），所以在卡片上切换的模型，就是输入框和 `/model` 接下来看到的那个。带推理强度声明
的模型会以它的默认强度切换；卡片本身没有强度行。

**为什么新建会话不会打开对话。** 监控面板的意义就是同时看着几个会话；一次把视图带走的点击
正好破坏这一点。所以工具栏调用 `ctx.sessions.create({ workspaceId })`，留下宿主返回的 id。
全新会话是*空白*的，网格本来会把它过滤掉，于是这个 id 被记进本浏览器的 `spawned` 集合，
`collectSessions` 会在这条空白行有真实标题之前，把它保留为一张标题是 "New Session" 的卡片。
之后这张卡片像任何新来者一样进入冻结的顺序——这正是网格其余部分保持不动的原因。被挤下的
卡片留在顺序尾部，而不是被丢掉；否则它在下一次核对时会被当成新来者，挤掉另一张卡片，网格
就会来回抖动。缺少 `sessions.create` 的组合回退到
`ctx.uiWorkspace.connectWorkspace(workspaceId)`，它同样只创建、不跳转（可能会复用一条空白
会话）。两个服务都是可选的、通过反射读取（`ctx.get(...)`），所以在两者都不存在的组合里，
面板照常挂载，只是渲染不出新建会话控件。

**一处已知的边界。** 被路由到另一个浏览器标签页的问答（或前台声明已经结束的问答）会拒绝
在这里作答（`no channel accepts an answer yet`）；卡片会如实说明，而不是假装回答已被接受。

## 值得说明的设计取舍

- **首次绘制之后顺序就冻结。** 内置 Session 行用的同一套优先级（待处理 → 进行中 →
  已完成 → 闲置）只用来决定网格的初始顺序；卡片一旦显示，活动就不许移动它——顺序还被存了
  下来，所以重挂载或重启应用也不会重新排一遍。这正是你给某个会话发提示词时，正在看的那张
  卡片留在原地的原因；也正因为如此，新会话会接替最久未使用那张卡的位置，而不是把别的卡片
  全往下挤。没有例外：**更小的卡片预算**只是把顺序的尾部藏起来，调大时同样的卡片回到同样
  的格子。
- **工作区标题是卡片的第二行，用正文颜色。** 它来自工作区注册表，而不是 `cwd` 字符串，
  所以重命名过的工作区会显示它的名字；原始路径仍作为悬停提示保留。状态和时间紧随其后，
  用弱化的说明文字颜色，状态圆点让人一眼看出状态。
- **对话文本用的是对话本身的字号。** 用户行和助手行读取 `--dsh-content-font-size`
  （默认 14 px），行高增量与 Chat 相同，工具/通知行读取
  `--dsh-content-font-size-secondary`；于是卡片跟随 Settings → General 里的字号偏好，
  而不是自带一套字号。
- **时间反映的是活动，而不只是最后一次提示词。** 每张卡片的“多久之前”标签跟随最新的
  可见事件（回退到目录的最近使用时间），所以会话写入时它在走，而卡片落在后面时它恰好
  停住——一处内置的活性检查。
- **对话记录刻意紧凑。** 它显示用户文本、助手文本、每次工具调用一行并带第一个参数、
  失败时的错误圆点，以及批准/重试通知；工具行按设计就是摘要，而用户和助手消息完整显示。
  窗口之外的历史留在对话视图里。
- **对话记录窗口是 60 行，而一行内的消息文本保持完整。** 卡片可滚动，所以一个长回答能读到
  最后一个字；只有行数有上限，单行文本永远不截断。窗口之外的全部历史留在对话视图里。
- **移除是刻意的本地行为。**“从监控中移除”说的是这个面板，不是这个会话，所以它不能碰
  宿主日志，也不能碰侧边栏。
- **面板是一整页固定的页面，永远不是可滚动的文档。** 它占据整个中间列，以及它头部之下的
  整个高度；列数与行数由这个盒子算出，所以每张卡片同时可见，没有页面滚动条。**Auto**
  选出最接近标称卡片尺寸的那一列数；显式的 **Per row** 数量会被采纳，其行数仍会被适配。
  卡片主体隐藏自己的滚动条并跟随尾部，所以读一段长对话永远不会移动网格。待办问答渲染在
  那块滚动区域里（从问题本身开始——卡片头部已经点明了等待状态），回答行固定在卡片底部；
  卡片变窄时，依次舍弃时间、状态词、队列操作按钮，好让工作区名和回答控件得以保留。
- **卡片的状态来自它自己的那个会话。** `binding.session.getSnapshot().running` 是权威的
  按会话运行位：宿主的状态事件会调用 `Session.handleRunning()`。目录行只是回退，所以一份
  滞后的共享快照永远无法掩盖正在发生的工作。每张卡片每 2 s 核对它的两份快照，页面在挂载
  时以及每 15 s 向宿主索取一份新的目录基线——漏掉一次推送的代价是一个间隔，而不是一个
  错误的标记。
- **引用来源只有一个。** 所有 retain 都记在 `sessionMonitor` 这个 source key 下，因此
  `sessions.retainInfo(id)` 能把监控面板的流与对话自己的流区分开。

## 验证结果

- `pnpm check`——两半与测试的类型检查、构建出的 bundle，然后跑测试：**132 个测试**，
  包括用 jsdom 把真实页面挂到假投影上（排序、实时窗口、问答作答、发送提示词、移除、
  打开失败、长回答完整渲染、新建会话控件的默认工作区、它的启动调用、文件夹接纳、被取消的
  选择器和被拒绝的启动）、新建的空白会话在页面上接替最旧卡片的位置而不跳转、卡片在面板
  重挂载与重新加载后保持原格、更小的预算藏起顺序尾部而不重排、工具栏的卡片预算步进器
  每次只加减一张并在 2 和 24 处停住、`pending` 目录不动已存的顺序、一道样式表守卫
  （每个渲染出的 class 都有规则；没有字面颜色），以及在假模块加载器后面执行**构建产物**
  （bundle id、导出、真实的 `apply` 接线、没有第二份 React）。
- `scripts/dev-profile.sh`——一个隔离的 profile 能启动这一行，并伺服
  `/plugins/dsh-session-monitor/client.js`。
- 未验证：面板的实际像素。本次会话没有浏览器控制，所以视觉检查（浅色/深色、窄宽度下的卡片
  网格）仍留给用户。

## 安装

```sh
cd dsh-session-monitor
pnpm install
pnpm check
scripts/install.sh            # 构建、打包，并打印 tarball 路径
```

通过 **Settings → Plugins** 安装这个 tarball（由 CLI 管理的 profile 则用
`dsh plugin --profile <name> add <tarball>`），然后重启应用。桌面 profile 归 Electron
应用所有，所以它受支持的安装路径是 Plugins 页面；加到运行中的 profile 里的 bundle，
会在下次启动时被导入。

## 目录结构

```
src/index.ts                     host half: identity only, registers nothing
src/client/index.tsx             sidebar row + main page registration
src/client/MonitorPage.tsx       grid, toolbar, card selection
src/client/CardBudgetControl.tsx 卡片预算步进器（− / 数字 / +）
src/client/NewSessionControl.tsx new-session button + Workspace drop-down
src/client/SessionCard.tsx       one card: header, transcript, pending, composer
src/client/InteractionCard.tsx   question/approval answer block
src/client/model.ts              which sessions, what happened (pure)
src/client/store.ts              removed ids + card budget (localStorage)
src/client/useSessionFeed.ts     retain/follow/release one session
src/client/styles.ts             theme-token stylesheet
test/                            model, store, manifest, page (jsdom), built bundle
```

## 贡献

欢迎提交 Issue 和 Pull Request——开发环境的搭建方式和 sign-off 要求见
[CONTRIBUTING.md](.github/CONTRIBUTING.md)。安全类问题请按
[SECURITY.md](.github/SECURITY.md) 所述私下报告。

## 许可证

MIT——见 [LICENSE](./LICENSE)。

> 如果这个网格帮你省下了一趟标签页来回切换，一颗 ⭐ star 能帮更多 DSH 用户发现它。