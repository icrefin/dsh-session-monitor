/**
 * dsh-session-monitor — browser half.
 *
 * Contributes one row to the sidebar's global panel list (`sidebar.panellist`)
 * and the page it opens in the centre column (`main`), both keyed by
 * {@link PANEL_ID}. The row sits directly below Plugins; selecting it is a
 * lookup in the live `main` registry, so the two registrations must agree.
 *
 * The panel is a pure consumer of harness projections — the Session catalog, the
 * unified status projection, and each opened session's own event window. It
 * registers no route, no tool and no event listener, which is why the host half
 * is empty.
 *
 * `dsh.client.inject` in package.json orders this bundle after the packages that
 * declare those slots and provide those services, so both `slots.inject` calls
 * and both service reads resolve instead of racing the declaration.
 *
 * An external plugin must never take the web shell down: mounting problems are
 * logged, never thrown, because a throwing `apply` fails the whole boot.
 *
 * @module dsh-session-monitor/client
 */

import type { SlotCore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only imports for their declaration merging: these packages declare
// `main` and `sidebar.panellist` in the SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { en, zh, type MonitorKey, type MonitorTranslate } from './locales.ts'
import { MonitorPanel } from './MonitorPanel.tsx'
import { PanelIcon } from './PanelIcon.tsx'
import { inject, NS, PANEL_ID, PANEL_ORDER } from './plugin.ts'
import { resolveRemote } from './remote.ts'
import { resolveSessionStatus } from './sessionStatus.ts'
import { MonitorStore } from './store.ts'
import { injectStyles } from './styles.ts'
import { expandWorkspaceGroup, workspaceIdForSession } from './workspaceReveal.ts'
import type {
  DirectoryPickerLike,
  ModelDirectoriesServiceLike,
  ModelDirectoryLike,
  NewSessionActionsLike,
  RemoteServiceLike,
  SessionsServiceLike,
  UiSessionServiceLike,
  UiWorkspaceServiceLike,
  WorkspaceViewLike,
  WorkspacesServiceLike,
} from './types.ts'

export { inject, NS, PANEL_ID, PANEL_ORDER }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Keys of this plugin's own dictionary. */
    'dsh-session-monitor': MonitorKey
  }
}

/** Structural face of the client locale service. */
interface LocaleService {
  register(namespace: 'dsh-session-monitor', dictionaries: { en: typeof en; zh: typeof zh }): () => void
  bind(namespace: 'dsh-session-monitor'): TranslateNS<'dsh-session-monitor'>
  /**
   * Resolve one localized text map through the active language's fallback
   * chain. Optional: a composition without it leaves the map's English entry.
   */
  resolveText?(text: Readonly<Record<string, string>>): string
}

/** Structural face of the client slot service. */
interface SlotsService {
  readonly register: SlotCore['register']
  /**
   * Run `callback` once the named slot is declared; its disposer is the
   * registration's own, so the effect teardown removes it.
   */
  inject(key: string, callback: () => () => void): () => void
}

/**
 * The client root context this plugin uses.
 *
 * Plain service members (`sessions.list`, `workspaces.list`) are read inside the
 * injection face; an absent projection costs the page live data, not its mount.
 * Nested services are never read through this proxy: the current runtime throws
 * for a dotted name the plugin did not inject, and a render-time throw blanks the
 * panel. `uiWorkspace`, `remote.permissionPresets` and `uiSession.sessionStatus`
 * are therefore resolved with the reflective `get()` instead.
 */
interface ClientContext {
  effect(callback: () => (() => void) | void, label?: string): void
  slots: SlotsService
  locale: LocaleService
  sessions?: SessionsServiceLike
  workspaces?: WorkspacesServiceLike
  remote?: RemoteServiceLike
  /** Reflective read that bypasses the context proxy's inject check (optional service). */
  get?(name: string): unknown
  /** Waits for optional services; the child scope carries them once they exist. */
  inject?(services: string[], callback: (scope: OptionalScope) => void): void
}

/** The optional services the child scope carries once they exist. */
interface OptionalScope {
  modelDirectories?: ModelDirectoriesServiceLike
  uiWorkspace?: UiWorkspaceServiceLike
}

/**
 * Read one optional service without letting its absence or a throwing accessor
 * take the panel down.
 * @param ctx - client root context.
 * @param name - service name, including a Remote namespace's dotted name.
 * @param label - human-readable name for the warning.
 * @returns the service, or `undefined`.
 */
