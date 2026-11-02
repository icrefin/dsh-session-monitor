# dsh-session-monitor

One live grid for every active and recently used session: transcript, pending questions, queued prompts.
**English** | [简体中文](README.zh-CN.md)

[![License](https://img.shields.io/github/license/icrefin/dsh-session-monitor?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/icrefin/dsh-session-monitor?style=flat-square)](https://github.com/icrefin/dsh-session-monitor/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/icrefin/dsh-session-monitor/ci.yml?branch=main&style=flat-square)](https://github.com/icrefin/dsh-session-monitor/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/icrefin/dsh-session-monitor?style=flat-square)](https://github.com/icrefin/dsh-session-monitor/commits/main)
[![Stars](https://img.shields.io/github/stars/icrefin/dsh-session-monitor?style=flat-square)](https://github.com/icrefin/dsh-session-monitor/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](.github/CONTRIBUTING.md)
[![Node](https://img.shields.io/badge/node-%3E%3D22.17-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5-4B5563?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

DeepSeek Harness shows one conversation at a time. While several sessions work in
parallel, the sidebar tells you *that* a session is running or waiting — the
question itself, the turn it is in, and the message it wants to send stay behind
its own row. This plugin adds **Session Monitor** to the left sidebar, directly under
**Plugins**, and opens a grid with one card per active or recently used session:

```
┌ Session Monitor ─────────────────┬ Session Monitor ─────────────────┐
│ ● dsh-plugins · working · 2m     │ ● release notes · waiting · 4m   │
│   you  Add a --dry-run flag…     │   ┌ This session is asking you ┐  │
│   bash  command=pnpm test        │   │ Which branch should ship? │  │
│   …                              │   │ ( ) main  ( ) next        │  │
│   [Message this session…] [Send] │   └───────────────────────────┘  │
└──────────────────────────────────┴──────────────────────────────────┘
```

Each card carries, for a session you are **not** viewing:

- **its live transcript** — your prompts, the assistant's streaming text, tool
  calls with their outcome, and approval/retry notices, updated as the session
  writes them;
- **the pending question or approval**, answerable in the card;
- **a composer** that sends a prompt to that session; while the session runs it
  enters the next-turn inbox (no Queue/Steer toggle);
- **a Stop button** while the session runs, which stops the turn through the
  session's own `cancel()`;
- **a clickable title**: clicking a card's title opens that session in the
  conversation view (`ctx.uiWorkspace.openSession(id)`); a composition without
  the navigation service keeps the title as a plain heading;
- **its permission preset**, switchable from the card (Read Only, Workspace Write,
  Full access, and any other preset the Host offers) without opening the session;
- **the messages queued for its next turn**, each with the dock's own **Steer**
  (while the session runs), **Edit** and **Discard** actions;
- **its model**, switchable from the same row as the permission preset, using the
  session's shared model directory (the one the composer picker and `/model` use);
- a **remove** button that takes the session off this grid only.

## Picking this up elsewhere

This directory carries a [HANDOFF.md](./HANDOFF.md): current state, the architecture and its exact
data sources, the liveness heuristics, what was verified, what was not, pitfalls, and the next
steps. Read it before changing behaviour.

## The grid

- **Which sessions.** Every non-blank root session in the client catalog.
  Subagent child rows and the provisional New Session row are not conversations
  a person monitors here.
- **The order freezes once cards are on screen.** The grid seeds its order one
  time (waiting, then running, then recency). After that, a prompt, a new turn or
  a state change updates a card's content but never its position — a session that
  becomes the most recently active does not jump to the front. A session that
  appears later joins at the end while there is room; on a full grid it takes the
  slot of the **least recently used** card, so every other card stays put. A
  waiting card is never displaced.
- **A budget change is the only other reorder.** Shrinking the card count is the
  user asking for the newest sessions, so the grid re-ranks (waiting, then
  running, then recency) before applying the smaller budget. Raising it never
  reorders: the frozen order stays and simply shows more of it.
- **Card budget.** The toolbar shows 3–16 cards (default 9) for idle and running
  sessions. A session **waiting for the user is never cut off by the budget** —
  it is the reason the panel exists.
- **Cards per row.** The toolbar's **Per row** control sets an exact count (2–6)
  or leaves the grid on **Auto**, which fills the column with 260px cards. The
  choice is remembered beside the removed ids.
- **Removal.** Removed ids are stored in this browser's `localStorage`
  (`dsh-session-monitor:prefs`). A removed session keeps running, keeps its
  history and stays in the sidebar; only this grid forgets it. The toolbar's
  **Restore removed** button brings every one of them back.
- **One card, one stream.** A card holds a Session reference
  (`ctx.sessions.retain()`) while it is mounted and releases it on unmount, so the
  grid opens exactly as many history streams as it shows cards, and leaving the
  panel closes all of them.

## How it reads and acts

The plugin is browser-only in behaviour. It registers one sidebar row, one `main`
panel, and two locale dictionaries — no host route, no tool, no event listener —
because every fact it needs already exists in the client:

| Fact | Source |
|---|---|
| session identity, title, workspace path, recency, run-state fallback | `ctx.sessions.list` |
| Workspace title shown on the card | `ctx.workspaces.list` |
| pending question / approval | `ctx.uiSession.sessionStatus` |
| live run state of one card | `binding.session.getSnapshot().running` |
| live transcript | `ctx.sessions.retain()` → `binding.eventSource` |
| send a prompt | `binding.session.prompt(content, 'queue')` |
| answer a pending request | the carrier's own `answer()` |
| current permission preset | `binding.session.projections.faceOf('permissions')` |
| selectable permission presets | `ctx.remote.permissionPresets.catalog()` |
| switch the preset | `binding.session.command('/permission <preset>')` |
| queued messages | `binding.session.projections.faceOf('inbox')` → `next-turn` |
| steer / edit / discard a queued message | `binding.session.updateQueue(id, { kind: 'steer' \| 'edit' \| 'remove' })` |
| stop the running turn | `binding.session.cancel()` |
| open the session | `ctx.uiWorkspace.openSession(sessionId)` |
| current model and catalog | `ctx.modelDirectories.directoryFor(sessionId)` |
| switch the model | the same directory's `select({ provider, model })` |

**Why answering works from another session's card.** The shipped approval and
question panels publish their request into the unified pending-interaction
projection, and both carriers (`PendingApproval`, `PendingQuestion`) expose the
same `answer()` their own composer panel calls — approvals take
`'allowed-once' | 'rejected'`, questions take `{ answers: [{ id, selected, custom }] }`.
The monitor drives that method; it does not reimplement the answer path. A
carrier that offers no `answer()` renders nothing, and a refused answer is shown
as a failure on the card.

**Why the permission control can switch another session.** It reads the current
preset from that session's own `permissions` projection, offers the presets the
Host's process catalog lists, and submits the same `/permission <preset>` line
the shipped composer picker submits — the Host performs the switch, and the
projection reporting the new value is the card's settlement. Full access
switches with no extra step: choosing it in this picker is the explicit
selection. Auto review keeps one inline acknowledgement because it changes how
every request is reviewed. The namespace is optional — it is not in this bundle's
required `inject` list and is resolved reflectively through
`ctx.get('remote.permissionPresets')` — so a composition without permission
presets publishes no catalog, keeps the whole panel mounted, and the cards
render no control at all.

**Why the queue and the model are the session's own too.** The card lists the
`next-turn` rows of the session's `inbox` projection — the same rows the
main-view queue dock renders — and its three buttons call the dock's exact
actions: **Steer** (`{ kind: 'steer' }`, only while the session runs), **Edit**
(an inline editor saving `{ kind: 'edit', content: [{ type: 'text', text }] }`)
and **Discard** (`{ kind: 'remove' }`). The same convergence applies for a turn
that ended first or a row the agent already claimed. The composer has no
Queue/Steer toggle: a send is always `queue`, steering is a queue-row action,
and the composer's **Stop** button (shown only while the session runs) calls
`session.cancel()` — the main-view Stop action.
The model control resolves the shared per-session directory through
`ctx.modelDirectories` (waited for in an optional child scope that also injects
`remote.session`, because that service reaches the namespace through the
caller's context), so a model switched on a card is what the composer and
`/model` see next. A model with advertised reasoning efforts is switched at its
default effort; the card has no effort row of its own.

**One known boundary.** A question routed to a different browser tab (or one
whose foreground claim ended) refuses an answer made here
(`no channel accepts an answer yet`); the card says so rather than pretending the
answer was accepted.

## Design decisions worth stating

- **The order is frozen after the first paint.** Same precedence the shipped
  Session rows use (pending → ongoing → finished → idle) only seeds the grid; once
  a card is displayed, activity must not move it. That is what keeps a card you
  are watching where you left it when you send it a prompt, and it makes a new
  session take the least recently used card's slot instead of pushing everything
  down. The one deliberate exception is a **smaller card budget**: that is the user
  asking for the newest sessions, so the grid re-ranks before applying it.
- **The Workspace title is the card's second line, in normal text colour.** It comes from the Workspace registry,
  not from the `cwd` string, so a renamed Workspace shows its name; the raw path stays a tooltip. State and time
  follow it in the muted caption colour, and the status dot repeats the state at a glance.
- **Transcript text is the conversation's text size.** User and assistant rows read `--dsh-content-font-size`
  (14 px by default) with the same line-height delta the Chat uses, and tool/notice rows read
  `--dsh-content-font-size-secondary`; the card therefore follows the Settings → General font-size preference
  instead of carrying a size of its own.
- **The time is activity, not just the last prompt.** Each card's "ago" label follows the newest visible event
  (falling back to the catalog's recency), so it moves while the session writes and freezes exactly when the card
  falls behind — a built-in liveness check.
- **The transcript is compact on purpose.** It shows user text, assistant text, one
  line per tool call with its first argument, an error dot for failures, and
  approval/retry notices; tool lines are summaries by design, while user and
  assistant messages are shown in full. History older than the row window stays in
  the conversation view.
- **The transcript window is 60 rows, and message text inside a row is kept whole.**
  A card scrolls, so a long answer stays readable to its last word; only the number
  of rows is bounded, never the text of one row. Full history beyond the window stays
  in the conversation view.
- **Removal is local by design.** "Remove from monitor" is a statement about this
  panel, not about the session, so it must not touch the host log or the sidebar.
- **The panel is one fixed page, never a scrolling document.** It takes the whole centre column and the whole
  height below its header; the column count and row count are solved from that box, so every card is on screen
  at once with no page scrollbar. **Auto** picks the column count whose cells stay closest to the nominal card
  size; an explicit **Per row** count is honoured and its rows are still fitted. Card bodies hide their scrollbar
  and follow their tail, so reading a long transcript never moves the grid. A pending question renders inside that scroll
  region (starting with the question itself — the card header already names the waiting state) with its answer row pinned to the card's bottom, and narrow cards drop the time, the state word, then the
  queue action buttons so the Workspace name and the answer controls survive.
- **A card's status comes from that card's own session.** `binding.session.getSnapshot().running` is the
  authoritative per-session run bit: the Host's status event calls `Session.handleRunning()`. The catalog row is
  only the fallback, so a lagging shared snapshot can never hide live work. Each card reconciles its two snapshots
  every 2 s, and the page asks the Host for a fresh catalog baseline on mount and every 15 s — a missed push costs
  one interval, not a wrong mark.
- **One reference source.** All retention is accounted under the source key
  `sessionMonitor`, so `sessions.retainInfo(id)` distinguishes the monitor's
  streams from the conversation's own.

## Verified

- `pnpm check` — typecheck of both halves and the tests, the built bundle, then
  the test run: **97 tests**, including a jsdom mount of the real page against
  fake projections (ordering, live window, question answer, prompt send, removal,
  open failure, a long answer rendered whole), a stylesheet guard (every rendered
  class has a rule; no literal colours), and an execution of the **built** bundle
  behind a fake module loader (bundle id, exports, real `apply` wiring, no second
  React).
- `scripts/dev-profile.sh` — an isolated profile boots the row and serves
  `/plugins/dsh-session-monitor/client.js`.
- Not verified: the panel's pixels. This session had no browser control, so the
  visual check (light/dark, card grid at narrow widths) remains for the user.

## Install

```sh
cd dsh-session-monitor
pnpm install
pnpm check
scripts/install.sh            # packs dist/dsh-session-monitor-0.1.2.tgz
```

Install that tarball through **Settings → Plugins** (or
`dsh plugin --profile <name> add <tarball>` for a CLI-managed profile), then
restart the application. The desktop profile is owned by the Electron app, so its
supported install path is the Plugins page; a bundle added to a running profile is
imported at the next start.

## Layout

```
src/index.ts               host half: identity only, registers nothing
src/client/index.tsx       sidebar row + main page registration
src/client/MonitorPage.tsx grid, toolbar, card selection
src/client/SessionCard.tsx one card: header, transcript, pending, composer
src/client/InteractionCard.tsx question/approval answer block
src/client/model.ts        which sessions, what happened (pure)
src/client/store.ts        removed ids + card budget (localStorage)
src/client/useSessionFeed.ts retain/follow/release one session
src/client/styles.ts       theme-token stylesheet
test/                      model, store, manifest, page (jsdom), built bundle
```

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](.github/CONTRIBUTING.md)
for the development setup and the sign-off expectation. Please report security
issues privately as described in [SECURITY.md](.github/SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).

> If this grid saves you a tab-switching round trip, a ⭐ star helps other DSH users find it.
