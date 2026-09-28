# Next Steps

The open queue only, ordered by value. Findings, measurements and closed items are in
[CHANGELOG.md](CHANGELOG.md), cited by date tag (e.g. `CHANGELOG 2026-09-23e`). When an item
closes, write its result entry in the changelog and delete it here.

**Recently run:** team1 (CHANGELOG 2026-09-26d), then team2 with the team1 levers (2026-09-26g): approved, the answer key grew 78 → 101 through three amendments, and zero reachable defects in our sweep. The robustness fixes (2026-09-26b) held in both runs, but were never exercised.

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

## 3. NEXT: the team arm on a second, non-music brief (decided 2026-09-26, CHANGELOG 2026-09-26g)

**IN FLIGHT (2026-09-28, CHANGELOG 2026-09-28a):** the brief is loan amortization
(`prompts/amortization.md`, greenfield `8428cab`). The oracle was written first:
`specs/oracles/amortization_oracle.ts`. Two arms are running: `amort1-20260928-3b70c4` (team) and
`amort1c-20260928-ba7ad8` (tdd control, same brief). **Next:** when both finish, `lifecycle refresh`
and harvest each one. Then adapt the oracle into `sweep_amort1.test.ts` (the app's module/DOM surface →
`invariants()` over `GRID`, plus `schedule()` under the declared convention), judge P1–P6, reconcile
cost, and tear down.

team2 met all six predictions on the music brief. The question now is whether the levers
**generalise**: the answer key, amendments, traps with rows, per-instance counting. The same brief
is also a confound, since the prompts cite team1's defects. So the next experiment is a new brief,
not a replicate.

**Choosing the brief.** It has to have the property that made the music brief a good test: **values
that can be wrong while looking right, derivable from first principles, spread across many
instances**. Otherwise the answer key has nothing to do. Candidates (pick one; don't run all of them):
- **A loan / mortgage amortization explorer:** payment formula, per-period schedules, rounding,
  extra payments. Lossy-key analogue: monthly vs annual rates, and the last-payment remainder.
- **A time-zone meeting planner:** UTC offsets, DST transitions, overlaps across zones, day
  rollovers. Rich in "right-looking wrong" answers.
- **A unit-conversion workbench** (cooking, engineering): factor tables, compound units,
  significant figures. Easy to judge, but maybe too shallow.

**Steps:**
1. Write the brief as `prompts/<name>.md` in greenfield-sandboxes. `prompts/` is target-owned, so it
   is a normal commit there, not a factory sync. It gives the same kind of constraints as
   `greenfield.md` (infrastructure only, every design decision delegated), and it names no answers.
2. Add the brief's domain terms to `targets/greenfield.yaml` `leak_patterns` if needed, and check
   that nothing in the factory prompts leaks the new domain. The current incident examples are all
   music, which is fine for this run.
3. Write an **independent oracle sweep first**, before mounting. Build it from the domain's own
   formulas (the P4/P5 judge), so it cannot be shaped by what the run builds. This is the step that
   took the longest to adapt for each music run.
4. Pre-register, reusing team2's predictions: P1–P3 and P6 as written. P4 becomes "zero reachable
   value defects, judged by our sweep". Record the `V` growth, the amendments and the per-instance
   evidence.
5. Mount one run on the team arm (`just sbx lifecycle execute <id> prompts/<name>.md
   adws/adw_sssf_config/sssf.team.config.yaml team`). Optionally run a second arm on the `tdd` ADW,
   the old prompts, as a same-brief control. That is the first control on a fresh brief, and it would
   make the comparison clean.

**Still open, not blocking:** unsatisfiable-test detection (`tests_red` cannot tell "red, the code is
missing" from "can never pass"). A replicate on the music brief. Promoting the team arm to the
default only after the second brief.

## 4. Still open, not in a spec

- **(6) the audio channel**: still unmeasured. It needs a brief-level requirement and an
  `AudioContext` value spy in `test-dom.ts`. Related to item 2 (a silent channel is a value channel).
- **Render smoke D, the box-centre case**: Playwright clicks a control's box centre, so a hub covering
  every sector's centre (gf3-2, 9/25) blocks D. A centroid hit-test would reach them.
- **Planner-specificity postmortem** (exploratory, 2026-09-24b): plans for harn4/5/6 frozen blind;
  harn7's hash taken after its outcome. Low priority at N=2.

## 5. A 0731 control roster, if any A/B is wanted

The default runs v4.1 and nothing runs `0731`. Build one only when an A/B needs it.

## 6. `specs/context-rot-and-self-compact.md` — a later experiment, gated

A stub. Stage 1 reads the context curves: do defects concentrate at high occupancy? If not, stop.
Stage 2 is a host-local spike: the self-compact extension is tested only under pi **RPC** mode,
while the factory runs `pi -p --mode json`, which exits at idle. So its handoff (compaction once
idle, note returned as the next turn) may never complete in print mode. Stage 3 is a two-arm
A/B, builder seat only. Its prerequisite, the context curve, is built (CHANGELOG 2026-09-23g).


# CURRENT STATE — DeepSeek V4.1 is the default; the other rosters are still on 0731

**Read this before touching a roster or the model registry.** The reasoning behind the partial
rollout is in CHANGELOG "2026-09-20 → 2026-09-23 — why the v4.1 rollout stopped at the default
roster". Promote further only after a harness-fixed re-run, one roster at a time.

### Registered globally; the default and one sibling use v4.1

`sandbox_mount/guest/models.json.tmpl` carries **both** flash models:

| id | input | $/M in/out |
|---|---|---|
| `deepseek/deepseek-v4-flash-0731` | `["text"]` | 0.14 / 0.28 *(registry; live is 0.04/0.08 — see drift below)* |
| `deepseek/deepseek-v4.1-flash` | **`["text","image"]`** | 0.15 / 0.60 *(matches live exactly)* |

| roster | defaults.model |
|---|---|
| **`sssf.config.yaml` (default)** | **`deepseek-v4.1-flash`** (since 2026-09-20, pushed to greenfield `601d880`) |
| `sssf.dsflash41.config.yaml` | `deepseek-v4.1-flash` (now a duplicate of the default, left on purpose) |
| `sssf.asymmetric` / `deepestseek` / `inverse` / `open-weights` / `top-speed` | `deepseek-v4-flash-0731` |
| `sssf.frontier` | `claude-opus-5` |
| `sssf.gemniflash` | `gemini-3.8-flash` |

### Do NOT "tidy" these

- **`0731` stays registered** even after any promotion — a swap must be
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
