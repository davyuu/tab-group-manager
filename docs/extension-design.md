# Tab Group Manager Extension Design

## Goal

Build a Chrome extension that:

- tracks all windows, tabs, and tab groups in real time
- shows them in a single management UI
- suspends and restores individual tabs
- suspends and restores entire tab groups

This plan uses two upstream codebases as conceptual bases:

- `fromjag/TabSaverExtension` for the lightweight MV3 shell and "overview page" pattern
- `theluckystrike/tab-suspender-chrome-extension` for suspension workflow, service worker structure, and suspend/restore UX

Important caveat: the original product reference, `TabPilot`, appears to be closed-source. For planning, `TabSaverExtension` is the closest small open-source UI base, not a literal TabPilot source drop-in.

## Upstream Inputs

### 1. `fromjag/TabSaverExtension`

- Repo: `https://github.com/fromjag/TabSaverExtension`
- Inspected commit: `c4d72bbb15bce99e7342f49cc0b5aa6697e82184`
- Local inspection path: `/tmp/TabSaverExtension`

Useful patterns:

- The action button opens or focuses a dedicated management page instead of packing everything into a tiny popup. See `background.js:14-35`.
- The manager page reads from `chrome.storage.local`, renders a session list, and wires simple action handlers directly in the page. See `tabs.js:35-167`.
- The saved-session schema is intentionally simple and easy to evolve. See `tabs.js:6-16`.

Limits:

- It tracks only URLs, not tab ids, group ids, window ids, or group metadata.
- It does not use `chrome.tabGroups`.
- It is a "save/restore session" tool, not a live state tracker.

### 2. `theluckystrike/tab-suspender-chrome-extension`

- Repo: `https://github.com/theluckystrike/tab-suspender-chrome-extension`
- Inspected commit: `4e5d4adc8b35988d237a5bd2f2d2fc183434ace5`
- Local inspection path: `/tmp/tab-suspender-chrome-extension`

Useful patterns:

- Good MV3 manifest surface for a suspender: `tabs`, `storage`, `tabGroups`, `contextMenus`, `commands`, `content_scripts`, and a service worker. See `src/manifest.json:16-85`.
- The background service worker already centralizes timers, settings, commands, context menus, and suspend/restore flows. See `src/background.js:12-321`.
- The core suspend/restore implementation is straightforward and reusable in spirit: turn a tab into an extension-owned suspended page, then restore the original URL later. See `src/background.js:345-396`.
- The popup already renders windows and tab lists and supports per-tab actions. See `src/popup.js:86-298`.
- The content script already detects activity and can capture form/scroll state. See `src/contentScript.js:15-151`.

Limits:

- The repo requests the `tabGroups` permission, but the code does not actually model or operate on tab groups yet. `groupId` is not used anywhere in `src/`.
- `GET_TAB_LIST` returns windows and tabs only, not tab groups. See `src/background.js:537-560`.
- The content script emits `FORM_STATUS`, but the background currently ignores it beyond returning success. See `src/background.js:274-275`.
- The content script can provide form and scroll state via `GET_TAB_STATE`, but the background does not call it before suspension, so state preservation is not wired end to end yet.

## Product Direction

The cleanest v1 is:

- a side panel for the full overview
- a service worker as the single source of truth
- placeholder-page suspension for both single tabs and grouped tabs

Why this direction:

- It matches the suspender repo's existing mechanics.
- It allows explicit restore without depending on Chrome's native discard behavior.
- It keeps tab identity and likely group membership intact while the tab is "suspended" by URL replacement.
- It gives us room to add true native discard as a future optional mode if desired.

## Recommended Extension Shape

### Primary surfaces

- `background` service worker
- `manager` page or `side_panel` for the full live tab/group dashboard
- `popup` for quick actions only
- `suspended.html` page for suspended tab UX
- `contentScript` for activity and page-state capture

Recommendation:

- Put the real management experience in a side panel.
- Keep the popup intentionally narrow: quick suspend current tab, suspend current group, restore current group, open manager.

