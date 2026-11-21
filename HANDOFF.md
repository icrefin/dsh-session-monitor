# Handoff — dsh-session-monitor

**Version:** 0.11.8 · **Runtime:** dsh 0.2.2-rc.3 · **Host:** DeepSeek Harness web GUI
**Written:** 2026-11-02 · **Updated:** 2026-11-21 (0.11.8: a card title click now also unfolds the Workspace group that holds the Session — `src/client/workspaceReveal.ts` resolves the owner from `ctx.workspaces.list` membership (cwd fallback) and clicks the sidebar's folded `workspace:<id>` tree item before navigating, because the host only auto-expands groups with no explicit expansion entry. 0.11.7: the card head is one step above the transcript — the session title is the content size plus 4 px (18 px at the default) and the workspace/state/time line under it is exactly 1.5x smaller (12 px), both still reading the global content-font token. 0.11.6: the real "This page could not be drawn" cause — a read of the nested Cordis service `uiSession.sessionStatus` through the context proxy, which the rc.3 runtime rejects during render; it is now resolved reflectively. 0.11.5 closed the page-level foreign-data holes around it and made the fallback print its reason)
**Repo:** this repository (`dsh-plugins`), directory `dsh-session-monitor/`

This document is for the next person (or agent) picking this work up on **another machine**.
It records what exists, what was verified, what was not, and what to do next.

---

## 1. One-paragraph status

The plugin is feature-complete for its stated purpose and passes `pnpm check` (168 tests, both
halves typechecked, loader bundle built). It is installed into the **web profile** on the machine
where it was written, currently **0.11.4**. The 0.11.4 fix answers the reported symptom — an
occasional blank centre column that only a browser reload cleared: an approval carrying a
`displayReason` locale map was handed to React as a child, the render threw, and the shell retired
the `main` entry for the rest of the page's life. Copy is now resolved to a string, and a page/card
boundary keeps any future throw inside the plugin. The panel's pixels still have **never been
checked by an agent** (no browser control); the user reloads the page to pick up this build.

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
- A toolbar **New Session** button with a **Workspace drop-down** beside it: it creates a session in
  the chosen Workspace and **keeps the monitor open**. Its card joins at the end while the grid has
  room, and on a full grid it takes the slot of the oldest (least recently used) card, so the grid
  keeps its shape and no other card moves. A brand-new
  session is blank, so its id is recorded in the `spawned` set and its card shows the localized
  "New Session" title until its first turn titles it. The drop-down's **Choose a folder…** row calls
  `remote.directoryPicker.pick()`, adopts the folder with `ctx.workspaces.create({ path })` and
  creates the session there. The last choice is remembered in this browser; a cancelled chooser
  changes nothing.
- Seed only: waiting > running > recency decides the first placement. From then on the order is
  frozen **and stored** in `localStorage` (`prefs.order`), so a panel switch, a reload or a restart
  resumes the same cells; activity never moves a card. Lowering the **card budget** is the one
  deliberate re-seed: the cards that stay are the newest sessions, newest-first. Raising it keeps
  that order and reveals the rest. A waiting session is exempt from the card budget.

Non-goals: it does not replace the Conversation, does not show the left/right panes, and does not
render Markdown. It only creates *blank* sessions in place — it does not navigate, fork, archive,
rename or delete sessions.

---

## 3. Where the entry points are

| Piece | File | Notes |
|---|---|---|
| Loader row | `cordis.patch.yml` | `id` and `name` both `dsh-session-monitor` |
| Host half | `src/index.ts` | Identity only; registers **nothing** (no routes, no tools) |
| Browser half | `src/client/index.tsx` | Two slot registrations + locale dictionaries |
| Sidebar row id | `PANEL_ID = dshSessionMonitor` | Must equal the `main` slot key |
| Panel page | `src/client/MonitorPage.tsx` | Grid, toolbar, projection reads, catalog refresh |
| New-session control | `src/client/NewSessionControl.tsx` | Button + Workspace drop-down + folder row |
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
| create a session in a Workspace, in place | `ctx.sessions.create({ workspaceId })` (fallback: `ctx.uiWorkspace.connectWorkspace(workspaceId)`) |
| keep a created blank Session as a card | the monitor's local `spawned` set (`localStorage`) |
| adopt a folder as a Workspace | `ctx.workspaces.create({ path })` |
| ask for a folder | `ctx.remote.directoryPicker.pick()` → `RemoteResult<string \| null>` |

The verbs above are **optional** and read reflectively (`ctx.get('uiWorkspace')`,
`ctx.get('remote.directoryPicker')`). Without a creation verb the page renders no new-session
control; without a picker the folder row is absent. Creating never navigates: `sessions.create`
returns the new id, the page marks it spawned, and the next reconcile places its card (end of the
order while there is room, oldest slot on a full grid).
`connectWorkspace` is the fallback for a composition without `sessions.create`; it may reuse an
unused blank session of that Workspace, exactly like the sidebar's own New Session button.

**Retention.** Each card holds one `sessions.retain(id, { source: 'sessionMonitor' })` reference
while mounted and releases it on unmount. That opens one history/tail stream per card, so the card
budget (2–24, default 9, stepped one card at a time in the toolbar) is also a stream budget.

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

Known limitation: at large budgets (16 cards is a 4×4 grid on a 900 px-tall window, and the
stepper now allows 24) a waiting card can fit only the question and its answer row; the
options/custom field need a small scroll inside the card. At 9 cards everything is visible.

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
{ "hidden": ["session-id", "..."], "acknowledged": ["..."], "spawned": ["..."],
  "maxCards": 9, "columns": 0, "newWorkspaceId": "workspace-id" }
```

`columns: 0` means Auto. `maxCards` is clamped 2–24 and is changed one card at a time, `columns` 0–6. Removal is local by design:
a removed session keeps running, keeps history and stays in the sidebar. `newWorkspaceId` is the
Workspace the new-session control last used; it is ignored (and replaced) when that Workspace no
longer exists, and the default is then the Workspace of the most recently used session. `spawned`
holds at most 32 ids of sessions created here whose first turn has not started; an id leaves the
set as soon as the catalog reports the row non-blank.

---

## 8. Build, test, install

```sh
cd dsh-session-monitor
pnpm install
pnpm check            # typecheck host + client + test, build lib/client.js, run 133 tests
scripts/install.sh    # packs dist/dsh-session-monitor-0.11.3.tgz (builds first)
```

Install into a CLI-managed profile:

```sh
dsh plugin --profile <profile> add <abs-path>/dist/dsh-session-monitor-0.11.5.tgz
# then restart the server for the row to compose
```

Install into the **Electron desktop profile** (the CLI refuses it):

```sh
cd ~/.dsh/profiles/desktop
# back up package.json / pnpm-lock.yaml / cordis.patch.yml first
pnpm add file:<abs-path>/dist/dsh-session-monitor-0.11.5.tgz
# add "dsh-session-monitor" to "dsh.profile.bundles" in package.json
# restart the app (a bundle added to a running profile is inert until then)
```

`scripts/dev-profile.sh boot [port]` boots an isolated profile with this package linked and prints
its URL; `... dump` shows the composed row, `... remove` deletes the private home. Use it to prove
composition and bundle serving without touching a live profile.

**Same-version reinstall is a silent no-op** in the profile; bump the version before reinstalling.

---

## 8a. The 0.11.6 crash: a nested service read through the context proxy

**Symptom.** Opening **Session Monitor** showed, every time, the page-level fallback:

> This page could not be drawn
> One of the sessions reported something this page could not read. Nothing was changed. Try again, and the page mounts from scratch.

**Root cause (reproduced in a real browser, 2026-11-15).** The console carried one error:

```
Error: cannot get property "uiSession.sessionStatus" without inject
    at MonitorPage (…/plugins/??dsh-session-monitor/client.js…)
```

`uiSession.sessionStatus` is not a member of the `uiSession` service object: it is a **nested Cordis
service** registered under that dotted name (`packages/client/ui-session-status/src/client/status.ts`).
The rc.3 context proxy checks every service read against the reading fiber's `inject` list and throws
when the exact dotted name is absent (`vendor/cordis/src/reflect.ts`, `locate`). `MonitorPage` read
`uiSession?.sessionStatus` **while rendering**, so the throw reached `PanelErrorBoundary` and the panel
became a Retry face on every mount. Shipped plugins that read it (ui-conversation, ui-subagent) list
`'uiSession.sessionStatus'` in their `inject` array. This plugin had only `'uiSession'`, and the need
for the dotted name arrived with the rc.3 runtime.

**Fix.** `sessionStatus.ts` resolves the projection with the reflective `ctx.get('uiSession.sessionStatus')`
when the page mounts, exactly as `remote.ts` already did for `remote.permissionPresets`. The plugin does
not have to require the service, and the page still renders (without live state) when a composition
lacks it. `test/session-status.spec.ts` covers the resolver and fails if `src/client/index.tsx` ever
reads `ctx.uiSession` again.

**Why it looked like "a value from a session".** The boundary copy was written for the 0.11.3
`displayReason` failure; it names sessions because that was the only known cause. The guard error is
unrelated to any session's data.

**How it was verified.** An isolated profile (`DSH_HOME=/tmp/…`, `dsh --profile … web --port 19499`)
with this bundle installed and **three real sessions copied into its session store**, driven with
headless Chrome over CDP: 0.11.5 reproduced the fallback above, 0.11.6 draws the panel (grid cards,
toolbar, no page error). That is the first real-browser check of the panel since 0.9.0.

## 9. Verification: what was and was not proven

Proven:

- `pnpm check`: 168 tests — model (selection, budget floor/ceiling, the shrink re-seed, transcript, live chunks, whole long messages, grid fit, timestamps, localized approval copy,
  Workspace label/default rules, stable replacement with the displaced card kept at the order tail),
  store (persistence incl. the remembered new-session Workspace and the spawned-blank set,
  clamping, notification), manifest (three ids, activation order, version chip),
  stylesheet guard (every rendered class has a rule, token-only colours, content-font tokens),
  jsdom page mount (ordering, live appends, question answer, single-select custom rule, prompt send,
  removal, open failure, silent-store reconcile, both new recovery triggers, the new-session
  control's default Workspace, its start call, folder adoption, a cancelled chooser, a refused
  start, a created blank card taking the oldest slot on a full grid, the card-budget stepper
  moving one card per click and clamping at 2 and 24, and a smaller budget re-seeding the grid
  to the newest sessions), and the **built** bundle
  behind a fake loader (loader id, exports, real `apply`, no second React).
- **Foreign page data** (`test/foreign-data.spec.tsx`, 5 tests): a matrix of single-field mutations
  (every catalog row field, the catalog `ids`/`byId`/`phase`, every status field, every Workspace
  field, every stored preference, each replaced by `null`, `NaN`, a number, an empty string, an
  object, an array, a locale map and a function) mounts the real panel with the toolbar's
  new-session control and asserts the page-level fallback never appears. This is the regression
  guarantee for the "This page could not be drawn" report: the three paths it closed are a `null`
  snapshot `byId`, a row with no usable title whose `cwd` is not a string, and a `null` row behind
  an id in the local `spawned` set.
- **Robustness** (`test/robustness.spec.tsx`, 17 tests): an approval whose `displayReason` is a
  locale map renders the resolved sentence (and, with no resolver, the map's English entry) instead
  of throwing; a throwing card leaves its neighbours mounted; a throwing page shows the *Try again*
  panel and remounts on click; a page whose pref store throws is contained inside the plugin; and a
  table of malformed projections (non-array catalog `ids`, `null` catalog/status rows, junk event
  entries, `null` permission options, junk model groups, `null` queued rows) all still render the page.
- An isolated dsh profile composed the row and served
  `/plugins/??dsh-session-monitor/client.js&rev=…` with HTTP 200.
- **The panel in a real browser** (headless Chrome driven over CDP against the isolated profile on
  2026-11-03, version 0.9.0): the sidebar opens the monitor, the toolbar renders, and repeated
  New Session clicks append cards 1→2→3 with the page still on the monitor. With the card budget
  set to 3 (a full grid, read from each card's `data-session-id`), the fourth and fifth clicks keep
  the count at 3 and replace the oldest card's slot each time — `[a,b,c]` → `[d,b,c]` → `[d,e,c]` —
  so no other card moves. No navigation, no error.
- Installed `lib/` is byte-identical to the build on the originating machine.
- Layout in a Vite component fixture with fake data: 9 cards 3×3 and 16 cards 4×4 fit 1440×900,
  9 cards fit 1180×760. Screenshots live in `reports/` (gitignored, not committed).

**Not proven:** the panel inside the Electron window itself, real fonts/DPI, light/dark on the
desktop build, narrow-width layouts, and the waiting-card answer flow against a live stream. The
browser check ran the web app in Chrome, which is the same client bundle but not the desktop shell.

**Redone for 0.11.6 (web app in headless Chrome, real sessions):** the panel draws, and the same
environment reproduced the pre-fix failure with its exact error line. Screenshot kept in
`reports/after-0.11.6-monitor.png` (gitignored).

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
8. **A displaced card must stay in the frozen order.** `reconcileOrder` moves the card it evicted
   to the order's tail instead of dropping it. Dropping it makes it look "fresh" on the next
   reconcile, and it would then evict another displayed card; with a small budget the
   grid then alternates between them on every render. Any change to that function must keep the
   displaced id in the array. The page persists that order through `MonitorStore.setOrder`, so the
   same applies to the stored array: never trim it to the displayed prefix, and never reconcile it
   while the catalog snapshot is absent or `pending` — both would re-seed every card by recency.
9. **A created session's card is only shown while it is blank.** `collectSessions` filters blank
   rows except the ids in the local `spawned` set. The prune effect in `MonitorPage` removes an id
   once its catalog row reports `blank !== true`; do not "fix" that to also remove missing ids — a
   just-created row can lag the store write.
10. **Cards carry `data-session-id`.** Use it to tell duplicate-looking cards apart in DevTools.
11. **`lib/`, `dist/`, `reports/`, `node_modules/`, `.dev-home/` are gitignored.** A fresh clone must
   build; it cannot install a tarball that is not there.
12. **Never index or read a Host field without a type check.** `collectSessions`, `sessionTitle`
    and `shortPath` are total over `unknown` on purpose: a `null` `byId`, a non-string `cwd`, a
    non-string id or a `null` row must read as "nothing known". A throw above the cards reaches
    `PanelErrorBoundary` and costs the whole grid, not one cell. `test/foreign-data.spec.tsx` fails
    if any of those guards is removed.
13. **Never render a foreign value as a child.** The Host publishes approval copy as a locale map
    (`displayReason: { en, zh, … }`); rendering it directly throws "Objects are not valid as a React
    child". Resolve it with `localizedText()`/`ctx.locale.resolveText` (0.11.4). The same rule applies
    to any new field read from a projection: check `typeof === 'string'` first, or it reaches React.
14. **Never read a nested Cordis service through the context proxy.** `ctx.uiSession.sessionStatus`,
    `ctx.remote.permissionPresets` and friends are separate services under a dotted name. The runtime
    rejects the read unless that exact name is in `inject`, and a render-time throw blanks the panel;
    when the capability is optional, use the reflective `ctx.get(name)` at mount time (`sessionStatus.ts`,
    `remote.ts`). `test/session-status.spec.ts` guards the `uiSession` case.
15. **The shell retires a crashed slot entry; it does not retry it.** A throw from the page — render
    or effect — is reported to the slot registry, the `main` entry abdicates, and the centre column
    keeps an empty crash face until the page reloads. That is why `MonitorPanel` registers the page
    behind `PanelErrorBoundary` and every card sits in `CardErrorBoundary`: the shell's boundary must
    never see a monitor failure. Do not register `MonitorPage` directly.

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
5. **Tiny-cell question UI.** At large budgets (16 cards and beyond), options need a scroll. Consider a compact answer mode or
   letting a waiting card span two rows without breaking the one-page contract.
6. **Idle-session noise.** Consider folding old idle sessions behind a "show older" toggle or
   grouping by Workspace, while keeping recency ordering.
7. **Measure** client memory and message volume with 9 and 24 retained streams.

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
| 0.8.0 | Toolbar New Session button with a Workspace drop-down; "Choose a folder…" adopts a directory as a Workspace and starts the session there |
| 0.9.0 | Creating a session keeps the monitor open: its blank card joins the frozen order (oldest slot on a full grid) and a displaced card stays at the order tail, so the grid neither navigates nor churns |
| 0.9.1 | The frozen order is stored with the preferences: a panel switch or app restart resumes the same cells, a `pending` catalog never re-seeds it, and a smaller budget only hides the order's tail instead of re-ranking |
| 0.10.0 | The toolbar's card-budget select becomes a stepper: one card per increment, an editable number between 2 and 24, and the stored/clamped range widened from 1–16 to 2–24 |
| 0.11.0 | Lowering the card budget re-seeds the grid to the newest sessions, newest-first; raising it keeps that order. This intentionally reverses the 0.9.1 rule that a smaller budget only hides the order's tail |
| 0.11.4 | An approval's `displayReason` locale map is resolved to text through `ctx.locale.resolveText` (English entry as fallback), so a sandbox-escalation approval no longer throws during render; the page and each card render behind their own error boundary with a Retry action, so a throw cannot blank the centre column until a reload |
| 0.11.7 | The card head is larger and proportional: the session title is the content font size plus 4px (18px at the 14px default), and the workspace / state / time line below it is exactly 1.5x smaller than that title (12px) instead of a fixed 10px, both still derived from `--dsh-content-font-size` so Settings -> General scales them together |
| 0.11.6 | The nested Cordis service `uiSession.sessionStatus` is resolved reflectively at mount instead of being read through the context proxy during render — the rc.3 runtime throws `cannot get property "uiSession.sessionStatus" without inject`, which put every mount of the page behind the Retry fallback |
| 0.11.5 | The page reads every foreign value defensively: a `null` catalog `byId`, a row whose `cwd` is not a string (the title fallback called `.split()`), a `null` row behind a spawned id (the prune effect read `.blank`), non-string catalog ids and Workspace members all read as "nothing known" instead of throwing; the page/card fallbacks print the one-line error they caught, so a recurrence is diagnosable in place |
| 0.11.8 | A card title click also unfolds the sidebar Workspace group that holds the Session: `workspaceReveal.ts` resolves the owner from `ctx.workspaces.list` membership (Session `cwd` as fallback) and clicks the folded `role="treeitem" [data-row-key="workspace:<id>"]` row before `uiWorkspace.openSession`, because the host auto-expands only a group that has no explicit expansion entry. A rail sidebar, flat grouping or folded tree ancestor leaves the row unrendered and the click a no-op; the title still opens the Session |
