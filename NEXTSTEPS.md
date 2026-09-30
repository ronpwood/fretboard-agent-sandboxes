# Next Steps

The open queue only, ordered by value. Findings, measurements and closed items are in
[CHANGELOG.md](CHANGELOG.md), cited by date tag (e.g. `CHANGELOG 2026-09-23e`). When an item
closes, write its result entry in the changelog and delete it here.

**Recently run:** the bare Sonnet 5.5 control arm (CHANGELOG 2026-09-30e): 31/32 in 2 min for $0.33, tying bare Opus 5 on the rubric; Ron: "Opus was ready to deploy, Sonnet did a great MVP". Before that, mix1, the model-mix team arm (CHANGELOG 2026-09-29b–c): 0 value defects, the reviewer found a cross-frame bug, $31.42. Before that, the meeting-planner pair (CHANGELOG 2026-09-28f–g), on the post-consolidation defaults. Before that, the consolidation (CHANGELOG 2026-09-28e): `team` is now `execute`'s default ADW, `tdd` is the frozen control (`just adw control`), and six rosters are in `archive/factory/`. Before that, the amortization pair and the rerun (CHANGELOG 2026-09-28a–d). amort2 (team) was exact, including a half-cent tie that the control missed. Gate E now asserts that account credit covers every open run (2026-09-28c). Before that: team1/team2 on the music brief (2026-09-26d/g).

