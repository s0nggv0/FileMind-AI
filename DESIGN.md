# FileMind Design System

The user approved the architectural design and explicitly authorized Phase 1. This implementation inherits its warm reading surface and teal accent, adapting the precision of Linear, keyboard-first interaction of Raycast, and quiet document hierarchy of Notion.

- Mode: Operate. The task and its current state lead; brand expression stays in typography, rhythm and deliberate details.
- Background `#F7F8F6`, white surface, text `#18201D`, secondary `#66716B`, border `#E3E8E4`, accent `#0F766E`. Dark tokens use graphite surfaces and readable mint-teal accents.
- Geist Sans and Geist Mono are self-hosted from the geist package. Chinese uses installed sans-serif fallbacks without a build-time font download.
- Spacing uses a 4px scale, 8/16/24/32/48/64 rhythm. Sidebar is 232px. Content stays comfortable at 1280px and 1440px; mobile becomes single-column.
- Controls use 6–8px radii, main panels 12–16px. Flat separation, restrained borders, elevation reserved for command and navigation dialogs.
- Typography: 16px body, 13–14px supporting labels, 28–36px product headings. Tabular numerals for data. No decorative eyebrow labels.
- Motion: 160–220ms transitions, one restrained entrance for the main workspace, reduced-motion support. No constant glow or bouncing.
- Primary reusable states: LoadingState, PageSkeleton, EmptyState, ErrorState. Demo mode always visible. Buttons must have an actual effect or a clear disabled explanation.
- Cmd/Ctrl+K opens the accessible command dialog. Mobile navigation uses a focus-managed dialog. Settings includes state previews and local theme controls.

Phase 1 surface contract: the shell is shared; Workspace has the strongest import affordance, Search centers a natural-language input, Graph prioritizes relation exploration. Dashboard remains a compact foundation. Landing and complete dashboard content belong to Phase 2.
