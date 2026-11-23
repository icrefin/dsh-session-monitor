/**
 * What one step row and one activity card say in the monitor's flow view.
 *
 * These are pure functions over a derived model, a translate seat and a purpose
 * lookup, which is what makes the panel's central promise testable: **a shell
 * command is never drawn**. A shell step's title is the agent's own words, then
 * the model's description of the command, then a local phrase for it — never the
 * command itself.
 *
 * @module dsh-session-monitor/client/flowTitles
 */

import { bashPurposeHint } from './flowBashPurpose.ts'
import type { ProgressModel, StepItem } from './flowProgress.ts'
import type { MonitorTranslate } from './locales.ts'

/** Looks up an already-arrived description for one command. */
export type PurposeOf = (command: string | undefined) => string | undefined

/**
 * Capitalize the first character of a title phrase.
 *
 * A title is a sentence, not a fragment: the describing model writes a lowercase
 * verb phrase for the prompt, and the fallback phrases are lowercase too, so the
 * display normalizes the first letter. A non-letter first character (a number, a
 * CJK character) is left alone, and every later character is preserved.
 *
 * @param text - the phrase to capitalize.
 * @returns the phrase with an uppercase first character where one applies.
 */
export function capitalizeFirst(text: string): string {
  if (text === '') return text
  const first = text.charAt(0)
  const upper = first.toUpperCase()
  return upper === first ? text : `${upper}${text.slice(1)}`
}

/**
 * The local phrase for one command, when no description has arrived.
 * @param command - the normalized command.
 * @param t - translate seat.
 * @returns the localized phrase.
 */
function localPhrase(command: string, t: MonitorTranslate): string {
  return t(bashPurposeHint(command))
}

/**
 * The one line a step shows.
 *
 * A running step prefers its live text: the reader is watching it now. A settled
 * step falls back from the agent's words to the files it wrote or changed, then
 * to what its command is for. A step with none of those never reaches the list
 * (see `hasPurpose`), so the last resort is unreachable in practice.
 *
 * @param step - the step.
 * @param t - translate seat.
 * @param purposeOf - descriptions the page has received.
 * @returns the title text.
 */
export function stepTitle(step: StepItem, t: MonitorTranslate, purposeOf: PurposeOf): string {
  if (step.status === 'running' && step.live !== '') return step.live
  if (step.text !== '') return step.text
  const first = step.files[0]
  if (first !== undefined) {
    if (step.files.length === 1) {
      return t(first.verb === 'write' ? 'flowStepWriting' : 'flowStepEditing', { name: first.name })
    }
    return t(first.verb === 'write' ? 'flowStepWritingMore' : 'flowStepEditingMore', {
      name: first.name,
      count: step.files.length - 1,
    })
  }
  if (step.command !== undefined) {
    // The purpose is the title itself: the row's meta line already names the
    // tool, so a "Using bash:" prefix would only repeat it.
    return capitalizeFirst(purposeOf(step.command) ?? localPhrase(step.command, t))
  }
  return t('flowStepWork')
}

/**
 * The activity card's detail line.
 *
 * A running shell call shows its purpose, not its argument hint: the hint would
 * be the command. Every other tool keeps the hint the reader asked for with
 * `showToolDetails`.
 *
 * @param model - the derived progress model.
 * @param showToolDetails - whether a tool's argument hint is shown.
 * @param t - translate seat.
 * @param purposeOf - descriptions the page has received.
 * @returns the detail line, or undefined.
 */
export function activityDetail(
  model: ProgressModel,
  showToolDetails: boolean,
  t: MonitorTranslate,
  purposeOf: PurposeOf,
): string | undefined {
  if (model.activity.kind !== 'tool' || !showToolDetails) return undefined
  const command = model.activity.command
  if (command !== undefined) return capitalizeFirst(purposeOf(command) ?? localPhrase(command, t))
  return model.activity.detail
}

/**
 * Every command the panel currently shows, oldest first.
 *
 * The panel's steps are already chronological, and the running call is the newest
 * command in the session, so appending it last is what makes the host's
 * "newest first" budget line up with the reader's attention.
 *
 * @param model - the derived progress model.
 * @returns the commands, oldest first.
 */
export function commandListOf(model: ProgressModel): string[] {
  const commands: string[] = []
  for (const item of model.items) {
    if (item.kind !== 'step' || item.command === undefined) continue
    // A step that already explains itself, or wrote a file, never needs a
    // purpose for its title; asking would spend a call the panel cannot use.
    if (item.text !== '' || item.files.length > 0) continue
    commands.push(item.command)
  }
  if (model.activity.command !== undefined) commands.push(model.activity.command)
  return commands
}