## Milestones

The project should be built in four milestones.

### Milestone 1. Live side-panel browser map

Goal:

- create an extension that can view all windows, groups, and tabs

Scope:

- MV3 manifest and service worker
- side panel entry point
- normalized browser snapshot
- render window -> group -> tab hierarchy
- refresh on browser events

Out of scope:

- suspension
- restore
- policy
- auto-suspend

Implementation notes:

- This is mostly net-new work.
- The best upstream inspiration here is the dedicated manager surface from `TabSaverExtension/background.js:14-35` plus the live window/tab listing shape from `tab-suspender-chrome-extension/src/popup.js:86-190`.
- The missing piece is native tab-group modeling via `chrome.tabGroups.query({})`.

Success condition:

- the side panel reliably shows all windows, all groups, ungrouped tabs, and keeps itself in sync

### Milestone 2. Single-tab suspend

Goal:

- update the extension to suspend individual tabs

Scope:

- add `suspendTab(tabId)`
- add `suspended.html`
- add per-tab suspend actions in the side panel
- persist enough metadata to restore later even if restore UI is not exposed yet

Implementation notes:

- This milestone should stay very close to the suspender reference.
- The core model to reuse is in `tab-suspender-chrome-extension/src/background.js:327-396`.
- The side-panel action wiring can mirror the per-tab controls in `tab-suspender-chrome-extension/src/popup.js:193-298`.
- Your note is directionally right: up through this point, we should mostly be copying the suspender mechanics and adapting them to the side panel.

Success condition:

- any eligible tab can be suspended from the side panel and appears as suspended in the live model

### Milestone 3. Group suspend

Goal:

- add functionality to suspend all tabs within a group

Scope:

- add `suspendGroup(groupId)`
- add group-level actions in the side panel
- preserve tab ordering and group metadata
- track whether a group is fully or partially suspended

Implementation notes:

- This is the first milestone that is genuinely new relative to the inspected repos.
- Group suspension should be orchestration over member tabs, not a special Chrome primitive.
- Build this on top of the milestone 1 browser model and the milestone 2 per-tab suspension engine.

Success condition:

- clicking suspend on a group suspends all eligible member tabs and the UI clearly reflects the group state

### Milestone 4. Nice-to-have features

Goal:

- layer on restore, focus actions, policy, auto-suspend, whitelist, metadata, and other polish

Includes:

- restore tab
- restore group
- focus tab
- focus group
- policy controls
- auto-suspend timers
- whitelist rules
- richer metadata
- page-state capture and restoration
- badge counts, stats, and settings UX

Implementation notes:

- Most of the raw ingredients already exist in the suspender repo:
- commands and context menus in `src/background.js:85-163`
- timer-based monitoring in `src/background.js:169-214`
- whitelist and settings patterns in `src/background.js:430-462`
- content-script state capture in `src/contentScript.js:48-121`

Success condition:

- the extension is no longer just a manual suspender, but a usable day-to-day tab-group management tool

## Core Architecture

### 1. Background service worker as authority

The service worker should own:

- current normalized browser snapshot
- suspension and restoration commands
- storage writes
- tab/group/window event handling
- badge counts and command routing

This builds on the organization already visible in `src/background.js:12-321`.

### 2. Normalized runtime model

Use a normalized in-memory store plus persisted snapshots:

