# Next Steps

The open queue only, ordered by value. Findings, measurements and closed items are in
[CHANGELOG.md](CHANGELOG.md), cited by date tag (e.g. `CHANGELOG 2026-09-23e`). When an item
closes, write its result entry in the changelog and delete it here.

**Recently run:** the meeting-planner pair (CHANGELOG 2026-09-28f–g), on the post-consolidation defaults. Before that, the consolidation (CHANGELOG 2026-09-28e): `team` is now `execute`'s default ADW, `tdd` is the frozen control (`just adw control`), and six rosters are in `archive/factory/`. Before that, the amortization pair and the rerun (CHANGELOG 2026-09-28a–d). amort2 (team) was exact, including a half-cent tie that the control missed. Gate E now asserts that account credit covers every open run (2026-09-28c). Before that: team1/team2 on the music brief (2026-09-26d/g).

**Recently closed:** the N=3 replicate set, closed at 2 valid runs by decision (CHANGELOG
2026-09-24f). The render smoke's D now re-finds hidden controls (CHANGELOG 2026-09-24a). Earlier:
harn2/harn3 and the harness-signals spec (CHANGELOG 2026-09-23d–i).

Item numbers in parentheses, such as "4(5)", refer to the queue in CHANGELOG 2026-09-20b.

## 2. Close the value-detection gap: BUILT as the team arm, untested (CHANGELOG 2026-09-26a)

Reachable value defects shipped in 2 of 4 runs, both in tables that no agent converted into pitches.
Every in-loop catch was an enumerated check; the harn7 miss was an asserted one.

**Answered by design, not yet by a run:** `specs/team-ownership-prompts.md`. The planner writes an
Expected values table (input → expected → derivation), which is frozen and changes only through
amendments the reviewer rules on. Every review must sweep every `V` and declare its `value_sweep.*`
script (the `values_swept` gate). It ships as a separate arm: `adw_team_sdlc.py` +
`sssf.team.config.yaml`. The control is untouched. The harn5/harn7 sweep scripts
(`.sandbox/runs/harn5-…-artifacts/sweep_harn5.ts`, `harn7-…/sweep_harn7.ts`) are the starting
point for the independent judge in item 3.

## 3. NEXT: pick the next lever from the meeting-planner result (CHANGELOG 2026-09-28g)

**The meeting-planner pair is done.** Both engines were exact on every instant-level value.
- The team arm (mtg1, approved review_3) shipped one narrow defect: a meeting straddling a spring-forward
  transition is classified by linear local minutes (16/196,860).
- The control (mtg1c, approved review_2) shipped wrapped working hours (a night shift is never "core",
  reachable) and an end-inclusive boundary.
- The team **corrected a wrong key row itself**: A1's V67 = 930 → A2's 1320, re-verified by the reviewer.
- The team also turned review findings into DOM key rows (A3/A4).

**PAUSED 2026-09-28, pick up here (Ron: "a fresh look in the morning… maybe overdesign").**
`specs/edge-class-gate.md` stopped after Phase 1. Its calibration (`specs/edge-class-calibration.md`)
showed the approved design would have **passed** mtg1: the key had spans across work and sleep edges,
not across DST. Also, 6/31 past defects are whole-range, not edge defects. Three ways forward:
1. **Model mix on the team harness.** Frontier planner and reviewer, flash builder (the old asymmetric
   idea, untested since the team prompts). Score on P4 and record cost. Ron's lean: "sharper teams might
   pull ahead and show cost is one of many variables."
2. **A lighter lever:** the reviewer writes an independent check of the core engine (an oracle), not only
   a sweep of the key. Independence is what caught both mtg1 defects.
3. **Per-limit edge coverage** (the calibrated fix), if the edge gate is still wanted.

**Candidates (before the pause):**
- **The edge-class gate, with "spans" in the class list.** A transition *instant* was pinned and a meeting
  *spanning* one was not. That is the third instance of "the key guards only the edges it contains".
- **A replicate of the pair**: N=1 each.
- **The `−1d` overflow**: no render-smoke check covers text overflow. It is a visual defect in the
  day-shift cells.
- mtg1/mtg1c torn down 2026-09-28; billed $1.807 / $1.270, reconciled per generation.

**The next lever (not in this cleanup):** "the key only protects edges it contains". Make the P5-style
obligation a gate: the key must include a row for each named edge class of the brief's domain.

