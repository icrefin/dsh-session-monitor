/**
 * One card's view of its session's shared model directory.
 *
 * The directory is owned by the shipped composer picker
 * (`@deepseek-ai/dsh-client-ui-model-selection`); the monitor resolves the same
 * per-session instance through `ctx.modelDirectories`, so a model switched from
 * a card is the selection the conversation composer and `/model` see next. The
 * card reads the snapshot (never its own copy) and submits a complete
 * selection.
 *
 * The hook is defensive: a missing service, a throwing directory or a rejected
 * load leave the control without data, never a broken card.
 *
 * @module dsh-session-monitor/client/useModelDirectory
 */

import { useEffect, useState } from 'react'
import type { ModelDirectoryStateLike, ModelDirectoryLike } from './types.ts'

/**
 * Read the directory snapshot without trusting it.
 * @param directory - the session's directory.
 * @returns its state, or `undefined`.
 */
function readState(directory: ModelDirectoryLike | undefined): ModelDirectoryStateLike | undefined {
  try {
    return directory?.store?.getSnapshot?.()
  } catch (error) {
    console.warn('[dsh-session-monitor] a model directory could not be read', error)
    return undefined
  }
}

/**
 * Follow one session's model directory.
 * @param directory - the session directory, when the capability resolved.
 * @returns the latest snapshot, or `undefined` before one is available.
 */
export function useModelDirectory(directory: ModelDirectoryLike | undefined): ModelDirectoryStateLike | undefined {
  const [state, setState] = useState<ModelDirectoryStateLike | undefined>(() => readState(directory))

  useEffect(() => {
    const store = directory?.store
    if (directory === undefined || store === undefined) {
      setState(undefined)
      return
    }

    let alive = true
    const publish = (): void => {
      if (!alive) return
      const next = readState(directory)
      setState((previous) => (previous === next ? previous : next))
    }

    publish()

    let stop: () => void = () => {}
    try {
      stop = store.subscribe?.(publish) ?? (() => {})
    } catch (error) {
      console.warn('[dsh-session-monitor] a model directory could not be followed', error)
    }

    // Load (or refresh) the Host catalog. The directory caches it; asking once
    // per card is what makes the picker list models instead of staying empty.
    try {
      const pending = directory.load?.()
      if (pending !== undefined) {
        void Promise.resolve(pending).catch((error: unknown) => {
          console.warn('[dsh-session-monitor] the model catalog could not be loaded', error)
        })
      }
    } catch (error) {
      console.warn('[dsh-session-monitor] the model catalog could not be loaded', error)
    }

    return () => {
      alive = false
      try {
        stop()
      } catch {
        // The directory notifier is already gone.
      }
    }
  }, [directory])

  return state
}