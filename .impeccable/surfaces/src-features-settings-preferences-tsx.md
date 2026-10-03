---
version: 1
slug: "src-features-settings-preferences-tsx"
primary_target: "src/features/settings/preferences.tsx"
related_targets: ["src/features/settings/identity-recovery.tsx","src/features/settings/data-backup.tsx"]
---

# Phase 7 Settings extension

Mode: Operate. Inherit the established FileMind system. User scope is identity recovery and verified backup in the existing Settings route; no redesign.

## Direction contract

THESIS: Recover identity and restore data as two clearly explained actions, each with its real state.

OWN-WORLD: Existing light reading surface, graphite dark theme, Geist, teal controls and flat section separators. Keep the incumbent component/token system.

STORY: Check recovery status, generate and save a one-time key, or recover in a new browser. Export a clearly unencrypted archive; validate it, review contents, import or cancel, then reindex if required.

FIRST VIEWPORT: Preserve the sidebar, Settings heading and appearance controls. Add Identity & Recovery and Data & Backup after workspace connection. On mobile use full-width readable fields and wrapped actions. Preview is inline with a definition list, default duplicate checkbox and Import/Cancel.

FORM: Ordinary extension of flat Settings sections. Seed key: inherited-filemind-settings.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: Preserve the five pre-existing user document edits. No new shipping raster assets, no decorative motion, no credentials persisted in UI, no fictitious dates/progress. Existing PRODUCT.md still describes Phase 6; report drift without repairing unasked. DESIGN.md is unchanged for an ordinary extension.