**Still open, not blocking:** unsatisfiable-test detection (`tests_red` cannot tell "red, the code is
missing" from "can never pass"). A replicate on the music brief. A same-brief amortization replicate would say whether
amort2 pinning a tie was luck.

## 4. Still open, not in a spec


- **(6) the audio channel**: still unmeasured. It needs a brief-level requirement and an
  `AudioContext` value spy in `test-dom.ts`. Related to item 2 (a silent channel is a value channel).
- **Render smoke D, the box-centre case**: Playwright clicks a control's box centre, so a hub covering
  every sector's centre (gf3-2, 9/25) blocks D. A centroid hit-test would reach them.
- **Planner-specificity postmortem** (exploratory, 2026-09-24b): plans for harn4/5/6 frozen blind;
  harn7's hash taken after its outcome. Low priority at N=2.

- **The ADW cut** (deferred from 2b, CHANGELOG 2026-09-28e): 12 upstream composables that no experiment
  runs. The sssf and orchestrator skills (including `just_command_model.md`) reference them heavily, so
  it needs its own inventory. `adw_prompt.py` stays regardless (provision.sh).
- **`.claude/skills/sssf/templates/`**: the installer's copy has neither `tdd` nor `team` and a drifted
  `gates.py`. Re-template it, or retire it with the ADW cut.

## 5. A 0731 control roster, if any A/B is wanted

The default runs v4.1 and no live roster runs `0731`. The five 0731 rosters are in
`archive/factory/rosters/`; restore one only when an A/B needs it.

## 6. `specs/context-rot-and-self-compact.md` — a later experiment, gated

A stub. Stage 1 reads the context curves: do defects concentrate at high occupancy? If not, stop.
Stage 2 is a host-local spike: the self-compact extension is tested only under pi **RPC** mode,
while the factory runs `pi -p --mode json`, which exits at idle. So its handoff (compaction once
idle, note returned as the next turn) may never complete in print mode. Stage 3 is a two-arm
A/B, builder seat only. Its prerequisite, the context curve, is built (CHANGELOG 2026-09-23g).


# CURRENT STATE — DeepSeek V4.1 is the default; no live roster uses 0731

**Read this before touching a roster or the model registry.** The reasoning behind the partial
rollout is in CHANGELOG "2026-09-20 → 2026-09-23 — why the v4.1 rollout stopped at the default
roster". The 0731 rosters were archived on 2026-09-28 (CHANGELOG 2026-09-28e), not promoted.
A restored one (`git mv` back from `archive/factory/rosters/`) still runs on 0731.

### Registered globally; every live roster that uses DeepSeek uses v4.1

`sandbox_mount/guest/models.json.tmpl` carries **both** flash models:

| id | input | $/M in/out |
|---|---|---|
| `deepseek/deepseek-v4-flash-0731` | `["text"]` | 0.14 / 0.28 *(registry; live is 0.04/0.08 — see drift below)* |
| `deepseek/deepseek-v4.1-flash` | **`["text","image"]`** | 0.15 / 0.60 *(matches live exactly)* |

| roster | defaults.model |
|---|---|
| **`sssf.config.yaml` (default)** | **`deepseek-v4.1-flash`** (since 2026-09-20, pushed to greenfield `601d880`) |
| `sssf.team.config.yaml` (the team arm, `execute`'s default ADW) | the default roster's models, team prompts |
| `sssf.frontier` | `claude-opus-5` |
| `sssf.gemniflash` | `gemini-3.8-flash` |

### Do NOT "tidy" these

- **`0731` stays registered** although no live roster uses it. Setup gate D pings it by name
  (`setup.just:319`), and archived rosters must stay restorable. It stays even after any promotion — a swap must be
  revertible without re-provisioning. Same rule that kept `glm-5.2` and
  `gemini-3.6-flash` on 2026-09-15.
- **The `input` fields differ on purpose.** `0731` is genuinely text-only; v4.1
  is genuinely multimodal. Making them match would re-introduce the bug that
  blinded the 2026-09-20 treatment arm.
- **Registry rate drift is known and deliberate**, not stale: `check_rates.py`
  flags `0731` (0.14/0.28 vs live 0.04/0.08), `kimi-k3`, `glm-5.2` and `glm-5.3`.
  The deepseek keep-catalog-vs-use-measured decision is still open from
  2026-09-07g. **Do not `--fix` it casually** — it changes what every historical
  run's cost means. The v4.1 entry needs no such decision; it matches live.
