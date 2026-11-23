/**
 * The monitor's copy in the two shipped web-client languages.
 *
 * Every visible string in the panel comes from here through the locale seat, so
 * a language switch re-renders mounted cards without a reload. `zh` is typed
 * against `en`: a missing key fails the build instead of showing a raw key.
 *
 * @module dsh-session-monitor/client/locales
 */

/** English copy. */
export const en = {
  /** Sidebar row label. */
  panel: 'Session Monitor',
  /** Page title. */
  title: 'Session Monitor',
  /** Page introduction. */
  description:
    'Every active and recently used session on one grid: a live transcript or the session flow, pending questions, and a composer inside each card.',
  /** Toolbar: how many cards the grid shows. */
  shown: '{count} shown',
  /** Toolbar: waiting-session count. */
  waitingCount: '{count} waiting',
  /** Toolbar: running-session count. */
  runningCount: '{count} working',
  /** Toolbar: card budget label. */
  cards: 'Cards',
  /** Toolbar: lower the card budget by one. */
  fewerCards: 'One fewer card',
  /** Toolbar: raise the card budget by one. */
  moreCards: 'One more card',
  /** Toolbar: cards-per-row label. */
  columns: 'Per row',
  /** Toolbar: automatic grid filling. */
  auto: 'Auto',
  /** Toolbar: accessible name of the view switch. */
  viewMode: 'View mode',
  /** Toolbar: the transcript view. */
  viewCards: 'Transcript',
  /** Toolbar: the flow view. */
  viewFlow: 'Flow',
  /** Flow: status pill, a turn is running. */
  flowStatusRunning: 'Running',
  /** Flow: status pill, the session is blocked on the user. */
  flowStatusWaiting: 'Waiting for you',
  /** Flow: status pill, the turn finished. */
  flowStatusDone: 'Turn complete',
  /** Flow: status pill, the turn ended with an error. */
  flowStatusFailed: 'Turn failed',
  /** Flow: status pill, no turn is running. */
  flowStatusIdle: 'Idle',
  /** Flow: which turn the header describes. */
  flowTurnLabel: 'Turn {turn}',
  /** Flow: elapsed time of the current turn. */
  flowElapsedLabel: 'Elapsed {time}',
  /** Flow: accessible name of the step rail. */
  flowRailLabel: 'This turn: {done} of {total} steps done',
  /** Flow: steps of the current turn that finished. */
  flowDoneCount: '{count} done',
  /** Flow: steps of the current turn that run. */
  flowRunningCount: '{count} running',
  /** Flow: steps that failed. */
  flowFailedCount: '{count} failed',
  /** Flow: the numbered label, read by a screen reader. */
  flowStepNumberLabel: 'Step {label}',
  /** Flow: heading above the numbered list. */
  flowSessionHeading: 'Session',
  /** Flow: prompt row tag. */
  flowPromptTag: 'You',
  /** Flow: rows dropped from the front of the list. */
  flowOmitted: '+{count} earlier',
  /** Flow: activity card while the model is producing text. */
  flowActivityThinking: 'Thinking',
  /** Flow: activity card while a tool call runs. */
  flowActivityTool: 'Running {tool}',
  /** Flow: activity card while an approval is pending. */
  flowActivityApproval: 'Waiting for your approval',
  /** Flow: activity card while a question is pending. */
  flowActivityQuestion: 'Waiting for your answer',
  /** Flow: activity card after a turn finished. */
  flowActivityDone: 'This turn is complete',
  /** Flow: activity card while nothing runs. */
  flowActivityIdle: 'Waiting for your next message',
  /** Flow: step title, the step wrote a file. */
  flowStepWriting: 'Writing {name}',
  /** Flow: step title, the step changed a file. */
  flowStepEditing: 'Editing {name}',
  /** Flow: step title, the step wrote more than one file. */
  flowStepWritingMore: 'Writing {name} +{count} more',
  /** Flow: step title, the step changed more than one file. */
  flowStepEditingMore: 'Editing {name} +{count} more',
  /** Flow: the command runs tests. */
  flowBashPurposeTests: 'running tests',
  /** Flow: the command installs dependencies. */
  flowBashPurposeInstall: 'installing dependencies',
  /** Flow: the command builds the project. */
  flowBashPurposeBuild: 'building the project',
  /** Flow: the command searches code or files. */
  flowBashPurposeSearch: 'searching the code',
  /** Flow: the command is a git operation. */
  flowBashPurposeGit: 'working with git',
  /** Flow: the command uses the network. */
  flowBashPurposeNetwork: 'using the network',
  /** Flow: the command inspects or changes files. */
  flowBashPurposeFiles: 'inspecting or changing files',
  /** Flow: the command inspects processes or system state. */
  flowBashPurposeProcesses: 'checking system processes',
  /** Flow: the command runs a script or interpreter. */
  flowBashPurposeScript: 'running a script',
  /** Flow: the command works with a package manager. */
  flowBashPurposePackages: 'managing packages',
  /** Flow: no specific intent could be guessed. */
  flowBashPurposeGeneric: 'running a command',
  /** Flow: fallback title for a step nothing else describes. */
  flowStepWork: 'Working',
  /** Flow: empty state, the session has no prompt yet. */
  flowEmptyTitle: 'No activity yet',
  /** Flow: empty state hint. */
  flowEmptyHint: 'Start a turn and its steps appear here.',
  /** Flow: the binding is still opening the event log. */
  flowOpeningHistory: 'Opening the session…',
  /** Flow: the event log could not be read. */
  flowHistoryFailed: 'The session history could not be read.',
  /** Flow: error line above a failed turn's message. */
  flowErrorLine: 'The turn stopped with an error',
  /** Flow: how many human prompts the session holds. */
  flowPromptsCount: '{count} prompts',
  /** Flow: the single-prompt case. */
  flowPromptsCountOne: '1 prompt',
  /** Flow: how many steps the session holds. */
  flowStepsCount: '{count} steps',
  /** Flow: the single-step case. */
  flowStepsCountOne: '1 step',
  /** Toolbar: restore every removed session. */
  restoreAll: 'Restore removed ({count})',
  /** Toolbar: nothing to restore. */
  restoreNone: 'No removed sessions',
  /** Toolbar: start a session in the chosen Workspace and open it. */
  newSession: 'New Session',
  /** Toolbar: accessible name of the Workspace selector beside the button. */
  newSessionWorkspace: 'Workspace for the new session',
  /** Toolbar: tooltip of the new-session button. */
  newSessionHint: 'Start a session in {workspace} and show its card here',
  /** Toolbar: the session is being created. */
  newSessionStarting: 'Starting…',
  /** Toolbar: the folder chooser is open. */
  newSessionPicking: 'Choosing a folder…',
  /** Toolbar: the folder is being adopted as a Workspace. */
  newSessionAdopting: 'Adding workspace…',
  /** Toolbar: creating the session failed; the reason is the Host's own message. */
  newSessionFailed: 'The session could not be started: {reason}',
  /** Toolbar: workspace selector row that opens the folder chooser. */
  pickFolder: 'Choose a folder…',
  /** Toolbar: the Workspace selector before the registry has any row. */
  noWorkspace: 'No workspace yet',
  /** Workspace display name for the Host's automatic first-use title. */
  defaultWorkspace: 'Default workspace',
  /** Empty state title. */
  emptyTitle: 'No sessions to monitor',
  /** Empty state body. */
  emptyBody: 'Start a session, or restore the sessions you removed from this grid.',
  /** Page-level boundary: the panel stopped drawing. */
  panelFailed: 'This page could not be drawn',
  /** Page-level boundary: what happened, in plain words. */
  panelFailedBody:
    'One of the sessions reported something this page could not read. Nothing was changed. Try again, and the page mounts from scratch.',
  /** Page-level boundary: remount the page. */
  panelRetry: 'Try again',
  /** Card boundary: one card stopped drawing. */
  cardFailed: 'This card could not be drawn',
  /** Card boundary: the session itself is unaffected. */
  cardFailedBody:
    'This session reported something this card could not read. The session keeps running; only its card is affected.',
  /** Card boundary: remount the card. */
  cardRetry: 'Try again',
  /** Card state: blocked on the user. */
  waiting: 'waiting for you',
  /** Card state: a turn is running. */
  working: 'working',
  /** Card state: a finished run the user has not looked at yet. */
  completed: 'done',
  /** Card state: idle. */
  idle: 'idle',
  /** Card footer: tokens the session consumed. */
  usageTokens: '{tokens} tok',
  /** Card footer: prompt-cache hit share. */
  usageCacheHit: '{percent}% cache',
  /** Card footer: context-window occupancy. */
  usageContext: '{percent}% ctx',
  /** Card footer: accessible name of the usage readout. */
  usageLabel: 'Session usage',
  /** Tooltip: exact tokens consumed. */
  usageTokensTitle: 'Tokens used in this session: {tokens}',
  /** Tooltip: prompt-cache hit share. */
  usageCacheHitTitle: 'Prompt cache hit: {percent}%',
  /** Tooltip: context-window occupancy. */
  usageContextTitle: 'Context window: {percent}% used ({used} of {window})',
  /** Card action: remove this card. */
  remove: 'Remove from monitor',
  /** Card: open this session in the conversation view. */
  openSession: 'Open session',
  /** Card: label of the permission preset control. */
  permission: 'Permission',
  /** Permission preset: read-only sandbox. */
  permReadOnly: 'Read Only',
  /** Permission preset: workspace-write sandbox. */
  permWorkspaceWrite: 'Workspace Write',
  /** Permission preset: unconfined sandbox with approval prompts off. */
  permFullAccess: 'Full access',
  /** Permission preset: the Host's Auto review integration. */
  permAuto: 'Auto review',
  /** Permission preset: the current knobs match no preset. */
  permCustom: 'Custom',
  /** Confirm: Auto review is experimental. */
  permConfirmAuto: 'Auto review lets the Host decide each request. It is experimental.',
  /** Confirm: keep the current preset. */
  permConfirmCancel: 'Cancel',
  /** Confirm: apply the pending preset. */
  permConfirmSwitch: 'Switch',
  /** Card: the permission switch was refused. */
  permFailed: 'The permission switch was not accepted',
  /** Card: how many messages are queued for this session's next turn. */
  queuedCount: '{count} queued',
  /** Card: more queued messages than the card lists. */
  queuedMore: '+{count} more',
  /** Card: steer one queued message into the running turn. */
  steerQueued: 'Steer queued message',
  /** Card: steering is only possible while the agent runs. */
  steerUnavailable: 'Steering is available only while the agent is running',
  /** Card: the steer action was refused. */
  steerQueuedFailed: 'Steering failed. Try again.',
  /** Card: edit a queued message. */
  queueEdit: 'Edit queued message',
  /** Card: save the edited queued message. */
  queueSave: 'Save queued message',
  /** Card: abandon the queue edit. */
  queueCancelEdit: 'Cancel edit',
  /** Card: a queued row carries no editable text. */
  queueEditUnsupported: 'This queued message has no editable text',
  /** Card: discard a queued message. */
  queueDiscard: 'Discard queued message',
  /** Card: the queue edit was refused. */
  queueEditFailed: 'The queued message could not be edited',
  /** Card: the queue discard was refused. */
  queueDiscardFailed: 'The queued message could not be discarded',
  /** Card: a queued message with no text (attachments only). */
  queueAttachment: 'Attachment',
  /** Card: model picker label. */
  model: 'Model',
  /** Card: the model catalog is still loading. */
  modelLoading: 'Loading models…',
  /** Card: no model selection exists yet. */
  modelUnavailable: 'Select model',
  /** Card: the model switch was refused. */
  modelFailed: 'The model switch was not accepted',
  /** Composer: stop the running turn. */
  stop: 'Stop',
  /** Composer: the stop request is in flight. */
  stopping: 'Stopping…',
  /** Composer: tooltip of the stop action. */
  stopHint: 'Stop the running turn',
  /** Card: the stop request was refused. */
  stopFailed: 'The session could not be stopped',
  /** Card: no transcript loaded yet. */
  noHistory: 'No messages yet',
  /** Card: history is opening. */
  opening: 'Opening history…',
  /** Card: the session could not be opened. */
  openFailed: 'History could not be opened',
  /** Notice: an approval was requested. */
  approvalAsked: 'approval requested: {tool}',
  /** Notice: an approval was decided. */
  approvalDecided: 'approval: {outcome}',
  /** Notice: the model request was retried. */
  retry: 'model request retried',
  /** Notice: a retry carried a reason. */
  retryReason: 'model retry: {reason}',
  /** Interaction: a question batch. */
  questionTitle: 'This session is asking you',
  /** Interaction: an approval request. */
  approvalTitle: 'Permission needed: {tool}',
  /** Interaction: approval reason prefix. */
  reason: 'Reason',
  /** Interaction: approve once. */
  allow: 'Allow once',
  /** Interaction: reject. */
  reject: 'Reject',
  /** Interaction: submit the answer batch. */
  submit: 'Submit',
  /** Interaction: skip this question. */
  skip: 'Skip',
  /** Interaction: free-text answer placeholder. */
  custom: 'Type an answer…',
  /** Interaction: request in flight. */
  answering: 'Sending…',
  /** Interaction: the request refused the answer. */
  answerFailed: 'The answer was not accepted',
  /** Interaction: no options were offered. */
  noOptions: 'No options offered',
  /** Composer placeholder. */
  placeholder: 'Message this session…',
  /** Composer: send. */
  send: 'Send',
  /** Composer: request in flight. */
  sending: 'Sending…',
  /** Composer: the prompt was refused. */
  promptFailed: 'The message was not accepted',
  /** Relative time: within the last minute. */
  nowLabel: 'just now',
  /** Relative time: minutes. */
  minutesAgo: '{count}m ago',
  /** Relative time: hours. */
  hoursAgo: '{count}h ago',
  /** Relative time: days. */
  daysAgo: '{count}d ago',
  /** Version chip credit; the name and address are literal. */
  credit: 'v{version} | Author: icrefin [icrefinai@gmail.com]',
}

