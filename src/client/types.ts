/**
 * The foreign shapes this bundle reads.
 *
 * Nothing here is imported from the harness: these are structural faces of
 * values that cross a plugin boundary at runtime (the Session catalog, the
 * unified Session status projection, one pending interaction, and one event
 * window entry). The harness ships no `.d.ts` for them, and an external plugin
 * must survive a field disappearing — so every consumer treats these fields as
 * optional and guards each read.
 *
 * @module dsh-session-monitor/client/types
 */

/** One row of the client Session catalog (`ctx.sessions.list`). */
export interface SessionRowLike {
  /** Session identity. */
  readonly id: string
  /** Host-derived display title, already localized by the catalog. */
  readonly displayTitle?: string
  /** Raw session title when the title projection has one. */
  readonly title?: string
  /** Host-asserted live run state. */
  readonly running?: boolean
  /** Provisional blank session (no turn has started). */
  readonly blank?: boolean
  /** Recency: the later of the summary timestamp and the last user prompt. */
  readonly updatedAt?: number
  /** Workspace directory the session runs in. */
  readonly cwd?: string
  /** Parent session for a subagent catalog row. */
  readonly parentId?: string
  /** `'subagent'` for a child session. */
  readonly origin?: string
}

/** The catalog snapshot: `ids` + `byId`, ordered as the host listed them. */
export interface SessionListSnapshotLike {
  readonly ids?: readonly string[]
  readonly byId?: Readonly<Record<string, SessionRowLike>>
  /** `pending` until the first successful list pull. */
  readonly phase?: string
}

/** One option of one asked question. */
export interface QuestionOptionLike {
  readonly label?: string
  readonly description?: string
}

/** One question of one pending `ask_user_question` batch. */
export interface QuestionLike {
  readonly id?: string
  readonly header?: string
  readonly question?: string
  readonly options?: readonly QuestionOptionLike[]
  readonly multiSelect?: boolean
  readonly detail?: string
}

/**
 * One pending interaction as published to the `uiSession` projection.
 *
 * Two shipped domains publish here: approvals (`kind: 'approval'`) and user
 * questions (`kind: 'question' | 'plan-review'`). Both carriers expose an
 * `answer()` method — the same method their own composer panel calls — which is
 * why the monitor can settle a request shown in another session without owning
 * that session's conversation surface.
 */
export interface PendingInteractionLike {
  /** Domain discriminator; absent on a carrier that predates the tag. */
  readonly kind?: string
  /** Opaque render identity. */
  readonly key?: string
  /** Owning session. */
  readonly sessionId?: string
  /** Tool requesting an approval decision. */
  readonly toolName?: string
  /** Human-readable reason supplied by the asker. */
  readonly reason?: string
  /** Localized presentation copy, when the asker supplied one. */
  readonly displayReason?: string
  /** Correlated tool call, when one exists. */
  readonly callId?: string
  /** Whether the carrier can still accept a decision. */
  readonly answerable?: boolean
  /** The asked question batch. */
  readonly questions?: readonly QuestionLike[]
  /** Settle this interaction: an approval outcome or an answer batch. */
  answer?: (value: unknown) => Promise<unknown> | unknown
}

/** One session's entry in the unified status projection (`ctx.uiSession.sessionStatus`). */
export interface SessionStatusLike {
  readonly running?: boolean
  readonly pendingInteraction?: PendingInteractionLike | undefined
  readonly completionUnread?: boolean
}

/** A durable session event or a Client-only transient chunk. */
export interface EventLike {
  readonly type?: string
  readonly seq?: number
  readonly time?: number
  readonly data?: unknown
}

/** One entry of the contiguous event window behind a Session binding. */
export interface EventEntryLike {
  readonly type?: string
  readonly event?: EventLike
}

/** The event window snapshot behind a Session binding. */
export interface EventWindowLike {
  readonly entries?: readonly EventEntryLike[]
  readonly hasMore?: boolean
}

/** The observable snapshot face every projection shares. */
export interface ObservableSnapshotLike<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** The `permissions` projection snapshot: one preset value for the session. */
export interface PermissionsSnapshotLike {
  readonly currentValue?: string
}

/** The lifecycle snapshot a bound Session publishes (`SessionSnapshot.running`). */
export interface SessionSnapshotLike {
  readonly running?: boolean
  readonly blank?: boolean
  readonly removed?: boolean
  /** `'cold' | 'loading' | 'open' | 'error'` (the last one means the tail stream died). */
  readonly openState?: string
}

/** One selectable permission preset from the process catalog. */
export interface PermissionOptionLike {
  /** Machine name submitted to `/permission` (`read-only`, `workspace-write`, …). */
  readonly value?: string
  /** Host-supplied display name. */
  readonly name?: string
  /** Host-supplied description. */
  readonly description?: string
}

/** The process-level permission catalog behind the `permissionPresets` Remote. */
export interface PermissionCatalogLike {
  readonly options?: readonly PermissionOptionLike[]
  /** Preset pinned into fresh sessions; not the running session's value. */
  readonly defaultPreset?: string
}

