/**
 * The pending-interaction block inside one card.
 *
 * A session that is blocked on the user is the reason this monitor exists, so
 * the question or approval is shown in the card itself rather than in the
 * conversation composer the user would have to navigate to.
 *
 * Both shipped domains publish an answerable carrier into the `uiSession`
 * projection, and both carriers expose the same `answer()` method their own
 * composer panel calls. This component drives that method — it does not
 * reimplement an answer path, and it renders nothing for a carrier that does not
 * offer one.
 *
 * @module dsh-session-monitor/client/InteractionCard
 */

import { useState, type ReactElement } from 'react'
import type { MonitorTranslate } from './locales.ts'
import { isAnswerable, textField } from './model.ts'
import type { PendingInteractionLike, QuestionLike } from './types.ts'

/** Props of one pending-interaction block. */
export interface InteractionCardProps {
  /** The pending carrier published by the `uiSession` projection. */
  readonly interaction: PendingInteractionLike
  /** Bound translate seat. */
  readonly t: MonitorTranslate
}

/** One question's draft: chosen labels plus free text. */
interface Draft {
  readonly selected: readonly string[]
  readonly custom: string
}

/** Read the questions of a carrier as a safe array. */
function questionsOf(interaction: PendingInteractionLike): readonly QuestionLike[] {
  return Array.isArray(interaction.questions) ? interaction.questions : []
}

/**
 * Stable key of one question inside a batch.
 * @param question - the question.
 * @param index - its position.
 * @returns the identity used for draft state.
 */
function questionKey(question: QuestionLike, index: number): string {
  return question.id ?? `q${index}`
}

/**
 * Human-readable name of a question.
 * @param question - the question.
 * @returns its text, header, or a fallback.
 */
function questionText(question: QuestionLike): string {
  const text = question.question ?? question.detail ?? question.header
  return typeof text === 'string' && text.trim() !== '' ? text : ''
}

/**
 * Render the pending interaction, or nothing when it cannot be answered.
 * @param props - the carrier and the translate seat.
 * @returns the block, or `null`.
 */
export function InteractionCard({ interaction, t }: InteractionCardProps): ReactElement | null {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [settled, setSettled] = useState(false)
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({})

  if (!isAnswerable(interaction)) return null

  const kind = textField(interaction, 'kind') ?? 'question'
  const answer = interaction.answer
  if (typeof answer !== 'function') return null

  const settleWith = (value: unknown): void => {
    if (busy || settled) return
    setBusy(true)
    setFailed(false)
    Promise.resolve()
      .then(() => answer.call(interaction, value))
      .then(() => {
        setSettled(true)
      })
      .catch((error: unknown) => {
        console.warn('[dsh-session-monitor] the pending interaction refused an answer', error)
        setFailed(true)
      })
      .finally(() => {
        setBusy(false)
      })
  }

  if (kind === 'approval') {
    const toolName = interaction.toolName ?? 'tool'
    const reason = interaction.displayReason ?? interaction.reason
    return (
      <section className="dsm-pending" aria-label={t('approvalTitle', { tool: toolName })}>
        <div className="dsm-pendingTitle">{t('approvalTitle', { tool: toolName })}</div>
        {reason === undefined || reason === '' ? null : (
          <p className="dsm-pendingReason">
            {t('reason')}: {reason}
          </p>
        )}
        <div className="dsm-pendingActions">
          <button
            type="button"
            className="dsm-btn"
            data-primary="true"
            disabled={busy || settled}
            onClick={() => settleWith('allowed-once')}
          >
            {busy ? t('answering') : t('allow')}
          </button>
          <button
            type="button"
            className="dsm-btn"
            data-danger="true"
            disabled={busy || settled}
            onClick={() => settleWith('rejected')}
          >
            {t('reject')}
          </button>
        </div>
        {failed ? <div className="dsm-pendingError">{t('answerFailed')}</div> : null}
      </section>
    )
  }

  const questions = questionsOf(interaction)
  if (questions.length === 0) return null

  const draftOf = (key: string): Draft => drafts[key] ?? { selected: [], custom: '' }

  const writeDraft = (key: string, next: Draft): void => {
    setDrafts((previous) => ({ ...previous, [key]: next }))
  }

  const choose = (key: string, label: string, multi: boolean): void => {
    const draft = draftOf(key)
    const already = draft.selected.includes(label)
    const selected = multi
      ? already
        ? draft.selected.filter((item) => item !== label)
        : [...draft.selected, label]
      : already
        ? []
        : [label]
    writeDraft(key, { ...draft, selected })
  }

  const submit = (): void => {
    const answers = questions.map((question, index) => {
      const id = questionKey(question, index)
      const draft = draftOf(id)
      const custom = draft.custom.trim()
      // Host rule: a single-select question takes the custom text INSTEAD of a
      // chosen label, so `selected` is empty there; a multi-select answer may
      // carry both. Sending both on a single-select question is rejected.
      return {
        id: question.id ?? id,
        selected: custom === '' || question.multiSelect === true ? [...draft.selected] : [],
        ...(custom === '' ? {} : { custom }),
      }
    })
    settleWith({ answers })
  }

  const skip = (): void => {
    const answers = questions.map((question, index) => ({ id: question.id ?? questionKey(question, index), selected: [] }))
    settleWith({ answers })
  }

  return (
    <section className="dsm-pending" aria-label={t('questionTitle')}>
      {/* The card header already names the waiting state; the block itself starts
          with the question so its first line is the actual prompt. */}
      {questions.map((question, index) => {
        const key = questionKey(question, index)
        const draft = draftOf(key)
        const options = Array.isArray(question.options) ? question.options : []
        const text = questionText(question)
        return (
          <div className="dsm-question" key={key}>
            {question.header === undefined || question.header === '' ? null : (
              <div className="dsm-questionHeader">{question.header}</div>
            )}
            {text === '' ? null : <p className="dsm-questionText">{text}</p>}
            {options.length === 0 ? <div className="dsm-hint">{t('noOptions')}</div> : null}
            <div className="dsm-options" role="group">
              {options.map((option) => {
                const label = option.label ?? ''
                if (label === '') return null
                return (
                  <button
                    key={label}
                    type="button"
                    className="dsm-option"
                    aria-pressed={draft.selected.includes(label)}
                    disabled={busy || settled}
                    onClick={() => choose(key, label, question.multiSelect === true)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <input
              className="dsm-answerInput"
              type="text"
              value={draft.custom}
              placeholder={t('custom')}
              disabled={busy || settled}
              onChange={(event) => writeDraft(key, { ...draft, custom: event.target.value })}
            />
          </div>
        )
      })}
      <div className="dsm-pendingActions">
        <button type="button" className="dsm-btn" data-primary="true" disabled={busy || settled} onClick={submit}>
          {busy ? t('answering') : t('submit')}
        </button>
        <button type="button" className="dsm-btn" disabled={busy || settled} onClick={skip}>
          {t('skip')}
        </button>
      </div>
      {failed ? <div className="dsm-pendingError">{t('answerFailed')}</div> : null}
    </section>
  )
}