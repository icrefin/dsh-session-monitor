# Handoff — dsh-session-monitor

**Version:** 0.7.6 · **Runtime:** dsh 0.2.1-rc.5 · **Host:** DeepSeek Harness desktop app
**Written:** 2026-11-02 · **Repo:** this repository (`dsh-plugins`), directory `dsh-session-monitor/`

This document is for the next person (or agent) picking this work up on **another machine**.
It records what exists, what was verified, what was not, and what to do next.

---

## 1. One-paragraph status

The plugin is feature-complete for its stated purpose and passes `pnpm check` (97 tests, both
halves typechecked, loader bundle built). It is installed into the **desktop profile** on the
machine where it was written, currently **0.7.6**; a bundle added to a running profile is inert
until the app restarts, so the panel shows the new build only after a relaunch. The panel has **never been seen in the running GUI**: browser control was unavailable to
the agent that built it. Layout was checked in a local Vite **component fixture** only. Treat
in-app visual verification as the first open task.

---

## 2. What the plugin does

- Adds a **Sessions** row to the left sidebar, directly under **Plugins** (`order: 5`).
- Opens a **fixed, full-width grid** in the centre column: one card per active or recently used
  root session. Every card fits on one page — the panel itself never scrolls.
- Each card shows: the session title, its **Workspace title** (normal text colour), state and
  activity time; a **live transcript** (prompts, assistant text, tool calls, notices); a pending
  **question/approval** that can be answered in place; and a **composer** that sends a prompt
  (`queue`, or `steer` while running).
- **Remove** (`×`) hides a card only, persisted in this browser's `localStorage`. A toolbar button
  restores all removed ids.
- Sort: waiting > running > recency. A waiting session is exempt from the card budget.

Non-goals: it does not replace the Conversation, does not show the left/right panes, does not
render Markdown, and does not create sessions.

---

## 3. Where the entry points are

| Piece | File | Notes |
|---|---|---|
| Loader row | `cordis.patch.yml` | `id` and `name` both `dsh-session-monitor` |
| Host half | `src/index.ts` | Identity only; registers **nothing** (no routes, no tools) |
| Browser half | `src/client/index.tsx` | Two slot registrations + locale dictionaries |
| Sidebar row id | `PANEL_ID = dshSessionMonitor` | Must equal the `main` slot key |
| Panel page | `src/client/MonitorPage.tsx` | Grid, toolbar, projection reads, catalog refresh |
| One card | `src/client/SessionCard.tsx` | Header, transcript, pending block, composer |
| Pending block | `src/client/InteractionCard.tsx` | Answers the carrier |
| Pure derivations | `src/client/model.ts` | Candidate collection, frozen order reconcile, transcript, grid fit, timestamps |
| Layout math | `autoColumns`, `gridRows` | `src/client/model.ts` |
| Live feed | `src/client/useSessionFeed.ts` | Retain, follow, reconcile, recover; also publishes the session's `permissions` projection value |
| Permission catalog | `src/client/usePermissionCatalog.ts` | Reads `remote.permissionPresets.catalog()` once per grid and re-reads on `permission-presets/catalog-changed` |
| Model directory | `src/client/useModelDirectory.ts` | Follows one session's shared `ctx.modelDirectories` instance: snapshot + load + `select()` |
| Queued messages | `src/client/SessionCard.tsx` | Renders the `inbox` `next-turn` rows with the dock's Steer / inline Edit / Discard actions through `session.updateQueue(id, action)` |
| Preferences | `src/client/store.ts` | `localStorage` key `dsh-session-monitor:prefs` |
| Stylesheet | `src/client/styles.ts` | Theme tokens; injected once, removed on disable |
| Copy | `src/client/locales.ts` | EN + ZH dictionaries |
| Version chip | `src/client/version.ts` | Kept equal to `package.json` by a test |

---

## 4. Architecture: what it reads, and why

The host half is empty on purpose. Every fact and verb already exists in the client:

| Fact / verb | Source |
|---|---|
| session ids, title, cwd, running, recency, retainedBy | `ctx.sessions.list` (`{ids, byId}`) |
| fresh catalog baseline | `ctx.sessions.refresh()` |
| Workspace title shown on the card | `ctx.workspaces.list` (`{items: WorkspaceView[]}`) |
| live transcript | `ctx.sessions.retain(id)` → `binding.eventSource` |
| per-session run state / stream health | `binding.session.getSnapshot()` → `{running, openState}` |
| send a prompt | `binding.session.prompt(content, 'queue' \| 'steer', signal, requestId)` |
| pending question / approval | `ctx.uiSession.sessionStatus` (a `Map`) |
| answer a pending request | the carrier's own `answer()` method |
| recover a dead tail | `binding.session.resync()` (duck-typed; not in public `ISession`) |