**Recently closed:** the edge-class gate, abandoned after Phase 1 (CHANGELOG 2026-09-28h, 2026-09-29a).
Before that, the N=3 replicate set, closed at 2 valid runs by decision (CHANGELOG
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

## 3. rmix1 JUDGED (CHANGELOG 2026-09-30c) — choose the next arm; torn down, billed $5.94

**rmix1 result:** P4 missed narrowly on 3 classes. The DST span recurred (mtg1's class, 271/29,393, both
directions). A reference column lands in the spring gap. London shows `UTC+0` in winter in a real browser (V13,
passed in bun). **P7 met strongly:** 6 blockers across 3 reviews, all outside the key, 5 fixed. Not accepted
(revisions exhausted). Billed $5.94 (Opus reviewer 83%). **Reading:** the Opus reviewer seat finds real defects the key cannot see,
but it does not close time-arithmetic edge classes on its own. mix1's clean DST-span result came from its
engine design, not a review catch. Torn down 2026-09-30.

**Harness levers it surfaced — three DONE 2026-09-30d (not yet synced to greenfield):**
- DONE: heading guards in `spec_frozen` / `amendments_ruled` / `values_swept` (calibrated 5/5).
- DONE: the charter names the committed spec and the `diff <(git show HEAD:specs/…)` command.
- DONE, with narrowed scope: `render_smoke --eval` for real-browser value reads, plus the reviewer rule that
  user-visible values derived from `Intl` display names are a finding (Chrome 154 ≠ bundled Chromium 153 ≠ bun).
- OPEN: `sbx run cmd` still mangles `|` inside a quoted regex (the known escaping trap; it cost a watcher here).

### Earlier: the rmix1 choice (2026-09-30)

**Chosen 2026-09-30:** candidate 2 below. Flash planner and builder, `claude-opus-5.5` reviewer, roster
`sssf.team-rev.config.yaml`, $40 key limit, N=1. Next steps: Ron approves the draft → `just target sync greenfield
--push` (the diff must be the 2026-09-30 refresh plus the new roster) → record the pin in the approval commit →
mount. mix2 and the oracle lever stay open as candidates 1 and 3.

### mix1 recap (CHANGELOG 2026-09-29c)

**mix1 is done and torn down.** Opus planner and reviewer, flash builder, on the meeting-planner brief:
- **0 value defects in 2,177,633 oracle checks**, including 16,796 meetings that span a DST transition (the class
  mtg1 shipped). The engine reads the wall clock at the meeting's end instant, so the class never arises.
- **The Opus reviewer found the defect the run would otherwise have shipped:** clicking a suggestion selected the
  wrong instant in 6/30 viewer zones (a UTC-day ranking window vs the viewer's local-day grid). It was found in a
  real browser with zones the key never named. The builder closed it in one revision and wrote it into the key
  (A5, V152–V156).
- **Recorded gap:** night shifts. The spec fixes "awake 07:00–22:00", so a 22:00–06:00 worker is always `asleep`
  (mtg1 handled wrapping). It's a spec-level policy, not a code bug.
- **Billed $31.417** (mtg1: $1.807): the reviewer $18.55, the planner $12.39 including its Opus subagent, the
  flash seats $0.48. The app is in the private repo `ronpwood/mix1-meeting-planner` for Ron's code review.

**Candidates for the next run:**
1. **mix2, the inverse** (Ron, 2026-09-29): flash planner and reviewer, Opus builder, same brief. It completes the
   grid; the hypothesis is that Opus's ambition carries across roles. Now it can be pre-registered with mix1's
   numbers:
   - Predict builder amendments ≥ 5 (mix1's builder filed 3; mtg1's filed 3), and new `V` rows by amendment
     ≥ 30% of the key.
   - Record whether the flash reviewer rejects any Opus amendment.
   - Budget: the builder is the biggest token consumer (mix1: 14.1M cached / 115k output over build + revise),
     so plan on $30–50.
2. **Reviewer-only mix — CHOSEN as rmix1 (2026-09-30b):** flash planner and builder, Opus reviewer. mix1 suggests the reviewer seat is where the
   value was found (the Auckland bug), at 59% of the cost. This isolates that seat for about $19.
3. **The oracle lever on the flash roster:** tell the (glm) reviewer to write its own rule implementation and to
   probe zones the key doesn't name. That's the cheapest test of whether mix1's reviewer *behaviour* transfers
   without the model.

**Still open, not blocking:**
- Unsatisfiable-test detection. It arose again unprompted (A3, V93) and the team handled it.
- `sbx manage traces` misses the planner's subagent sessions (`~/.pi/agent/sessions/subagents/`). Add that path.
- Night shifts: whether any brief's key should name "a member whose hours wrap midnight".
- A replicate of any pair. Everything here is N=1.

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


# CURRENT STATE — DeepSeek V4.1 is the default; Opus 5.5 in the frontier seats; no live roster uses 0731

**Read this before touching a roster or the model registry.** The reasoning behind the partial
rollout is in CHANGELOG "2026-09-20 → 2026-09-23 — why the v4.1 rollout stopped at the default
roster". The 0731 rosters were archived on 2026-09-28 (CHANGELOG 2026-09-28e), not promoted.
A restored one (`git mv` back from `archive/factory/rosters/`) still runs on 0731.

### Registered globally; every live roster that uses DeepSeek uses v4.1

`sandbox_mount/guest/models.json.tmpl` carries **both** flash models:

| id | input | $/M in/out |
|---|---|---|
| `deepseek/deepseek-v4-flash-0731` | `["text"]` | 0.14 / 0.28 *(registry; live published 0.01/1.28 on 2026-09-30 — see drift below)* |
| `deepseek/deepseek-v4.1-flash` | **`["text","image"]`** | 0.15 / 0.60 *(registry; live published 0.02/0.40 on 2026-09-30 — see drift below)* |

| roster | defaults.model | seats that differ |
|---|---|---|
| **`sssf.config.yaml` (default / control)** | **`deepseek-v4.1-flash`** (since 2026-09-20, pushed to greenfield `601d880`) | planner `gemini-3.8-flash`, reviewer `glm-5.3`, documenter `gpt-6-luna` |
| `sssf.team.config.yaml` (the team arm, `execute`'s default ADW) | `deepseek-v4.1-flash` | same seats as the default, team prompts |
| `sssf.team-mix.config.yaml` (mix1) | `deepseek-v4.1-flash` | planner + reviewer `claude-opus-5.5` (mix1 itself ran `claude-opus-5`), documenter `gpt-6-luna` |
| `sssf.team-rev.config.yaml` (rmix1, judged 2026-09-30c) | `deepseek-v4.1-flash` | reviewer `claude-opus-5.5` only; otherwise the team roster |
| `sssf.frontier` | `claude-opus-5.5` | builder + documenter `kimi-k3`, scout `gpt-6-sol` |
| `sssf.gemniflash` | `gemini-3.8-flash` | none |

Model refresh 2026-09-30 (CHANGELOG 2026-09-30): `claude-opus-5` → `claude-opus-5.5`, `gpt-5.6-luna` →
`gpt-6-luna`, `gpt-5.6-sol` → `gpt-6-sol`; every swapped-out id stays registered. `claude-sonnet-5.5` and
`gpt-6.1-sol` are registered only. Host `~/.pi/agent/models.json` needs its own entry for any model used on the
host — pi's built-in openrouter entry for opus-5.5 returns 404.

### Do NOT "tidy" these

- **`0731` stays registered** although no live roster uses it. Setup gate D pings it by name
  (`setup.just:319`), and archived rosters must stay restorable. It stays even after any promotion — a swap must be
  revertible without re-provisioning. Same rule that kept `glm-5.2` and
  `gemini-3.6-flash` on 2026-09-15.
- **The `input` fields differ on purpose.** `0731` is genuinely text-only; v4.1
  is genuinely multimodal. Making them match would re-introduce the bug that
  blinded the 2026-09-20 treatment arm.
- **Registry rate drift is known and deliberate**, not stale: `check_rates.py`
  flags `0731`, `v4.1-flash` and `glm-5.2` (2026-09-30; `kimi-k3` and `glm-5.3` now
  match). OpenRouter's *published* deepseek price has not matched what it bills (0731
  estimates ran ~1.95x high on 2026-09-07), and the published prices moved again on
  2026-09-30, so the keep-catalog-vs-use-measured decision from 2026-09-07g is still
  open and now covers v4.1 too. **Do not `--fix` it casually** — it changes what every
  historical run's cost means. Reconcile from generation ids after a run.