```ts
type WindowRecord = {
  id: number
  focused: boolean
  tabIds: number[]
}

type GroupRecord = {
  id: number
  windowId: number
  title: string
  color: chrome.tabGroups.ColorEnum
  collapsed: boolean
  tabIds: number[]
  suspended: boolean
  suspensionSessionId?: string
}

type TabRecord = {
  id: number
  windowId: number
  groupId: number
  index: number
  title: string
  url: string
  favIconUrl?: string
  pinned: boolean
  audible: boolean
  active: boolean
  status: 'active' | 'idle' | 'suspended'
  suspensionSessionId?: string
}

type SuspendedTabRecord = {
  sessionId: string
  tabId: number
  originalUrl: string
  originalTitle: string
  originalFavIconUrl?: string
  windowId: number
  groupId: number
  groupTitle?: string
  groupColor?: chrome.tabGroups.ColorEnum
  capturedAt: number
  pageState?: {
    scrollPosition?: { x: number; y: number }
    formData?: Record<string, unknown>
    hasUnsavedForms?: boolean
  }
}

type SuspendedGroupRecord = {
  sessionId: string
  groupId: number
  windowId: number
  title: string
  color: chrome.tabGroups.ColorEnum
  collapsed: boolean
  tabIds: number[]
  capturedAt: number
}
```

### 3. Browser sync layer

Build a single `refreshBrowserState()` that combines:

- `chrome.windows.getAll({ populate: true })`
- `chrome.tabGroups.query({})`

Then subscribe to:

- `chrome.tabs.onCreated`
- `chrome.tabs.onUpdated`
- `chrome.tabs.onRemoved`
- `chrome.tabs.onMoved`
- `chrome.tabs.onAttached`
- `chrome.tabs.onDetached`
- `chrome.tabs.onActivated`
- `chrome.tabGroups.onCreated`
- `chrome.tabGroups.onUpdated`
- `chrome.tabGroups.onRemoved`
- `chrome.windows.onCreated`
- `chrome.windows.onRemoved`
- `chrome.windows.onFocusChanged`

This is the main feature missing from both bases. `TabSaverExtension` is not live-tracked, and the suspender repo stops at window/tab tracking.

### 4. Suspension engine

Start from the suspender repo's model in `src/background.js:327-428`, then make it group-aware.

Required commands:

- `suspendTab(tabId)`
- `restoreTab(tabId)`
- `suspendTabs(tabIds[])`
- `restoreTabs(tabIds[])`
- `suspendGroup(groupId)`
- `restoreGroup(groupId)`

Recommended suspend flow for one tab:

1. Read current tab.
2. Reject internal pages, already-suspended tabs, pinned tabs if configured, audible tabs if configured, and active tab if configured.
3. Ask content script for state via `GET_TAB_STATE`.
4. Persist `SuspendedTabRecord`.
5. Navigate tab to `suspended.html?...`.
6. Update in-memory store and badge.

Recommended group suspend flow:

1. Query all tabs where `tab.groupId === groupId`.
2. Capture group metadata via `chrome.tabGroups.get(groupId)`.
3. Persist `SuspendedGroupRecord`.
4. Suspend each tab in stable tab-index order.
5. Mark group as suspended in local state.
6. Keep group metadata visible in the manager UI.

Recommended group restore flow:

1. Load `SuspendedGroupRecord`.
2. Restore member tabs in index order.
3. Re-read the current group and reconcile any moved/closed tabs.
4. Clear the group's suspended marker only when all intended tabs have been handled.

### 5. State preservation

The suspender base already has the right primitives in `src/contentScript.js:48-121`, but they are not wired through.

For this project, preserve:

- original URL
- original title
- favicon
- last activity
- scroll position
- basic form data when available
- tab and group membership metadata

Do not block v1 on perfect state restoration for every site. Treat page-state restore as best effort and keep the original URL restore path as the hard requirement.

### 6. UI architecture

Use the "dedicated management surface" pattern from `TabSaverExtension/background.js:14-35`, but replace the static session list with a live tree:

- Window
- Group
- Tab

Suggested UI sections:

- top toolbar with search, filters, and actions
- grouped browser tree
- "Suspended Groups" area
- "Ungrouped Tabs" area
- quick stats

Each group row should support:

- suspend group
- restore group
- expand/collapse tabs
- focus group

Each tab row should support:

- suspend tab
- restore tab
- focus tab
- show page/domain metadata

### 7. Persistence model

Use `chrome.storage.local` for:

