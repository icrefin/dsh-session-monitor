/**
 * Fold one Session's durable event log into the session-wide flow model.
 *
 * This is the derivation behind the `dsh-session-progress` panel, ported here
 * verbatim so a monitor card can draw the same view: every human prompt is a
 * numbered entry (`1`, `2`, `3` …), every agent-loop step is numbered under its
 * prompt (`1.1`, `1.2`, `2.1` …), and the current activity (running tool,
 * thinking text, blocking interaction) is derived from the tail of the same log.
 *
 * Reading the event log, not the Chat window, is what makes "the whole session"
 * honest: the window is built for a viewport, the log is the session.
 *
 * Everything is total and defensive. A missing field or a foreign shape yields an
 * empty model instead of a throw, because this runs inside a slot renderer where
 * one throw blanks the card.
 *
 * @module dsh-session-monitor/client/flowProgress
 */

import type { BlockLike, EventEntryLike, PendingInteractionLike } from './types.ts'

/** How one step of the session ended. */
export type StepStatus = 'done' | 'running' | 'error'

/** What the session is doing right now. */
export type ActivityKind = 'tool' | 'thinking' | 'waiting' | 'idle'

/** A file the step created or changed. */
export interface StepFile {
  /** `write` creates a file, `edit` changes one in place. */
  readonly verb: 'write' | 'edit'
  /** Short name: the last two path segments. */
  readonly name: string
}

/** One human prompt: the numbered group a run of steps belongs to. */
export interface PromptItem {
  readonly kind: 'prompt'
  /** Stable identity for React: the prompt's position in the session. */
  readonly key: string
  /** One-based prompt number, as shown at the start of the row. */
  readonly index: number
  /** Epoch milliseconds of the prompt. */
  readonly at: number
  /** The prompt text, clipped to a readable block. */
  readonly text: string
}

/** One agent-loop step of the session. */
export interface StepItem {
  readonly kind: 'step'
  readonly key: string
  readonly at: number
  /** One-based number of the prompt this step answers. */
  readonly prompt: number
  /** One-based number among the *shown* steps of the prompt, after hidden ones are dropped. */
  readonly index: number
  /** Display label: `1.1`, `1.2`, `2.1` … */
  readonly label: string
  readonly status: StepStatus
  /** The agent's own words for this step, clipped to two display lines; may be empty. */
  readonly text: string
  /** Thinking text still arriving, for the step that runs. */
  readonly live: string
  /** Distinct tool names this step called, in call order. */
  readonly tools: readonly string[]
  /** Every distinct file this step wrote or changed, in touch order. */
  readonly files: readonly StepFile[]
  /** The newest file this step wrote or changed. */
  readonly file: StepFile | undefined
  /**
   * The command behind a shell step, when the agent wrote no words.
   *
   * Internal only: this is the text a describing model reads, and it is never
   * drawn. The row shows the command's purpose instead.
   */
  readonly command: string | undefined
  /** Number of tool calls this step made. */
  readonly calls: number
  /** Number of those calls whose result failed. */
  readonly failed: number
}

/** One row of the session list. */
export type SessionItem = PromptItem | StepItem

/** The running activity card. */
export interface ProgressActivity {
  readonly kind: ActivityKind
  /** Tool name, for `tool`. */
  readonly tool: string | undefined
  /** One-line argument hint, for `tool`. */
  readonly detail: string | undefined
  /** The command a running shell tool is executing; internal, never drawn. */
  readonly command?: string | undefined
  /** Thinking text still arriving, for `thinking`. */
  readonly text: string | undefined
}

