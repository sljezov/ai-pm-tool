# 5–10 minute demonstration script

## Preparation (before the timer)

Run the README setup with fixture AI, open `http://localhost:3000`, and optionally seed the repeatable `Spordiklubi broneeringud` project. For the fullest demonstration, create a fresh project so every confirmation is visible.

## 0:00–1:30 — idea and clarification

1. Create `Spordiklubi demo` with the description `Soovin spordiklubile rakendust, kus liikmed saavad treeninguid leida ja neile koha broneerida.`
2. Point out `Näidis-AI · fixture`: the demo is offline and deterministic.
3. Send the same vague idea in the conversation. Choose `Treeningute broneerimine` from the clarification buttons. Mention `Muu (kirjutan ise)` and `Jäta vahele` as alternative paths.
4. In the role proposal, rename a role if desired, choose the primary role and click `Kinnita rollid`.

## 1:30–3:00 — stories and priority

5. Click `Genereeri happy-path lood`. Show the six ordered stories, deselect one, then click `Lisa valitud (5)`.
6. Request the priority recommendation. Accept it or explicitly select another story.
7. In Backlog, move one story up or drag it, then set `MVP piir siia`. This demonstrates that AI recommends while the product manager controls order and scope.

## 3:00–4:30 — criteria and wireframe

8. Generate the selected story's criteria and mockup. Reject the subjective criterion, edit one criterion into a single measurable result, and accept the others.
9. Show the safe wireframe preview and element mappings, then click `Rakenda kriteeriumid ja mockup`. Open the story inspector to show three criteria and mockup version `v1`.

## 4:30–6:00 — client clarification and isolation

10. Enter `Kliendi täpsustus: hind peab sisaldama käibemaksu 24%.`
11. Show story, criteria and wireframe before/after. Click `Muuda`, adjust one proposed field, then `Rakenda täpsustus`.
12. Show mockup version `v2` and a second backlog story that did not change. Mention that cross-story impacts remain separate suggestions and stale proposals are rejected.

## 6:00–7:30 — grooming and readiness

13. Add a manual large story (size `L`) or duplicate an existing story. Open Grooming and click `Vaata backlog üle`.
14. Inspect one finding's split/merge preview, including criterion distribution and archive behavior. Apply that finding and show that its sibling finding remains pending. Use `Võta tagasi` to demonstrate atomic recovery if time permits.
15. Add an open question to the selected story and attempt `Valmis arenduseks`. Show the complete blocking checklist. Resolve the question; ensure at least three passing criteria and a mockup exist; then mark the story ready.

## 7:30–8:30 — continuity and close

16. Reload the page. Show that conversation, order, MVP boundary, selected story, criteria, mockup history and proposals persist.
17. Return to the project list and reopen the project. Point out `Jätka siit` and its context-derived recommended next stage.
18. Close with the invariant: generation creates a reviewable proposal; only an explicit confirmation changes backlog data.

If a live-provider smoke test is required, follow the optional procedure in README after the deterministic demo. Do not use live mode for the timed acceptance path.
