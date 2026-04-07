# Agent Context

## Workspace Status

- The repository started empty, then a plain MV3 prototype was created for step 1.
- Step 2 single-tab suspension work was started after that, but it is currently stashed and not active in the working tree.
- Step 1 has now been migrated into a WXT + TypeScript + React structure.

Current stash of note:

- `step-2-suspend-prototype`

## User Goal

Create a Chrome extension that:

- tracks all tabs and tab groups
- provides a UI to inspect them
- suspends individual tabs
- suspends whole tab groups and restores them later

The user explicitly asked for planning and context only, with no code implementation yet.

## Conversation-Derived Product References

The upstream product references from the shared conversation were:

- `TabPilot` for the tab-group management UX
- `Tab Suspender Pro` for suspending logic

Important:

- `TabPilot` appears to be closed-source.
- The plan therefore substitutes an open-source tab-overview extension as a UI base concept.

## Upstream Repos Inspected

### UI / manager reference

- Repo: `https://github.com/fromjag/TabSaverExtension`
- Commit inspected: `c4d72bbb15bce99e7342f49cc0b5aa6697e82184`
- Temporary local clone used during planning: `/tmp/TabSaverExtension`

Main takeaways:

- MV3 extension with a dedicated management page.
- Action click opens or focuses that page.
- Stores saved sessions in `chrome.storage.local`.
- Does not model groups or live browser state.

Most relevant files:

- `background.js`
- `tabs.js`

### Suspension reference

- Repo: `https://github.com/theluckystrike/tab-suspender-chrome-extension`
- Commit inspected: `4e5d4adc8b35988d237a5bd2f2d2fc183434ace5`
- Temporary local clone used during planning: `/tmp/tab-suspender-chrome-extension`

Main takeaways:

- Good MV3 service-worker structure for suspension logic.
- Suspension works by replacing the tab URL with `suspended.html`, then restoring the original URL later.
- Popup already lists windows and tabs and supports per-tab actions.
- Content script can capture form and scroll state.
- The repo asks for `tabGroups` permission, but group-aware logic is not actually implemented in the inspected source.

Most relevant files:

- `src/manifest.json`
- `src/background.js`
- `src/popup.js`
- `src/contentScript.js`

## Architectural Conclusion

Do not try to literally combine the two repos.

Best path:

1. create a fresh MV3 extension
2. use a side panel as the primary UI
3. use the suspend/restore service-worker patterns from `tab-suspender-chrome-extension`
4. add a new normalized state layer for windows, groups, tabs, suspended tabs, and suspended groups

That new state layer is the missing piece in both upstreams.

## Framework Direction

The chosen long-term stack is:

- WXT
- TypeScript
- React for the side panel UI

The old plain `manifest.json`, `background.js`, `sidepanel.html`, `sidepanel.js`, and `sidepanel.css` files were prototype code and have now been replaced by the WXT structure.

Current primary structure:

- `wxt.config.ts`
- `entrypoints/background/index.ts`
- `entrypoints/sidepanel/index.html`
- `entrypoints/sidepanel/main.tsx`
- `entrypoints/sidepanel/App.tsx`
- `entrypoints/sidepanel/style.scss`
- `entrypoints/suspended/main.tsx`
- `entrypoints/suspended/style.scss`
- `src/lib/browser-state.ts`
- `src/lib/normalize-browser-state.ts`
- `src/lib/format-url.ts`

## UI Implementation Rules

- Prefer React/TSX for extension UI surfaces.
- Do not build page UI with `innerHTML` string injection.
- Do not add custom `escapeHtml` rendering paths for extension pages when React rendering can be used instead.
- Keep DOM event wiring declarative through React when practical.

## Agreed Milestones

### Milestone 1

- create an extension that can view all windows, groups, and tabs

### Milestone 2

- add support for suspending individual tabs
- keep this close to the existing Tab Suspender implementation

### Milestone 3

- add support for suspending all tabs within a group

### Milestone 4

- add restore tab and restore group
- add focus tab and focus group
- add policy, auto-suspend, whitelist, metadata, and other polish

## Important Gaps Future Agents Should Remember

- `TabSaverExtension` only saves URLs. It is not a live tab/group tracker.
- `tab-suspender-chrome-extension` does not actually use `groupId` or `chrome.tabGroups` in the inspected `src/` code.
- The content script in the suspender repo is more capable than the background currently uses.
- Group suspension will need to be implemented as orchestration over member tabs.

## Suggested Initial Build Order

1. Define manifest, service worker, and side panel surfaces.
2. Build the background-owned browser snapshot with `chrome.windows.getAll({ populate: true })` and `chrome.tabGroups.query({})`.
3. Build the side panel tree for window -> group -> tab.
4. Port single-tab suspension mechanics from the suspender repo.
5. Add group suspension orchestration.
6. Add restore, focus, policy, auto-suspend, whitelist, metadata, and tests.

## Current Status

- Step 1 exists and is implemented in WXT.
- The WXT build passes with `pnpm build`.
- TypeScript checking passes with `pnpm exec tsc --noEmit`.
- Step 2 is intentionally paused and stashed pending a clean WXT-native implementation.

## Docs Added In This Turn

- `docs/extension-design.md`
- `docs/agent-context.md`
