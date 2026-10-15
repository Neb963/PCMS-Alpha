# I17 UI-conformance repair — prototype parity before operator acceptance

**State:** I17 sub-slice, not a new phase. Operator feedback 2026-10-14. Do not claim complete product acceptance from visual parity or CI.

## Reported regressions and causes
1. Toolbar action inherited PersonaMonkey's `action.default_title/default_popup` because the combined build copied all donor `action` unchanged, despite replacing Options with PCMS. The donor popup is a legitimate protected routing UI, but the PCMS-first entrypoint is wrong.
2. `src/ui/index.html` contains the literal text `\\n` after a script close tag. This prints at the bottom of the document.
3. The shipped six-screen shell has basic stacked panels. Stage 4.7 approved prototype v3.1 defines a workstation visual hierarchy: grouped sidebar, 61px toolbar, 36px dense tables, context-first inspector, top-level status, narrow reflow, detailed evidence/holds, keyboard-first controls. The synthetic prototype itself cannot replace live operational controls or create permission to write.

## Required implementation sequence and hold
- Preserve Gecko ID, pinned donor code and security boundary. Toolbar opens PCMS options in a full tab; donor advanced settings remain an explicit in-app secondary link.
- Remove stray literal escaping and independently assert no visible raw escape token.
- Bring shell tokens, sidebar, toolbar, search affordance, responsive layout, status and operator action hierarchy in line with prototype *without deleting/renaming live IDs, hiding essential safety notices, or importing synthetic fixture behavior*. Preserve existing 6 destinations.
- Gradually align actual inventory, queue, account, Refresher and Settings workflow composition with prototype. Any synthetic-only feature missing a real implementation remains explicitly held, not cosmetically enabled.
- Add F negative assertions and packaged Firefox B smoke for toolbar behavior, absence of literal backslash-n, DOM handlers and accessible reflow. Keep donor route/security regressions and CI trust root unmodified.
- Finish I17 P54-09/P56 cross-system/profiling before release candidate. Operator H-01/H-07 and any separately authorized live Perchance H scenarios remain unexecuted until performed.

## Disposition
I17 remains draft until each applicable automatic proof and operator test passes on the **exact new XPI**. No remote provider effect is authorized by visual changes. Do not ship misleading `final/full-capability` labeling for held features.