**Retention.** Each card holds one `sessions.retain(id, { source: 'sessionMonitor' })` reference
while mounted and releases it on unmount. That opens one history/tail stream per card, so the card
budget (3–16, default 9) is also a stream budget.

**Answering.** `PendingApproval.answer('allowed-once' | 'rejected')`.
`PendingQuestion.answer({ answers: [{ id, selected, custom }] })`. Host rule: a **single-select**
question with custom text must send `selected: []` — sending both the label and the custom text is
rejected. Both carriers publish into `uiSession`, which is how a background session's question
reaches this page.

**No host route.** If a future feature needs state the client does not already hold, add it to the
host half deliberately — but do not duplicate transport for facts above.

---

## 5. Layout contract

- `.dsm-page` fills the centre column: `height:100%`, `overflow:hidden`, flex column.
- `.dsm-inner` is the only child; header and toolbar are `flex:none`, the grid is `flex:1`.
- The grid gets **both** track lists inline: `repeat(columns, minmax(0,1fr))` and
  `repeat(rows, minmax(0,1fr))`. `rows = ceil(cards / columns)`.
- **Auto** columns come from `autoColumns(count, width, height)`, measured with a `ResizeObserver`
  on the grid: each candidate column count is scored by `min(cellW/300, cellH/220)`, best wins.
- **Per row** is an exact 2–6 choice and is clamped to the card count.
- Card bodies are the only scroll regions; their scrollbar is hidden. The body follows its tail
  (unless a pending request holds it at the top).
- A pending block starts with the question itself (the card header already says *waiting for you*);
  its answer row is `position:sticky; bottom:0` inside the card body.
- Container queries on each card (`container-type:inline-size`) drop the time at ≤320 px, the state
  word at ≤210 px, and the Queue/Steer pills at ≤320 px.
- Transcript text uses the app's content-font tokens: user/assistant
  `var(--dsh-content-font-size,14px)` with `calc(22px/24px + var(--dsh-content-font-delta,0px))`;
  tool/notice/question/input use `var(--dsh-content-font-size-secondary,13px)`.
- Top clearance on macOS: `[data-platform=darwin] .dsm-header { padding-top: 28px + var(--dsh-frame-top-clearance) }`.

Known limitation: at 16 cards (4×4 on a 900 px-tall window) a waiting card can fit only the
question and its answer row; the options/custom field need a small scroll inside the card. At 9
cards everything is visible.

---

## 6. Liveness subsystem (the part with history)

The panel was reported twice as "stale". What is in place now:

1. Card status reads `binding.session.getSnapshot().running` (OR the catalog row).
2. Each card re-reads its two snapshots every **2 s**.
3. Page projections (catalog, statuses, workspaces) are read by a **1.5 s** reconcile in addition to
   their subscription — a foreign store that stops notifying cannot freeze the grid.
4. The page refreshes the Host catalog on mount and every **15 s**.
5. A card calls `session.resync()` (10 s cooldown, 40 attempts) when:
   - `openState === 'error'` (a terminated tail never retries itself), or
   - it is running and its window has not moved for 10 s, or
   - it is **idle but still holds transient stream rows** (the settlement never arrived), or
   - the catalog's recency is more than 10 s newer than its newest loaded event.
6. The card's "ago" label is `max(catalog updatedAt, newest visible event time)`, so a stalled card
   shows an ageing timestamp while a live one keeps saying *just now*.

**Do not remove 3–6 without replacing them.** They exist because the failure mode (a silent tail
stall with no error state) was observed in a user screenshot.

---

## 7. Preferences

`localStorage` key `dsh-session-monitor:prefs`:

```json
{ "hidden": ["session-id", "..."], "maxCards": 9, "columns": 0 }
```

`columns: 0` means Auto. `maxCards` is clamped 1–16, `columns` 0–6. Removal is local by design:
a removed session keeps running, keeps history and stays in the sidebar.

---

## 8. Build, test, install

```sh
cd dsh-session-monitor
pnpm install
pnpm check            # typecheck host + client + test, build lib/client.js, run 68 tests
scripts/install.sh    # packs dist/dsh-session-monitor-0.1.12.tgz (builds first)
```

Install into a CLI-managed profile:

