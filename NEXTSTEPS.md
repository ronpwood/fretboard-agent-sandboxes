# Next Steps

The open queue only, ordered by value. Findings, measurements and closed items are in
[CHANGELOG.md](CHANGELOG.md), cited by date tag (e.g. `CHANGELOG 2026-09-23e`). When an item
closes, write its result entry in the changelog and delete it here.

**Recently built, untested:** the team-owned prompts arm (CHANGELOG 2026-09-26a), which answers item 2 by design.

**Recently closed:** the N=3 replicate set, closed at 2 valid runs by decision (CHANGELOG
2026-09-24f). The render smoke's D now re-finds hidden controls (CHANGELOG 2026-09-24a). Earlier:
harn2/harn3 and the harness-signals spec (CHANGELOG 2026-09-23d–i).

Item numbers in parentheses, such as "4(5)", refer to the queue in CHANGELOG 2026-09-20b.

## 1. Harness robustness: the fan-out blocker (CHANGELOG 2026-09-24f, finding 3)

4 of 6 mounts in the last set were ended by causes outside the model. Both fixes below are
model-agnostic, and both come before any fan-out:

- **A bash timeout at the tool level**, so a never-exiting command (an uncleared `setInterval`, a
  foreground server) returns an *error the agent sees*. Today the 900 s stall watchdog
  (`agent_pi.py`, `PI_STALL_SECONDS`) kills the whole run, and the agent never learns why. harn4 retried
  the same hang. Keep the watchdog as the backstop.
- **A phase-level retry on `provider_error`.** The classification already exists (`agents.py`). Retry
  the phase a bounded number of times before failing the run. That covers intermittent upstream faults
  for any model (Gemini thought-signature 400s, false-positive content filters). **Not** per-model
  provider pinning (rejected in 2026-09-24f).

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

## 3. A small re-run to test 1 and 2, before any fan-out: DRAFT pre-registration

One or two runs. Pre-register them before mounting, and freeze this section when they are mounted.

- **Arm:** `just adw team <brief>`, which runs `adw_team_sdlc.py` on `sssf.team.config.yaml`, on
  greenfield at `515efca` or later.
- **Control:** the existing harn2–harn7 record (default roster, `adw_tdd_sdlc.py`), so no new
  control run.
- **Brief:** the same brief as the harn set, so the defect classes (lossy-key, CAGED windows) are
  comparable.
- **Predictions:**
  - **P1:** every review has a `value_checks` entry for every effective `V`, and a non-empty
    `value_sweep.*` artifact. The `values_swept` gate makes this near-mechanical, so a miss means
    the gate or the prompt is broken, not the model.
  - **P2:** at least one amendment is proposed and ruled on in the run. If none is, the licence to
    disagree did not take.
  - **P3:** `spec_frozen` fires at most once per run, and is resolved in-session.
  - **P4 (primary):** no reachable value defect ships in a `V`-covered area. It is **judged by our
    own first-principles sweep, not the run's**, starting from `sweep_harn5.ts` and `sweep_harn7.ts`.
  - **Secondary, exploratory:** does the planner's `V` table cover the CAGED and minor/major cases at
    all? A defect in an area no `V` covers counts against the planner's answer key, not against P4.
- **Exclusions:** a run lost to a non-model cause is excluded, as in 2026-09-24b's P2. Item 1 should
  land first, because the planner is still `gemini-3.8-flash`, the source of the thought-signature
  400s.

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
