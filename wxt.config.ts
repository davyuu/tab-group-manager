import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tab Group Manager",
    description: "View all browser windows, tab groups, and tabs from a side panel.",
    icons: {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon-128.png"
    },
    permissions: ["tabs", "tabGroups", "storage", "sidePanel"],
    action: {
      default_title: "Open Tab Group Manager",
      default_icon: {
        "16": "icon-16.png",
        "32": "icon-32.png"
      }
    }
  }
});