function readService<T>(ctx: ClientContext, name: string, label: string): T | undefined {
  try {
    return ctx.get?.(name) as T | undefined
  } catch (error) {
    console.warn(`[dsh-session-monitor] ${label} could not be read`, error)
    return undefined
  }
}

/**
 * Register the sidebar row and the page it opens.
 * @param ctx - client root context carrying the slot and locale services.
 */
export function apply(ctx: ClientContext): void {
  try {
    ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-session-monitor: dictionaries')
    const t = ctx.locale.bind(NS) as MonitorTranslate
    const store = new MonitorStore()

    /**
     * Resolve a Host-supplied locale map for one card's approval copy.
     *
     * The map must never reach React as a child: an earlier release rendered it
     * directly, and an approval carrying `displayReason` then threw during render
     * and left the whole panel blank until a browser reload. An empty result lets
     * the reader fall back to the map's English entry.
     */
    const resolveText = (text: Readonly<Record<string, string>>): string => {
      try {
        const resolved = ctx.locale.resolveText?.(text)
        return typeof resolved === 'string' ? resolved : ''
      } catch (error) {
        console.warn('[dsh-session-monitor] a localized text could not be resolved', error)
        return ''
      }
    }

    // Read the services once, here: the injection face runs inside the renderer
    // and hands its result to a component's dependency arrays, so a fresh proxy
    // per render would re-subscribe every projection on every frame. `inject`
    // above already gates activation on both services existing.
    /**
     * The model directory service is optional: wait for it in a child scope
     * instead of listing it in this plugin's required injection. The scope also
     * injects `remote.session`, because `directoryFor()` reaches that namespace
     * through the **caller's** context and a cold call would otherwise fail with
     * `cannot get property "remote.session" without inject`.
     */
    let modelDirectories: ModelDirectoriesServiceLike | undefined
    try {
      ctx.inject?.(['modelDirectories', 'remote.session'], (scope) => {
        modelDirectories = scope.modelDirectories
      })
    } catch (error) {
      console.warn('[dsh-session-monitor] the model directory service could not be watched', error)
    }
    const modelDirectoryFor = (sessionId: string): ModelDirectoryLike | undefined => {
      try {
        return modelDirectories?.directoryFor?.(sessionId)
      } catch (error) {
        console.warn(`[dsh-session-monitor] session ${sessionId} exposes no model directory`, error)
        return undefined
      }
    }

    let services: {
      sessions?: SessionsServiceLike
      workspaces?: WorkspacesServiceLike
      remote?: RemoteServiceLike
      modelDirectoryFor?: (sessionId: string) => ModelDirectoryLike | undefined
    } = {}
    try {
      services = {
        sessions: ctx.sessions,
        workspaces: ctx.workspaces,
        remote: resolveRemote(ctx),
        modelDirectoryFor,
      }
    } catch (error) {
      console.warn('[dsh-session-monitor] the Session services could not be read', error)
    }

    /**
     * Open the folded Workspace group that holds one Session, so the row the
     * title just navigated to is actually visible in the sidebar.
     *
     * The ownership read happens on click, not at mount: the Workspace
     * projection and the Session catalog both settle later, and a card can
     * outlive either. Absence of the services, the Workspace row, or a sidebar
     * that is not mounted is not an error — the title still opens the Session.
     * @param sessionId - the Session whose group should open.
     */
    const revealWorkspaceFor = (sessionId: string): void => {
      try {
        const workspaces = services.workspaces?.list?.getSnapshot?.()?.items
        const cwd = services.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
        const workspaceId = workspaceIdForSession(sessionId, workspaces, cwd)
        if (workspaceId === undefined) return
        expandWorkspaceGroup(workspaceId)
      } catch (error) {
        console.warn(
          `[dsh-session-monitor] the Workspace of session ${sessionId} could not be expanded`,
          error,
        )
      }
    }

    /**
     * Navigation and Session creation live in the optional `uiWorkspace`
     * service, read reflectively because this bundle does not require it: a
     * composition without it still mounts the panel, the card titles are simply
     * not links there, and the toolbar renders no new-session control. The read
     * happens when the page mounts (inside the injection face), after every
     * service in the Web composition has registered.
     */
    const openSessionFor = (): ((sessionId: string) => void) | undefined => {
      const uiWorkspace = readService<UiWorkspaceServiceLike>(
        ctx,
        'uiWorkspace',
        'the workspace navigation service',
      )
      if (uiWorkspace?.openSession === undefined) return undefined
      return (sessionId: string) => {
        // Expand the Session's Workspace *before* the navigation re-renders the
        // sidebar: the row addressed here is the one currently mounted, and the
        // host's own auto-expand only fires for a group with no explicit
        // expansion entry (see workspaceReveal.ts).
        revealWorkspaceFor(sessionId)
        try {
          uiWorkspace.openSession?.(sessionId)
        } catch (error) {
          console.warn(`[dsh-session-monitor] session ${sessionId} could not be opened`, error)
        }
      }
    }

    /**
     * The Session status projection, resolved at mount time.
     *
     * `uiSession.sessionStatus` is a nested Cordis service: reading it through
     * the context proxy during render throws on the current runtime unless that
     * dotted name is in the plugin's `inject` list, and a throw there blanks the
     * page. It is optional for this panel, so it is read reflectively instead —
     * the cards then show no live state when a composition lacks it, instead of
     * the monitor refusing to mount.
     */
    const uiSessionFor = (): UiSessionServiceLike | undefined => resolveSessionStatus(ctx)

    /**
     * The verbs behind the toolbar's new-session control.
     *
     * Nothing here may change the main view: the monitor creates the session in
     * place and shows its card. `ctx.sessions.create` is the direct path; a
     * composition without it falls back to `uiWorkspace.connectWorkspace`, which
     * also creates without navigating. A Workspace can only be adopted when both
     * the folder chooser and the Workspace registry expose their verb, and the
     * control is absent when no creation verb exists at all.
     */
    const newSessionActionsFor = (): NewSessionActionsLike | undefined => {
      const uiWorkspace = readService<UiWorkspaceServiceLike>(
        ctx,
        'uiWorkspace',
        'the workspace navigation service',
      )
      const folderPicker = readService<DirectoryPickerLike>(
        ctx,
        'remote.directoryPicker',
        'the directory picker',
      )
      const workspaces = services.workspaces
      const sessions = services.sessions
      const createSession = sessions?.create
      const connectWorkspace = uiWorkspace?.connectWorkspace
      if (createSession === undefined && connectWorkspace === undefined) return undefined

      /**
       * Create one session in a Workspace, without navigation.
       * @param workspaceId - the Workspace to start in.
       * @returns the id of the Session the Host used.
       */
      const start = async (workspaceId: string): Promise<string> => {
        const sessionId =
          createSession !== undefined && sessions !== undefined
            ? await createSession.call(sessions, { workspaceId })
            : connectWorkspace !== undefined && uiWorkspace !== undefined
              ? await connectWorkspace.call(uiWorkspace, workspaceId)
              : ''
        if (typeof sessionId !== 'string' || sessionId === '') {
          throw new Error(`no session was created in workspace ${workspaceId}`)
        }
        return sessionId
      }

      // Captured with its receiver: the registry's own method keeps the service
      // around it, which is what lets the Host trace the call.
      const createWorkspaceVerb = workspaces?.create
      const createWorkspace =
        createWorkspaceVerb === undefined || workspaces === undefined
          ? undefined
          : (path: string): Promise<WorkspaceViewLike> => createWorkspaceVerb.call(workspaces, { path })

      const pickFolder =
        folderPicker?.pick === undefined
          ? undefined
          : async (): Promise<string | null> => {
              const result = await folderPicker.pick!()
              if (result?.ok !== true) {
                const message = result?.error?.message
                throw new Error(
                  typeof message === 'string' && message !== ''
                    ? message
                    : 'the folder chooser failed',
                )
              }
              return typeof result.value === 'string' ? result.value : null
            }

      return {
        start,
        ...(createWorkspace === undefined ? {} : { createWorkspace }),
        ...(pickFolder === undefined ? {} : { pickFolder }),
      }
    }

    ctx.effect(
      () =>
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: PANEL_ORDER,
              label: () => t('panel'),
              locale: NS,
            },
            PanelIcon,
          ),
        ),
      'dsh-session-monitor: sidebar entry',
    )

    ctx.effect(
      () =>
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => ({
                store,
                ...services,
                uiSession: uiSessionFor(),
                openSession: openSessionFor(),
                newSession: newSessionActionsFor(),
                resolveText,
              }),
            },
            MonitorPanel,
          ),
        ),
      'dsh-session-monitor: main panel',
    )
  } catch (error) {
    console.warn('[dsh-session-monitor] the monitor could not mount', error)
  }
}

// Materialization runs this: the client module system claims a style tag created
// from the bundle's factory body and removes it again when the plugin unloads.
injectStyles()