```sh
dsh plugin --profile <profile> add <abs-path>/dist/dsh-session-monitor-0.1.12.tgz
# then restart the server for the row to compose
```

Install into the **Electron desktop profile** (the CLI refuses it):

```sh
cd ~/.dsh/profiles/desktop
# back up package.json / pnpm-lock.yaml / cordis.patch.yml first
pnpm add file:<abs-path>/dist/dsh-session-monitor-0.1.12.tgz
# add "dsh-session-monitor" to "dsh.profile.bundles" in package.json
# restart the app (a bundle added to a running profile is inert until then)
```

`scripts/dev-profile.sh boot [port]` boots an isolated profile with this package linked and prints
its URL; `... dump` shows the composed row, `... remove` deletes the private home. Use it to prove
composition and bundle serving without touching a live profile.

**Same-version reinstall is a silent no-op** in the profile; bump the version before reinstalling.

---

## 9. Verification: what was and was not proven

Proven:

- `pnpm check`: 97 tests — model (selection, budget, transcript, live chunks, whole long messages, grid fit, timestamps),
  store (persistence, clamping, notification), manifest (three ids, activation order, version chip),
  stylesheet guard (every rendered class has a rule, token-only colours, content-font tokens),
  jsdom page mount (ordering, live appends, question answer, single-select custom rule, prompt send,
  removal, open failure, silent-store reconcile, both new recovery triggers), and the **built**
  bundle behind a fake loader (loader id, exports, real `apply`, no second React).
- An isolated dsh profile composed the row and served
  `/plugins/??dsh-session-monitor/client.js&rev=…` with HTTP 200.
- Installed `lib/` is byte-identical to the build on the originating machine.
- Layout in a Vite component fixture with fake data: 9 cards 3×3 and 16 cards 4×4 fit 1440×900,
  9 cards fit 1180×760. Screenshots live in `reports/` (gitignored, not committed).

**Not proven:** the panel inside the real app. No browser control was available. Light/dark,
real fonts, real session streams, and the waiting-card interactions are unverified by eye.

---

## 10. Known pitfalls and confusions

1. **Duplicate-looking sessions.** Two sessions that start with the same first prompt get titles
   `Foo` and `Foo (1)`. A card showing old content may simply be the older session, which is idle
   and correct. Check the real session id (`~/.dsh/sessions/<workspace>/session-<id>/`) before
   calling the panel stale.
2. **A tail stream can stall silently.** It may keep `openState: 'open'` while delivering nothing;
   that is why the heuristics in §6 exist. If a card still freezes, log
   `binding.session.getSnapshot()` and the window size from the console.
3. **`resync()` is not public API.** It is guarded duck-typed; if a future dsh removes it, the
   recovery silently does nothing. Re-check after upgrading dsh.
4. **Retention cost.** Each card opens a follow stream. Do not raise the budget without measuring.
5. **No Markdown.** Assistant text renders as plain pre-wrapped text, so `##` and `**` are visible.
6. **Panel is not the Conversation.** No attachments, no queue dock, no stop button, no view tabs.
7. **Styles are token-only.** Any literal colour breaks dark mode; `test/styles.spec.ts` enforces it.
8. **`lib/`, `dist/`, `reports/`, `node_modules/`, `.dev-home/` are gitignored.** A fresh clone must
   build; it cannot install a tarball that is not there.

---

## 11. Suggested next steps (priority order)

1. **Restart the app and verify in place.** Open **Sessions**; check 9 cards on one page, no page
   scrollbar, light and dark, and the waiting card's Submit/Skip reachable. Confirm the card for an
   actively running session says *working* and its *ago* label stays at *just now*.
2. **Exercise a background question.** In another session, trigger `ask_user_question`; the monitor
   must show it and answer it. Note: a question owned by another browser tab refuses an answer here.
3. **Markdown rendering** for assistant text (reuse a local renderer or a small safe subset). This
   is the most visible gap on a normal transcript.
4. **Open-session action** on each card (select the conversation for that session). The layout
   service can select the `conversation` panel; session selection needs a supported client path —
   investigate before adding.
5. **Tiny-cell question UI.** At 16 cards, options need a scroll. Consider a compact answer mode or
   letting a waiting card span two rows without breaking the one-page contract.
6. **Idle-session noise.** Consider folding old idle sessions behind a "show older" toggle or
   grouping by Workspace, while keeping recency ordering.
7. **Measure** client memory and message volume with 9 and 16 retained streams.

---

