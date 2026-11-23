/**
 * The local phrase a shell step falls back to, for the monitor's flow view.
 *
 * The describing model is not always available — a profile with no adapter, a
 * provider outage, a page load before the host route exists — and the panel still
 * has to say something useful *without printing the command*. This is a small,
 * deliberately dumb classifier over the command text: it never shows the text
 * itself, only one of a fixed set of phrases the locale owns. A model answer
 * replaces it when one arrives.
 *
 * @module dsh-session-monitor/client/flowBashPurpose
 */

import type { MonitorKey } from './locales.ts'

/** The phrase keys this classifier can return. */
export type BashPurposeKey = Extract<MonitorKey, `flowBashPurpose${string}`>

/** Ordered rules; the first match wins, so specific intents precede tools. */
const RULES: readonly { readonly pattern: RegExp; readonly key: BashPurposeKey }[] = [
  // A git invocation stays a git invocation even when its message mentions a test.
  { key: 'flowBashPurposeGit', pattern: /\bgit\s+[a-z]/ },
  {
    key: 'flowBashPurposeInstall',
    pattern:
      /\b(?:pnpm|npm|yarn|bun)\s+(?:add|install|i)\b|\bpip3?\s+install\b|\buv\s+(?:add|sync|pip\s+install)\b|\bcargo\s+(?:add|install)\b|\bbrew\s+(?:install|upgrade)\b|\bapt(?:-get)?\s+install\b|\bgo\s+(?:get|install)\b|\bgem\s+install\b|\bcomposer\s+require\b/,
  },
  {
    key: 'flowBashPurposeTests',
    pattern:
      /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?test\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b|\bmocha\b|\bplaywright\s+test\b|\btox\b|\bctest\b|\bphpunit\b/,
  },
  {
    key: 'flowBashPurposeBuild',
    pattern:
      /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?build\b|\btsc\b|\bvite\s+build\b|\bcargo\s+build\b|\bgo\s+build\b|\bmake\b|\bwebpack\b|\brollup\b|\besbuild\b|\bgradle\b|\bmvn\b|\bcmake\b/,
  },
  { key: 'flowBashPurposeSearch', pattern: /\b(?:rg|ripgrep|grep|egrep|fgrep|ag|ack|fd|find|locate|which|whereis)\b/ },
  { key: 'flowBashPurposeNetwork', pattern: /\b(?:curl|wget|ssh|scp|sftp|rsync|ping|traceroute|dig|nslookup|nc|netcat|telnet)\b/ },
  {
    key: 'flowBashPurposeFiles',
    pattern:
      /\b(?:ls|cat|head|tail|sed|awk|cp|mv|rm|mkdir|rmdir|touch|chmod|chown|ln|diff|cmp|wc|file|stat|tar|zip|unzip|gzip|gunzip|tree)\b/,
  },
  { key: 'flowBashPurposeProcesses', pattern: /\b(?:ps|kill|pkill|killall|top|htop|pgrep|lsof|df|du|free|uptime|nice|nohup|jobs|bg|fg)\b/ },
  {
    key: 'flowBashPurposeScript',
    pattern: /(?:^|[\s;&|])(?:node|nodejs|python3?|pypy3?|ruby|perl|php|deno|tsx|ts-node|uv\s+run|bash|sh|zsh|fish)\b/,
  },
  {
    key: 'flowBashPurposePackages',
    pattern: /\b(?:pnpm|npm|yarn|bun|pip3?|uv|cargo|brew|apt|apt-get|gem|composer|poetry|pipenv)\b/,
  },
]

/**
 * Choose the fallback phrase for one command.
 * @param command - the normalized command (never rendered).
 * @returns the locale key of the phrase.
 */
export function bashPurposeHint(command: string): BashPurposeKey {
  const lowered = command.toLowerCase()
  for (const rule of RULES) if (rule.pattern.test(lowered)) return rule.key
  return 'flowBashPurposeGeneric'
}