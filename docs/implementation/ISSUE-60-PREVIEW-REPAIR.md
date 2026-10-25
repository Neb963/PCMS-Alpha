# Issue60 — contextual preview completion

Base: main567b7d1071119dca9926e0353d8e444f1d7f2bd2 / v1.2.15. Postmerge run40239199974 failed the retained J02 assertion for `Complete inventory · New account` after its preview summary appeared. No final XPI was delivered.

The failure exposed a product race: the creator started its account-list read separately, allowed preview before that response, then drew contextual actions using an empty/stale account list. A late list response did not redraw the frozen preview. This could leave the inventory recovery control absent until another preview.

Each preview now obtains its coordinator result and current account context together before drawing its summary/actions. An epoch prevents an older initial account read overwriting the newer context. Account selection, frozen input, explicit pinned allocation and resumable batch intent are retained; no provider action or grant is added. Initial-list errors cannot replace a newer successful preview. Version advances to1.2.16.

The installed-Firefox regression deliberately holds actual account-port read replies while observing an independent successful coordinator preview. The v1.2.15 package fails the new atomic-completion assertion (RED). The corrected package must keep the preview pending, then expose its functioning contextual action after account reads resume; the retained suite subsequently clicks that action and verifies actual inventory commit and frozen-plan recovery. Gates remain unchanged. Final exact-diff review, full final-candidate CI and postmerge main verification are required before delivery.

Local corrected verification: all1157 required deterministic cases pass. The complete installed J02 journey passes with the delayed-account negative cut, atomic recovery action, real inventory commit, pinned selection, interrupted intake and cold restart. Source and other journey capabilities remain enabled; full final CI and postmerge verification remain pending.
