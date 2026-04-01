# Tab Group Manager

Tab Group Manager is a Chrome extension built with WXT, TypeScript, and React.

It gives you a side panel view of:

- all open browser windows
- all tab groups inside each window
- ungrouped tabs
- individual tab suspend and restore actions

The current project focus is:

1. browse the full window/group/tab hierarchy from the side panel
2. suspend and restore individual tabs
3. add group-level suspend flows next

## Tech Stack

- WXT
- TypeScript
- React
- Vitest
- ESLint

## Project Structure

- [`entrypoints/background/index.ts`](/Users/david/code/projects/tab-group-manager/entrypoints/background/index.ts): background service worker and suspend/restore orchestration
- [`entrypoints/sidepanel/App.tsx`](/Users/david/code/projects/tab-group-manager/entrypoints/sidepanel/App.tsx): side panel UI
- [`entrypoints/suspended/main.ts`](/Users/david/code/projects/tab-group-manager/entrypoints/suspended/main.ts): suspended-tab page
- [`src/lib/browser-state.ts`](/Users/david/code/projects/tab-group-manager/src/lib/browser-state.ts): shared types and message contracts
- [`src/lib/normalize-browser-state.ts`](/Users/david/code/projects/tab-group-manager/src/lib/normalize-browser-state.ts): browser state normalization

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- Google Chrome

## Install

```bash
pnpm install
```

## Run Locally

### Start development mode

```bash
pnpm dev
```

WXT will build the extension for development and keep it updated as files change.

### Build a production bundle

```bash
pnpm build
```

This generates the unpacked extension in:

```text
.output/chrome-mv3/
```

### Create a zip package

```bash
pnpm zip
```

## Quality Checks

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

GitHub Actions runs the same checks on every push and pull request.

## Load In Chrome

To run the extension locally in Chrome:

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the `.output/chrome-mv3` folder from this repo.
6. Pin the extension if you want quick access from the toolbar.
7. Click the extension action to open the side panel.

If you make code changes, rebuild and then click `Reload` on the extension card in `chrome://extensions`.

## Publish To The Chrome Web Store

If you want to upload this extension to the Chrome Web Store:

1. Build or zip the extension with `pnpm zip`.
2. Sign in to the Chrome Web Store Developer Dashboard.
3. Create a new item and upload the generated zip file.
4. Fill in the store listing, screenshots, description, and distribution settings.
5. Submit the item for review.

Chrome Web Store visibility can be configured as public, unlisted, or private during distribution setup.

Official Chrome docs:

- Load unpacked extensions: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked
- Prepare distribution in the Chrome Web Store: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution

## Current Behavior

- The side panel shows windows, groups, and tabs in a stable order.
- Focusing a different tab or window updates status badges without reordering the whole view.
- Suspending a tab opens a lightweight extension page in that tab.
- Suspended tabs keep their original title and URL in the side panel so they are easy to identify.

## Notes

- This project is currently Chrome-focused.
- Some suspend metadata is still stored in a way that should be tightened before a public release.
- Group-level suspend and richer restore policies are planned but not implemented yet.