## 12. Reproducing the layout fixture

The fixture was throwaway (in `/tmp`), but it is easy to rebuild:

1. Make a Vite app with `esbuild.jsx = 'automatic'` and alias `react`, `react-dom`,
   `react/jsx-runtime` to this package's `node_modules`.
2. Define the `--dsw-alias-*` tokens used by `styles.ts` (light values) plus
   `--dsh-content-font-size` / `-secondary` if you want the real type scale.
3. Import `MonitorPage`, `MonitorStore`, `en`, `injectStyles()` from `src/client/…`; render
   `MonitorPage` directly into the centre-column element (no wrapper div — a wrapper breaks
   `height:100%`).
4. Fake services: `sessions.list` as a snapshot source, `retain()` returning
   `{ ready: Promise.resolve({ session, eventSource }) }`, `uiSession.sessionStatus` as a Map,
   `workspaces.list` with `items`.
5. `vite build`, serve `dist/` over HTTP (module scripts do not load over `file://`), and capture
   with headless Chrome at the target viewport.

Remember: a fixture screenshot proves layout, **not** app behaviour.

---

## 13. Release checklist

1. `package.json` and `src/client/version.ts` bump **together** (`test/manifest.spec.ts` enforces).
2. `pnpm check` green.
3. `scripts/install.sh` (packs).
4. Install into the target profile; confirm `node_modules/<pkg>/package.json` version and
   `diff -rq lib <profile>/node_modules/<pkg>/lib`.
5. Restart; reload the page.
6. Update this document and the README's verification counts.

---

## 14. Version trail

| Version | Change |
|---|---|
| 0.1.0 | First build: sidebar row, grid, transcript, question answer, composer, removal |
| 0.1.2 | Bundle id/apply fixes from the first wiring tests |
| 0.1.3 | Full-width panel (960 px page cap removed) |
| 0.1.4 | Per-row control (Auto or 2–6), remembered |
| 0.1.5 | Run marks read the bound session; 2 s card reconcile, 1.5 s projection poll, 15 s catalog refresh |
| 0.1.6 | Workspace title on the card, in normal text colour |
| 0.1.7 | One fixed page (fit all cards, no page scrollbar); failed-tail + running-frozen recovery |
| 0.1.8 | Pending block inside the card scroll with sticky answer row; container queries; question first |
| 0.1.9 | Transcript uses the conversation's content-font tokens |
| 0.1.10 | Question block starts with the question (no redundant strip) |
| 0.1.11 | Idle-with-transient and catalog-outrun recovery |
| 0.1.12 | Activity time on the card (liveness signal) |
| 0.1.13 | Title casing: the page header and the sidebar row both read "Session Monitor" |
| 0.2.0 | Per-card permission preset control (`/permission`), with Full access / Auto acknowledgement |
| 0.2.1 | Resolve the optional `remote.permissionPresets` namespace reflectively, so the control appears without a required inject |
| 0.2.2 | Full access switches with no in-card acknowledgement; Auto review keeps one |
| 0.3.0 | Queued messages listed with per-row Steer; model picker beside the permission picker |
| 0.3.1 | Model picker resolves after the card holds its binding — cards for unopened sessions get it too |
| 0.4.0 | Queue/Steer toggle removed (sends always queue); queued rows gain Edit and Discard beside Steer |
| 0.5.0 | Stop button on running cards (`session.cancel()`) |
| 0.6.0 | Grid order freezes after the first paint; a new session takes the least recently used card's slot |
| 0.6.1 | Seed the whole ranked order, so sessions beyond the budget at first paint never look like new arrivals |
| 0.6.2 | Shrinking the card budget re-ranks to the newest sessions; growing it keeps the order |
| 0.7.0 | Card titles open their session in the conversation view (`ctx.uiWorkspace.openSession`) |
| 0.7.1 | Message text is never clipped: the per-row 2,000-character budget is gone, so a long answer reads to its last word |
| 0.7.2 | Session card titles are larger (14px, 19px line height), for readability in a dense grid |
| 0.7.3 | Card titles read the global content font size (`--dsh-content-font-size`), so they follow the DSH font-size setting |
| 0.7.4 | A finished unread run draws a green completion dot; clicking the card acknowledges it and returns the dot to grey idle |
| 0.7.5 | Card footer reads tokens consumed, cache-hit share and context occupancy from the native `tokenUsage` and `contextPressure` projections |
| 0.7.6 | Usage readout uses the permission/model select text colour (`--dsw-alias-label-secondary`) |