- `suspendedTabsBySessionId`
- `suspendedGroupsBySessionId`
- cached manager UI preferences
- optional activity history and stats

Use `chrome.storage.sync` only for user settings:

- auto-suspend timeout
- pinned tab policy
- audible tab policy
- whitelist
- startup behavior

This follows the spirit of the suspender repo split: sync for settings, local for runtime-ish data.

## Implementation Plan

### Phase 0. Project setup

- Start a new MV3 extension rather than forking either repo directly.
- Copy ideas, not the file layout.
- Use the suspender repo as the service-worker and suspend-page reference.
- Use the saver repo as the "open/focus manager page" reference.

### Phase 1. Build milestone 1

- Create the normalized state store in the background worker.
- Implement initial snapshot loading from `windows.getAll` plus `tabGroups.query`.
- Add event listeners to keep state updated incrementally.
- Expose a `GET_BROWSER_STATE` message for the side panel UI.

Success condition:

- the side panel can render all windows, groups, and ungrouped tabs without suspension logic yet.

### Phase 2. Build milestone 2

- Add `suspendTab` and `restoreTab`.
- Add `suspended.html`.
- Persist `SuspendedTabRecord`.
- Add per-tab suspend controls in the side panel.

Success condition:

- any eligible tab can suspend from the side panel using the copied suspender flow.

### Phase 3. Build milestone 3

- Add `suspendGroup(groupId)` and `restoreGroup(groupId)`.
- Capture group metadata and tab ordering.
- Surface group actions in the side panel.
- Add handling for partial failures and partially restored groups.

Success condition:

- a whole group can be suspended and restored with ordering and metadata preserved.

### Phase 4. Build milestone 4

- Add restore actions.
- Add focus actions.
- Add policy and whitelist support.
- Add auto-suspend timers.
- Add richer state capture and restoration.

Success condition:

- the extension is polished enough for day-to-day use.

## Key Risks

### 1. Group semantics are still tab-by-tab

Chrome does not expose a single native "suspend this group" operation. Group suspension will be orchestration over member tabs, not a first-class browser primitive.

### 2. Placeholder-page suspension is not native discard

The suspender base swaps the tab URL to `suspended.html` rather than using `chrome.tabs.discard()`. That is more controllable, but it changes the visible tab content and may not suit every workflow.

### 3. Real page-state restoration is best effort

The content-script pattern is useful, but universal state restore across modern apps is hard. The product should promise reliable URL restore first, richer state restore second.

### 4. Upstream README claims exceed current implementation

The suspender repo claims tab-group awareness, but the inspected code does not currently implement actual group modeling or group actions. Plan from code, not README marketing.

## Recommendation

For this project, the best path is not "merge two repos." It is:

1. start a new MV3 extension
2. borrow the dedicated manager-surface idea from `TabSaverExtension`
3. borrow the service-worker and suspend/restore mechanics from `tab-suspender-chrome-extension`
4. design a new group-aware state layer in the middle

That middle layer is the actual product.

## Concrete Code References

- `fromjag/TabSaverExtension`
  - `background.js:14-35` for the "open or focus manager page" action flow
  - `tabs.js:2-20` for simple storage-backed capture
  - `tabs.js:35-145` for page-side rendering and action wiring

- `theluckystrike/tab-suspender-chrome-extension`
  - `src/manifest.json:16-85` for MV3 permissions and command surface
  - `src/background.js:34-56` for install/startup bootstrapping
  - `src/background.js:85-163` for context menu and command routing
  - `src/background.js:169-214` for timer-driven monitoring
  - `src/background.js:327-396` for suspend/restore primitives
  - `src/background.js:398-428` for bulk tab operations
  - `src/background.js:537-560` for the current window/tab listing shape
  - `src/popup.js:86-190` for rendering a live list from Chrome APIs
  - `src/popup.js:193-298` for per-tab suspend/restore UI actions
  - `src/contentScript.js:48-121` for scroll/form capture and restoration primitives