/** Simplified Chinese copy, typed against `en`. */
export const zh: typeof en = {
  panel: '会话监视器',
  title: '会话监视器',
  description: '把每个活跃和最近使用的会话放在一张网格里：实时记录或会话流程、待回答的问题，以及每张卡片自带的输入框。',
  shown: '显示 {count} 个',
  waitingCount: '{count} 个待回答',
  runningCount: '{count} 个运行中',
  cards: '卡片数',
  fewerCards: '减少一张卡片',
  moreCards: '增加一张卡片',
  columns: '每行',
  auto: '自动',
  viewMode: '视图模式',
  viewCards: '记录',
  viewFlow: '流程',
  flowStatusRunning: '运行中',
  flowStatusWaiting: '等待你处理',
  flowStatusDone: '回合完成',
  flowStatusFailed: '回合失败',
  flowStatusIdle: '空闲',
  flowTurnLabel: '第 {turn} 回合',
  flowElapsedLabel: '已用 {time}',
  flowRailLabel: '本回合：{total} 步中已完成 {done} 步',
  flowDoneCount: '完成 {count}',
  flowRunningCount: '运行 {count}',
  flowFailedCount: '失败 {count}',
  flowStepNumberLabel: '步骤 {label}',
  flowSessionHeading: '整个会话',
  flowPromptTag: '你',
  flowOmitted: '另有 {count} 项更早',
  flowActivityThinking: '思考中',
  flowActivityTool: '正在运行 {tool}',
  flowActivityApproval: '等待你的授权',
  flowActivityQuestion: '等待你的回答',
  flowActivityDone: '这个回合已完成',
  flowActivityIdle: '等待你的下一条消息',
  flowStepWriting: '写入 {name}',
  flowStepEditing: '修改 {name}',
  flowStepWritingMore: '写入 {name} 等 {count} 个文件',
  flowStepEditingMore: '修改 {name} 等 {count} 个文件',
  flowBashPurposeTests: '运行测试',
  flowBashPurposeInstall: '安装依赖',
  flowBashPurposeBuild: '构建项目',
  flowBashPurposeSearch: '搜索代码',
  flowBashPurposeGit: '执行 Git 操作',
  flowBashPurposeNetwork: '访问网络',
  flowBashPurposeFiles: '查看或修改文件',
  flowBashPurposeProcesses: '检查系统进程',
  flowBashPurposeScript: '运行脚本',
  flowBashPurposePackages: '管理依赖包',
  flowBashPurposeGeneric: '执行命令',
  flowStepWork: '工作中',
  flowEmptyTitle: '还没有活动',
  flowEmptyHint: '开始一个回合后，它的步骤会显示在这里。',
  flowOpeningHistory: '正在打开会话…',
  flowHistoryFailed: '无法读取会话历史。',
  flowErrorLine: '回合因错误而停止',
  flowPromptsCount: '{count} 个提示',
  flowPromptsCountOne: '1 个提示',
  flowStepsCount: '{count} 步',
  flowStepsCountOne: '1 步',
  restoreAll: '恢复已移除（{count}）',
  restoreNone: '没有已移除的会话',
  newSession: '新会话',
  newSessionWorkspace: '新会话所属工作区',
  newSessionHint: '在「{workspace}」中新建会话，并在此显示卡片',
  newSessionStarting: '正在创建…',
  newSessionPicking: '正在选择文件夹…',
  newSessionAdopting: '正在添加工作区…',
  newSessionFailed: '无法创建会话：{reason}',
  pickFolder: '选择文件夹…',
  noWorkspace: '尚无工作区',
  defaultWorkspace: '默认工作区',
  emptyTitle: '没有可监视的会话',
  emptyBody: '开始一个新会话，或恢复从这个网格中移除的会话。',
  panelFailed: '这个页面无法显示',
  panelFailedBody:
    '有会话返回了这个页面无法读取的内容。没有做任何修改。请重试，页面会重新加载。',
  panelRetry: '重试',
  cardFailed: '这张卡片无法显示',
  cardFailedBody: '这个会话返回了这张卡片无法读取的内容。会话本身不受影响。',
  cardRetry: '重试',
  waiting: '等待你回答',
  working: '运行中',
  completed: '已完成',
  idle: '空闲',
  usageTokens: '{tokens} tok',
  usageCacheHit: '缓存 {percent}%',
  usageContext: '上下文 {percent}%',
  usageLabel: '会话用量',
  usageTokensTitle: '本会话已用 token：{tokens}',
  usageCacheHitTitle: '提示缓存命中：{percent}%',
  usageContextTitle: '上下文窗口：已用 {percent}%（{used} / {window}）',
  remove: '从监视器中移除',
  openSession: '打开会话',
  permission: '权限',
  permReadOnly: '仅可查看',
  permWorkspaceWrite: '工作区内修改',
  permFullAccess: '完全权限',
  permAuto: '自动审查',
  permCustom: '自定义',
  permConfirmAuto: '自动审查让宿主自行决定每个请求，属于实验功能。',
  permConfirmCancel: '取消',
  permConfirmSwitch: '切换',
  permFailed: '权限切换未被接受',
  queuedCount: '{count} 条排队',
  queuedMore: '还有 {count} 条',
  steerQueued: '插话发送这条排队消息',
  steerUnavailable: '仅运行中可插话发送',
  steerQueuedFailed: '插话发送失败，请重试。',
  queueEdit: '编辑排队消息',
  queueSave: '保存排队消息',
  queueCancelEdit: '取消编辑',
  queueEditUnsupported: '这条排队消息没有可编辑的文字',
  queueDiscard: '丢弃排队消息',
  queueEditFailed: '排队消息编辑失败',
  queueDiscardFailed: '排队消息丢弃失败',
  queueAttachment: '附件',
  model: '模型',
  modelLoading: '正在加载模型…',
  modelUnavailable: '选择模型',
  modelFailed: '模型切换未被接受',
  stop: '停止',
  stopping: '正在停止…',
  stopHint: '停止当前回合',
  stopFailed: '无法停止这个会话',
  noHistory: '还没有消息',
  opening: '正在打开历史…',
  openFailed: '无法打开历史记录',
  approvalAsked: '请求审批：{tool}',
  approvalDecided: '审批结果：{outcome}',
  retry: '模型请求重试',
  retryReason: '模型重试：{reason}',
  questionTitle: '这个会话正在向你提问',
  approvalTitle: '需要授权：{tool}',
  reason: '原因',
  allow: '允许一次',
  reject: '拒绝',
  submit: '提交',
  skip: '跳过',
  custom: '输入回答…',
  answering: '发送中…',
  answerFailed: '回答未被接受',
  noOptions: '没有提供选项',
  placeholder: '给这个会话发消息…',
  send: '发送',
  sending: '发送中…',
  promptFailed: '消息未被接受',
  nowLabel: '刚刚',
  minutesAgo: '{count} 分钟前',
  hoursAgo: '{count} 小时前',
  daysAgo: '{count} 天前',
  credit: 'v{version} | Author: icrefin [icrefinai@gmail.com]',
}

/** Key union of this plugin's dictionary. */
export type MonitorKey = keyof typeof en

/** Translate seat the page receives from the slot framework. */
export type MonitorTranslate = (key: MonitorKey, params?: Record<string, string | number>) => string