/** Everything the panel draws for one session. */
export interface ProgressModel {
  /** Whether a Session binding produced an event window. */
  readonly present: boolean
  /** The whole session, oldest first: prompts and their steps. */
  readonly items: readonly SessionItem[]
  /** Items dropped from the front by the safety cap. */
  readonly omitted: number
  /** Human prompts the session holds. */
  readonly prompts: number
  /** Steps the session holds, across every prompt. */
  readonly stepTotal: number
  /** A turn is running: the session's run state says so. */
  readonly running: boolean
  /** The session is blocked on the user. */
  readonly waiting: boolean
  /** The current turn number, as the agent loop counts it; 0 when none. */
  readonly turn: number
  /** The current prompt's text, clipped for the header. */
  readonly prompt: string
  /** The current turn's start, in epoch milliseconds; 0 when unknown. */
  readonly startedAt: number
  /** The current turn's end, in epoch milliseconds; 0 while it runs. */
  readonly endedAt: number
  /** Steps of the current prompt that finished. */
  readonly done: number
  /** Steps of the current prompt still running. */
  readonly current: number
  /** Steps of the current prompt that failed. */
  readonly failed: number
  readonly activity: ProgressActivity
  /** The current turn's error message, when it failed. */
  readonly error: string | undefined
}

/** The model a session with no history and no run state draws. */
export const EMPTY_PROGRESS: ProgressModel = {
  present: false,
  items: [],
  omitted: 0,
  prompts: 0,
  stepTotal: 0,
  running: false,
  waiting: false,
  turn: 0,
  prompt: '',
  startedAt: 0,
  endedAt: 0,
  done: 0,
  current: 0,
  failed: 0,
  activity: { kind: 'idle', tool: undefined, detail: undefined, text: undefined },
  error: undefined,
}

/**
 * Hard cap on rows one panel renders.
 *
 * The requirement is the whole session; this only protects the renderer from a
 * session so long that its DOM would freeze the page. At the cap the newest rows
 * survive and the header keeps the true totals.
 */
export const MAX_ITEMS = 4_000

/** Longest command the purpose fallback classifier reads, in characters. */
const MAX_COMMAND_CHARS = 600

/**
 * Normalize one shell command into the exact single-line text the local
 * purpose classifier reads.
 *
 * The command is collapsed to one line and clipped: a shell script's purpose is
 * carried by its opening. This text is never drawn; it only chooses a phrase.
 *
 * @param text - the raw command.
 * @param maxChars - character ceiling.
 * @returns the normalized command.
 */
