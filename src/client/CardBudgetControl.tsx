/**
 * The toolbar's card-budget stepper: how many cards the grid shows, raised and
 * lowered one at a time inside a fixed range.
 *
 * A select could only offer a handful of leaps; the budget is a small integer a
 * person tunes while watching the grid, so this control is a stepper with an
 * editable centre. It clamps before it reports, so the field never shows a
 * number the grid will not use; the preference store clamps again on its own.
 *
 * @module dsh-session-monitor/client/CardBudgetControl
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { MonitorTranslate } from './locales.ts'
import { clampMaxCards, MAX_CARDS_LIMIT, MIN_CARDS } from './model.ts'

/** Props of the card-budget stepper. */
export interface CardBudgetControlProps {
  /** Bound translate seat. */
  readonly t: MonitorTranslate
  /** The budget the grid uses now. */
  readonly value: number
  /** Receive a new budget, already inside the supported range. */
  readonly onChange: (value: number) => void
}

/** Id of the number field, so the visible label can name it. */
const INPUT_ID = 'dsm-card-budget'

/**
 * Render the card-budget stepper.
 * @param props - translate seat, current budget and the change callback.
 * @returns the stepper control.
 */
export function CardBudgetControl({ t, value, onChange }: CardBudgetControlProps): ReactElement {
  // The field is editable, so it owns a draft: an empty or half-typed number is
  // not a budget and must not reach the store. The draft follows the value again
  // once a change settles, which also normalises leading zeros and clamping.
  const [draft, setDraft] = useState<string>(() => String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const step = useCallback(
    (delta: number): void => {
      onChange(clampMaxCards(value + delta))
    },
    [onChange, value],
  )

  return (
    <div className="dsm-budget">
      <label className="dsm-budgetLabel" htmlFor={INPUT_ID}>
        {t('cards')}
      </label>
      <div className="dsm-stepper" role="group" aria-label={t('cards')}>
        <button
          type="button"
          className="dsm-stepperBtn"
          aria-label={t('fewerCards')}
          title={t('fewerCards')}
          disabled={value <= MIN_CARDS}
          onClick={() => step(-1)}
        >
          −
        </button>
        <input
          id={INPUT_ID}
          className="dsm-stepperValue"
          type="number"
          inputMode="numeric"
          min={MIN_CARDS}
          max={MAX_CARDS_LIMIT}
          step={1}
          value={draft}
          aria-label={t('cards')}
          onChange={(event) => {
            const raw = event.target.value
            setDraft(raw)
            const parsed = Number(raw)
            // Commit only a whole number the grid can use; an empty field or a
            // partial entry waits for the blur that normalises it.
            if (raw.trim() !== '' && Number.isInteger(parsed) && parsed >= MIN_CARDS && parsed <= MAX_CARDS_LIMIT) {
              onChange(parsed)
            }
          }}
          onBlur={() => {
            const parsed = Math.trunc(Number(draft))
            if (draft.trim() === '' || !Number.isFinite(parsed)) {
              setDraft(String(value))
              return
            }
            const next = Math.max(MIN_CARDS, Math.min(MAX_CARDS_LIMIT, parsed))
            setDraft(String(next))
            onChange(next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <button
          type="button"
          className="dsm-stepperBtn"
          aria-label={t('moreCards')}
          title={t('moreCards')}
          disabled={value >= MAX_CARDS_LIMIT}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  )
}