/** One Remote invocation outcome, shaped like the Gateway's `RemoteResult`. */
export interface RemoteResultLike<T> {
  readonly ok?: boolean
  readonly value?: T
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** One slash-command execution outcome from `Session.command()`. */
export interface CommandResultLike {
  readonly ok?: boolean
  readonly value?: { readonly matched?: boolean }
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** The queue mutations the main-view queue dock performs on one row. */
export type QueueActionLike =
  | { readonly kind: 'steer' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'edit'; readonly content: readonly { readonly type: 'text'; readonly text: string }[] }

/** One queued message of the session's `next-turn` inbox. */
export interface QueueRowLike {
  /** Queue row identity the Host's edit/remove/steer action addresses. */
  readonly id?: string
  /** The queued message content blocks. */
  readonly content?: readonly { readonly type?: string; readonly text?: string }[]
}

/** The session `inbox` projection snapshot. */
export interface InboxSnapshotLike {
  /** Messages queued for the next turn, in FIFO order. */
  readonly 'next-turn'?: readonly QueueRowLike[]
}

/** The queue mutation outcome (`Session.updateQueue`). */
export interface UpdateQueueResultLike {
  readonly ok?: boolean
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** The `remote.permissionPresets` namespace this bundle reads. */
export interface PermissionPresetsLike {
  catalog?(): Promise<RemoteResultLike<PermissionCatalogLike>>
}

/**
 * The `ctx.remote` face this bundle uses.
 *
 * Only the permission catalog is read, and it is optional: a composition
 * without permission presets publishes no `permissionPresets` namespace, and
 * the cards then render without a permission control.
 */
export interface RemoteServiceLike {
  readonly permissionPresets?: PermissionPresetsLike
  /** Payload-free invalidation for the catalog; subscribe before the first read. */
  $on?(event: 'permission-presets/catalog-changed', listener: () => void): () => void
}

/** The session object a retention reference binds (`SessionFace`). */
export interface SessionFaceLike {
  readonly sessionId?: string
  readonly projections?: { faceOf?(key: string): ObservableSnapshotLike<unknown> | undefined }
  /** Run one slash-command line in this session — the `/permission` write path. */
  command?(line: string): Promise<CommandResultLike | undefined>
  /** Edit, remove or steer one queued message — the main-view queue dock's own actions. */
  updateQueue?(id: string, action: QueueActionLike): Promise<UpdateQueueResultLike | undefined>
  /** Stop the running turn — the composer's Stop button action. */
  cancel?(): Promise<UpdateQueueResultLike | undefined>
  /** Live lifecycle snapshot; its `running` bit is the authoritative per-session state. */
  getSnapshot?(): SessionSnapshotLike
  /** Subscribe to lifecycle changes (running, blank, errors, queue echoes). */
  subscribe?(listener: () => void): () => void
  /** Rebuild the history window and tail stream after a terminal stream failure. */
  resync?(): Promise<void>
  prompt?(
    content: readonly { readonly type: 'text'; readonly text: string }[],
    mode: 'queue' | 'steer',
    signal?: AbortSignal,
    requestId?: string,
  ): Promise<unknown>
}

/** One model in a provider group of the session's model catalog. */
export interface ModelOptionLike {
  readonly id?: string
  readonly name?: string
  readonly reasoning?: { readonly defaultEffort?: string }
}

/** One provider and its models, as the model directory publishes them. */
export interface ModelGroupLike {
  readonly id?: string
  readonly name?: string
  readonly models?: readonly ModelOptionLike[]
}

/** One provider/model/reasoning selection. */
export interface ModelSelectionLike {
  readonly provider?: string
  readonly model?: string
  readonly reasoningEffort?: string
}

/** One session's model directory snapshot. */
export interface ModelDirectoryStateLike {
  readonly current?: ModelSelectionLike | null
  readonly pending?: ModelSelectionLike | null
  readonly groups?: readonly ModelGroupLike[]
  readonly status?: string
}

/** The observable store one session's model directory publishes. */
export interface ModelDirectoryStoreLike {
  getSnapshot(): ModelDirectoryStateLike
  subscribe(listener: () => void): () => void
}

/** One session's shared model directory (`ctx.modelDirectories.directoryFor`). */
export interface ModelDirectoryLike {
  readonly store?: ModelDirectoryStoreLike
  load?(): Promise<unknown>
  select?(selection: ModelSelectionLike): Promise<UpdateQueueResultLike | undefined>
}

/** The `ctx.uiWorkspace` face this bundle uses — navigation to one session. */
export interface UiWorkspaceServiceLike {
  openSession?(sessionId: string): void
}

/** The `ctx.modelDirectories` service face this bundle uses. */
export interface ModelDirectoriesServiceLike {
  directoryFor?(sessionId: string): ModelDirectoryLike
}

/** One retention reference returned by `ctx.sessions.retain`. */
export interface SessionReferenceLike {
  readonly sessionId?: string
  readonly ready?: Promise<{ readonly session?: SessionFaceLike; readonly eventSource?: ObservableSnapshotLike<EventWindowLike> }>
  release?(): void
}

/** One Workspace row of `ctx.workspaces.list`. */
export interface WorkspaceViewLike {
  readonly workspaceId?: string
  /** Renamable Workspace title shown in the sidebar. */
  readonly title?: string
  /** Directory the Workspace points at. */
  readonly path?: string
  /** Sessions accounted to this Workspace. */
  readonly sessionIds?: readonly string[]
}

/** The Workspace projection snapshot. */
export interface WorkspacesSnapshotLike {
  readonly items?: readonly WorkspaceViewLike[]
}

/** The `ctx.workspaces` service face this bundle uses. */
export interface WorkspacesServiceLike {
  readonly list?: ObservableSnapshotLike<WorkspacesSnapshotLike>
}

/** The `ctx.sessions` service face this bundle uses. */
export interface SessionsServiceLike {
  readonly list?: ObservableSnapshotLike<SessionListSnapshotLike>
  retain?(target: string, options: { readonly source: string; readonly signal?: AbortSignal }): SessionReferenceLike
  /** Ask the Host for a fresh catalog baseline (metadata read only). */
  refresh?(): Promise<unknown>
}

/** The `ctx.uiSession` service face this bundle uses. */
export interface UiSessionServiceLike {
  readonly sessionStatus?: ObservableSnapshotLike<ReadonlyMap<string, SessionStatusLike>>
}