export function normalizeCommandText(text: string, maxChars: number = MAX_COMMAND_CHARS): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim()
  if (collapsed.length <= maxChars) return collapsed
  return `${collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

/** Longest prompt the list shows before it clips with an ellipsis. */
const PROMPT_CHARS = 600

/** Longest step description, matching two comfortable display lines. */
const STEP_CHARS = 180

/** Longest live thinking preview. */
const THINKING_CHARS = 160

/** Longest argument hint shown in the activity card. */
const DETAIL_CHARS = 96

/**
 * User-message source kind that is a prompt the user typed.
 *
 * Approval and question replies are human too, but they are not prompts: they
 * answer a request the session already made and would otherwise inflate the
 * prompt numbering. The list is prompt-centric, so only this kind starts a group.
 */
const PROMPT_SOURCE = 'user'

/** Tool names that run a command line. */
const SHELL_TOOLS: ReadonlySet<string> = new Set([
  'bash',
  'shell',
  'sh',
  'zsh',
  'pwsh',
  'powershell',
  'exec',
  'command',
  'terminal',
])

/** Argument keys that carry the command a shell tool runs. */
const COMMAND_ARGUMENT_KEYS = ['command', 'cmd', 'script', 'line'] as const

/** Tool names that create a file. */
const WRITE_TOOLS: ReadonlySet<string> = new Set(['write'])

/** Tool names that change a file in place. */
const EDIT_TOOLS: ReadonlySet<string> = new Set([
  'edit',
  'apply_patch',
  'patch',
  'multi_edit',
  'multiedit',
  'str_replace',
  'str_replace_editor',
])

/** Call arguments that name the file a tool works on. */
const FILE_ARGUMENT_KEYS = ['file_path', 'filePath', 'path', 'file', 'filename', 'target', 'destination'] as const

/** Collapse whitespace and clip one line. */
function clip(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim()
  if (collapsed.length <= maxChars) return collapsed
  return `${collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

/**
 * Flatten light Markdown out of one line of model text.
 *
 * Assistant text arrives as Markdown; a step title is a calm line, not a
 * document. Only the constructs that cost nothing to drop are removed — the text
 * itself is never rewritten.
 *
 * @param text - raw model text.
 * @param maxChars - ceiling in characters.
 * @returns the flattened line.
 */
function plainLine(text: string, maxChars: number): string {
  const flattened = text
    .replace(/```[\s\S]*?(?:```|$)/gu, ' ')
    .replace(/`([^`]*)`/gu, '$1')
    .replace(/\*\*([^*\n]+)\*\*/gu, '$1')
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gmu, '')
    .replace(/^>\s?/gmu, '')
  return clip(flattened, maxChars)
}

/** Read one field of a foreign object without trusting its type. */
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  return (value as Record<string, unknown>)[key]
}

/** Read one string field. */
function textField(value: unknown, key: string): string | undefined {
  const read = field(value, key)
  return typeof read === 'string' ? read : undefined
}

/** Read one finite number field. */
function numberField(value: unknown, key: string): number | undefined {
  const read = field(value, key)
  return typeof read === 'number' && Number.isFinite(read) ? read : undefined
}

/** Whether a timing value is a usable epoch-millisecond instant. */
function instant(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * The text of one block list, in order.
 *
 * Assistant blocks carry `kind`; message content carries `type`. Both are read so
 * one helper serves a user message and an assistant message.
 *
 * @param blocks - the block list.
 * @param kinds - the discriminators to keep (`text` when omitted).
 * @returns the joined text.
 */
function blocksText(blocks: readonly BlockLike[] | undefined, kinds: readonly string[] = ['text']): string {
  if (!Array.isArray(blocks)) return ''
  const parts: string[] = []
  for (const block of blocks) {
    const discriminator = block?.kind ?? block?.type
    if (discriminator === undefined || !kinds.includes(discriminator)) continue
    const text = block.text
    if (typeof text === 'string' && text.trim() !== '') parts.push(text)
  }
  return parts.join('\n').trim()
}

/** The blocks of one message, when they are present and shaped like a list. */
function blocksOf(value: unknown): readonly BlockLike[] | undefined {
  return Array.isArray(value) ? (value as readonly BlockLike[]) : undefined
}

/**
 * Shorten one file path to the last two segments.
 * @param path - the path a tool call named.
 * @returns the short name.
 */
export function shortFileName(path: string): string {
  const parts = path
    .replace(/[\\/]+$/u, '')
    .split(/[\\/]+/u)
    .filter((part) => part !== '')
  if (parts.length === 0) return path.trim()
  const tail = parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : parts[0] ?? ''
  return tail.length > 46 ? (parts[parts.length - 1] ?? tail) : tail
}

/**
 * One-line argument hint for a tool call.
 * @param argumentsText - the call's raw arguments.
 * @returns the hint, or an empty string.
 */
export function summarizeArguments(argumentsText: string | undefined): string {
  if (argumentsText === undefined || argumentsText.trim() === '') return ''
  try {
    const parsed: unknown = JSON.parse(argumentsText)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return ''
    const keys = Object.keys(parsed).slice(0, 2)
    const shown = keys.map((key) => {
      const value = (parsed as Record<string, unknown>)[key]
      const rendered =
        typeof value === 'string'
          ? value.replace(/\s+/gu, ' ').trim()
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : Array.isArray(value)
              ? `[${value.length}]`
              : '…'
      return `${key}=${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`
    })
    return clip(shown.join(' · '), DETAIL_CHARS)
  } catch {
    return clip(argumentsText, DETAIL_CHARS)
  }
}

/**
 * Read the file path a tool call names, when it names one.
 * @param argumentsText - the call's raw arguments.
 * @returns the path, or undefined.
 */
export function argumentFilePath(argumentsText: string | undefined): string | undefined {
  if (argumentsText === undefined || argumentsText.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsText)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  for (const key of FILE_ARGUMENT_KEYS) {
    const value = (parsed as Record<string, unknown>)[key]
    if (typeof value !== 'string') continue
    const path = value.trim()
    if (path === '' || path.length > 500 || path.includes('\n')) continue
    return path
  }
  return undefined
}

/**
 * The file one call touched, when the tool is a file writer.
 * @param name - tool name.
 * @param argsRaw - the call's raw arguments.
 * @returns the file action, or undefined.
 */
function fileOf(name: string, argsRaw: string | undefined): StepFile | undefined {
  const verb = WRITE_TOOLS.has(name) ? 'write' : EDIT_TOOLS.has(name) ? 'edit' : undefined
  if (verb === undefined) return undefined
  const path = argumentFilePath(argsRaw)
  if (path === undefined) return undefined
  return { verb, name: shortFileName(path) }
}

/**
 * Every distinct file a step touched, keeping the first verb seen per name.
 * @param files - the file actions in touch order.
 * @returns the distinct actions, in first-touch order.
 */
function distinctFiles(files: readonly StepFile[]): StepFile[] {
  const seen = new Set<string>()
  const out: StepFile[] = []
  for (const file of files) {
    if (seen.has(file.name)) continue
    seen.add(file.name)
    out.push(file)
  }
  return out
}

/**
 * Whether a tool name runs a command line.
 * @param name - the tool name.
 * @returns true for a shell tool.
 */
export function isShellTool(name: string): boolean {
  return SHELL_TOOLS.has(name)
}

/**
 * The command one shell-tool call runs, in the shared normalized form.
 *
 * The whole command is kept (collapsed to one line, clipped), not its first
 * line: the describing model needs the actual work, and this text is never
 * drawn. An identical normalization in both halves makes the purpose cache hit.
 *
 * @param name - tool name.
 * @param argsRaw - the call's raw arguments.
 * @returns the normalized command, or undefined.
 */
export function commandArgument(name: string, argsRaw: string | undefined): string | undefined {
  if (!isShellTool(name) || argsRaw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  for (const key of COMMAND_ARGUMENT_KEYS) {
    const value = (parsed as Record<string, unknown>)[key]
    if (typeof value !== 'string') continue
    const command = normalizeCommandText(value)
    if (command !== '') return command
  }
  return undefined
}

/**
 * The command behind a step's shell call, as the text a model describes.
 *
 * A shell step the agent explains with its own words needs no command; a step
 * with no words would otherwise be a meaningless tool-only row.
 *
 * @param calls - the step's tool calls, in order.
 * @returns the normalized command, or undefined when no shell call carried one.
 */
function shellCommand(calls: readonly CallDraft[]): string | undefined {
  for (const call of calls) {
    const command = commandArgument(call.name, call.argsRaw)
    if (command !== undefined) return command
  }
  return undefined
}

/** One tool call folded into a step. */
interface CallDraft {
  readonly callId: string
  readonly name: string
  readonly argsRaw: string | undefined
  readonly at: number
}

/** One step while it is being folded. */
interface StepDraft {
  readonly kind: 'step'
  readonly key: string
  prompt: number
  index: number
  at: number
  texts: string[]
  liveText: string
  calls: CallDraft[]
  files: StepFile[]
  failed: number
  open: boolean
  error: boolean
}

/** One prompt while the list is folded. */
interface PromptDraft {
  readonly kind: 'prompt'
  readonly key: string
  readonly index: number
  readonly at: number
  readonly text: string
}

/** Options the derivation needs from the caller. */
export interface ProgressOptions {
  /** The session's authoritative run state, or undefined when the projection is absent. */
  readonly sessionRunning: boolean | undefined
  /** Whether the session is blocked on the user. */
  readonly waiting: boolean
  /** The pending interaction, when there is one. */
  readonly pending?: PendingInteractionLike | undefined
}

/**
 * The localized text of one pending interaction, as a plain string.
 *
 * The host publishes approval copy as a locale map on some carriers and a plain
 * string on others; a map handed to React as a child would throw during render,
 * so both shapes are normalized here.
 *
 * @param pending - the pending interaction.
 * @returns the text, or an empty string.
 */
export function pendingText(pending: PendingInteractionLike | undefined): string {
  if (pending === undefined) return ''
  const reason = pending.displayReason
  if (typeof reason === 'string') return reason.trim()
  if (typeof reason === 'object' && reason !== null) {
    for (const value of Object.values(reason)) {
      if (typeof value === 'string' && value.trim() !== '') return value
    }
  }
  if (typeof pending.reason === 'string' && pending.reason.trim() !== '') return pending.reason
  const question = pending.questions?.[0]?.question
  if (typeof question === 'string' && question.trim() !== '') return question.trim()
  return ''
}

/** One finalized step before its prompt-consecutive number is assigned. */
type RawStep = Omit<StepItem, 'index' | 'label'>

/**
 * Finalize one folded step into its row, without a display number.
 * @param draft - the folded step.
 * @param running - the session's resolved run state.
 * @returns the row.
 */
function finishStep(draft: StepDraft, running: boolean): RawStep {
  const status: StepStatus = draft.error
    ? 'error'
    : draft.open
      ? running
        ? 'running'
        : 'error'
      : 'done'
  const tools: string[] = []
  for (const call of draft.calls) if (!tools.includes(call.name)) tools.push(call.name)
  const files = distinctFiles(draft.files)
  return {
    kind: 'step',
    key: draft.key,
    at: draft.at,
    prompt: draft.prompt,
    status,
    text: plainLine(draft.texts.join(' '), STEP_CHARS),
    live: draft.open ? plainLine(draft.liveText, THINKING_CHARS) : '',
    tools,
    files,
    file: files[files.length - 1],
    command: shellCommand(draft.calls),
    calls: draft.calls.length,
    failed: draft.failed,
  }
}

/**
 * Whether a step says anything worth a row.
 *
 * A row is only useful if it names a purpose: the agent's words (settled or still
 * streaming), a file it wrote or changed, or the command it ran. A tool-only step
 * with none of them ("Using read") is noise — the requirement is progress, not a
 * tool log — so it is dropped, and the shown steps of the prompt are renumbered
 * without gaps. File writes are never dropped.
 *
 * @param step - the finalized step.
 * @returns true when the step belongs in the list.
 */
function hasPurpose(step: RawStep): boolean {
  return step.text !== '' || step.live !== '' || step.files.length > 0 || step.command !== undefined
}

/**
 * Fold one Session's event window into the progress model.
 *
 * @param entries - the Session binding's event entries, oldest first.
 * @param options - run state and the pending interaction.
 * @returns the model the panel draws.
 */
export function deriveProgress(
  entries: readonly EventEntryLike[] | undefined,
  options: ProgressOptions,
): ProgressModel {
  if (!Array.isArray(entries) || entries.length === 0) {
    const activity: ProgressActivity = options.waiting
      ? {
          kind: 'waiting',
          tool: options.pending?.toolName,
          detail: clip(pendingText(options.pending), DETAIL_CHARS) || undefined,
          command: undefined,
          text: undefined,
        }
      : { kind: 'idle', tool: undefined, detail: undefined, command: undefined, text: undefined }
    return {
      ...EMPTY_PROGRESS,
      present: entries !== undefined,
      waiting: options.waiting,
      running: options.sessionRunning === true,
      activity,
    }
  }

  const rows: (PromptDraft | StepDraft)[] = []
  /** The step that is still open (no `step/end` yet). */
  let openStep: StepDraft | undefined
  let promptIndex = 0
  let stepIndex = 0
  let promptText = ''
  let turn = 0
  let turnStart = 0
  let turnEnd = 0
  let turnError: string | undefined
  /** The step that would carry a turn-level failure. */
  let lastStep: StepDraft | undefined
  /** Call identity → the step that owns it. */
  const callOwners = new Map<string, StepDraft>()
  /** Calls that have not settled yet, for the activity card. */
  const unsettled: CallDraft[] = []

  const closeStep = (): void => {
    if (openStep === undefined) return
    openStep.open = false
    openStep = undefined
  }

  for (const entry of entries) {
    const event = entry?.event
    if (event === undefined) continue
    const type = event.type
    if (type === undefined) continue
    const time = instant(event.time)
    const data = event.data
    const seq = typeof event.seq === 'number' ? event.seq : 0

    switch (type) {
      case 'user/message': {
        if (textField(field(data, 'source'), 'kind') !== PROMPT_SOURCE) continue
        const text = blocksText(blocksOf(field(data, 'content')))
        if (text === '') continue
        promptIndex += 1
        promptText = clip(text, PROMPT_CHARS)
        const id = textField(data, 'id') ?? String(seq)
        const promptRow: PromptDraft = {
          kind: 'prompt',
          key: `prompt:${id}`,
          index: promptIndex,
          at: time,
          text: promptText,
        }
        // A turn's first prompt is recorded *after* its first `step/start`: the
        // loop opens the step, then claims the queued message into it. The prompt
        // therefore owns the open step and must sit above it, not below it.
        if (openStep !== undefined) {
          openStep.prompt = promptIndex
          const position = rows.indexOf(openStep)
          if (position >= 0) rows.splice(position, 0, promptRow)
          else rows.push(promptRow)
        } else {
          rows.push(promptRow)
        }
        continue
      }
      case 'turn/start': {
        const number = numberField(data, 'turn')
        turn = number ?? turn + 1
        turnStart = time
        turnEnd = 0
        turnError = undefined
        continue
      }
      case 'step/start': {
        closeStep()
        stepIndex = numberField(data, 'step') ?? stepIndex + 1
        const key = `step:${String(seq)}`
        const draft: StepDraft = {
          kind: 'step',
          key,
          prompt: promptIndex,
          // `data.step` is the loop step number and the only stable within-prompt
          // index; it restarts at 1 for every turn.
          index: stepIndex,
          at: time,
          texts: [],
          liveText: '',
          calls: [],
          files: [],
          failed: 0,
          open: true,
          error: false,
        }
        rows.push(draft)
        openStep = draft
        lastStep = draft
        continue
      }
      case 'step/end': {
        closeStep()
        continue
      }
      case 'assistant/message': {
        const text = blocksText(blocksOf(field(field(data, 'message'), 'content')))
        const target = openStep ?? lastStep
        if (target === undefined) continue
        if (text !== '') {
          target.texts.push(text)
          target.liveText = ''
        }
        continue
      }
      case 'assistant/live-chunk': {
        const chunk = field(data, 'chunk')
        if (textField(chunk, 'type') !== 'text-delta') continue
        const delta = textField(chunk, 'text') ?? ''
        if (delta === '') continue
        if (openStep !== undefined) openStep.liveText += delta
        continue
      }
      case 'tool/call': {
        const callId = textField(data, 'callId') ?? `seq-${seq}`
        const name = textField(data, 'name') ?? 'tool'
        const argsRaw = textField(data, 'arguments')
        const target = openStep ?? lastStep
        if (target === undefined) continue
        const call: CallDraft = { callId, name, argsRaw, at: time }
        target.calls.push(call)
        callOwners.set(callId, target)
        unsettled.push(call)
        const file = fileOf(name, argsRaw)
        if (file !== undefined) target.files.push(file)
        continue
      }
      case 'tool/result': {
        const message = field(data, 'message')
        const callId = textField(data, 'toolCallId') ?? textField(message, 'toolCallId')
        if (callId === undefined) continue
        const failed = field(message, 'isError') === true || field(data, 'error') !== undefined
        const index = unsettled.findIndex((call) => call.callId === callId)
        if (index >= 0) unsettled.splice(index, 1)
        const owner = callOwners.get(callId)
        if (failed && owner !== undefined) owner.failed += 1
        continue
      }
      case 'turn/end': {
        turnEnd = time
        const reason = field(data, 'reason')
        const kind = textField(reason, 'kind')
        if (kind === 'error') {
          const error = field(reason, 'error')
          const message = textField(error, 'message') ?? textField(error, 'code')
          turnError = message === undefined ? '' : clip(message, 200)
          if (lastStep !== undefined) lastStep.error = true
        }
        if (lastStep !== undefined) lastStep.open = false
        openStep = undefined
        continue
      }
      default:
        continue
    }
  }

  const running =
    typeof options.sessionRunning === 'boolean' ? options.sessionRunning : openStep !== undefined

  const items: SessionItem[] = []
  /** Shown steps per prompt, which is what the display number counts. */
  const counters = new Map<number, number>()
  let stepTotal = 0
  for (const row of rows) {
    if (row.kind === 'prompt') {
      items.push({ kind: 'prompt', key: row.key, index: row.index, at: row.at, text: row.text })
      continue
    }
    const step = finishStep(row, running)
    if (!hasPurpose(step)) continue
    const shown = (counters.get(step.prompt) ?? 0) + 1
    counters.set(step.prompt, shown)
    stepTotal += 1
    items.push({ ...step, index: shown, label: `${step.prompt}.${shown}` })
  }

  const capped = items.length > MAX_ITEMS ? items.slice(-MAX_ITEMS) : items
  // Start at a prompt boundary when one is inside the kept slice, so the list
  // never opens with an orphan step whose prompt is gone.
  let kept = capped
  if (capped.length > 0 && capped[0]?.kind === 'step') {
    const boundary = capped.findIndex((item) => item.kind === 'prompt')
    if (boundary > 0) kept = capped.slice(boundary)
  }
  const omitted = items.length - kept.length

  const lastPrompt = ((): string => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]
      if (row?.kind === 'prompt') return row.text
    }
    return promptText
  })()

  const currentSteps = kept.filter(
    (item): item is StepItem => item.kind === 'step' && item.prompt === promptIndex,
  )
  let done = 0
  let current = 0
  let failed = 0
  for (const step of currentSteps) {
    if (step.status === 'done') done += 1
    else if (step.status === 'running') current += 1
    else failed += 1
  }

  const activity: ProgressActivity = options.waiting
    ? {
        kind: 'waiting',
        tool: options.pending?.toolName,
        detail: clip(pendingText(options.pending), DETAIL_CHARS) || undefined,
        command: undefined,
        text: undefined,
      }
    : running
      ? unsettled.length > 0
        ? (() => {
            const call = unsettled[unsettled.length - 1]
            return {
              kind: 'tool' as const,
              tool: call?.name ?? 'tool',
              detail: summarizeArguments(call?.argsRaw) || undefined,
              command: call === undefined ? undefined : commandArgument(call.name, call.argsRaw),
              text: undefined,
            }
          })()
        : {
            kind: 'thinking' as const,
            tool: undefined,
            detail: undefined,
            command: undefined,
            text: plainLine(openStep?.liveText ?? '', THINKING_CHARS) || undefined,
          }
      : { kind: 'idle', tool: undefined, detail: undefined, command: undefined, text: undefined }

  return {
    present: true,
    items: kept,
    omitted,
    prompts: promptIndex,
    stepTotal,
    running,
    waiting: options.waiting,
    turn,
    prompt: lastPrompt,
    startedAt: turnStart,
    endedAt: turnEnd,
    done,
    current,
    failed,
    activity,
    error: turnError === '' ? undefined : turnError,
  }
}

/**
 * Format one step's start instant as the row's timestamp: `HH:MM:SS`.
 *
 * Local time, because the reader is looking at a clock they share with the
 * session. The date is deliberately absent: the row is a time-of-day marker in a
 * narrow rail, and the full instant stays on the `<time>` element for machines.
 * An absent or unusable instant yields an empty string, and the row omits the
 * line.
 *
 * @param at - epoch milliseconds of the step's start.
 * @returns the clock stamp, or an empty string.
 */
export function formatStamp(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return ''
  const date = new Date(at)
  const time = date.getTime()
  if (Number.isNaN(time)) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * Format one duration as a clock a narrow pane can read: `0:07`, `1:05`,
 * `1:02:03`.
 *
 * @param milliseconds - elapsed milliseconds.
 * @returns the clock text.
 */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(milliseconds) ? milliseconds : 0) / 1_000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3_600)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
