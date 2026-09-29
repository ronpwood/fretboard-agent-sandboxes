---
plan: edge-class-gate
created: 2026-09-28T19:37:19-07:00
modified:
  - 2026-09-28T19:37:19-07:00
  - 2026-09-28T19:52:34-07:00
commits:
  - 3b9e3b8
agents:
  - claude-opus-5-5
sessions:
  - 9d28666e-26a9-464e-b844-ceed596f84d8
back_refs:
  - specs/team-ownership-prompts.md — the team spec form, `spec_form`, and the amendment channel this plan extends
  - specs/team-default-consolidation.md — the frozen-control contract this plan must keep
forward_refs: []
status: building
---

# Plan: The edge-class gate: the answer key must cover every edge dimension, or say why not

## Purpose

This makes the team planner's answer key cover the **edges of its own domain** by construction, not
by luck. A new frozen spec section, `## Edge classes`, lists a fixed, domain-agnostic set of **edge
dimensions**. For each dimension the planner either cites the `V` rows that pin it in this domain,
or writes `n/a — <why>`. `spec_form` enforces the shape. The reviewer checks every `n/a` against what
the delivered app actually accepts, and an `n/a` the app contradicts is a blocking finding. Only the
team arm changes. The `tdd` control stays byte-identical.

## Problem

**"The key only protects the edges it contains" has now been measured three times in a row:**

| run | the key pinned | the defect shipped at | the dimension it missed |
|---|---|---|---|
| amort2 (2026-09-28d) | a half-cent tie, **by luck** | amort1c (no key) missed the same tie | rounding / ties |
| mtg1 (2026-09-28g) | the DST transition **instants** (V57/V58, exact) | a meeting **spanning** the transition (16 instances) | span across a discontinuity |
| mtg1c (2026-09-28g) | (no key) | wrapped working hours 22:00–06:00, never "core" | wrap-around / inverted range |

The music runs had the same shape (team1: "F major with A# instead of Bb", a variant sharing a
lookup key).

The planner prompt already asks for "the cases where a lookup could drop a distinguishing attribute".
That instruction is **domain-flavoured** (keys, chords, notes), and it names one dimension. Nothing
asks the planner to walk the *other* dimensions, and no gate notices when one is absent. P5 in the
last two pre-registrations was a host-side, after-the-fact check. This plan moves it in-loop, as an
**enumerated** obligation. (Memory `gates-catch-known-classes`: every in-loop catch so far was an
enumerated check, and the asserted ones missed.)

## Solution

**Decisions:**

1. **A fixed taxonomy of eight edge dimensions, written in no domain's vocabulary.** It is derived
   from every defect the corpus shipped, so each past miss maps to exactly one dimension (see Notes
   for the calibration table):

   | class id | the dimension | an example from a past brief (for the prompt: illustrations, never answers) |
   |---|---|---|
   | `boundary` | a value exactly **at** a limit: inclusive or exclusive? | a slot starting exactly at the end of the work day |
   | `span` | an input whose **extent crosses** a limit or discontinuity | a meeting that runs across a clock change |
   | `wrap` | a range that **wraps** (cyclic, or start > end) | working hours 22:00–06:00; an interval past 12 on a circle |
   | `discontinuity` | an input that **does not exist or occurs twice** | a wall time skipped or repeated by a clock change |
   | `rounding` | **ties, precision, rounding** direction and place | a half-cent tie in a schedule row |
   | `degenerate` | **zero, empty, one, extreme** | a zero rate; an empty team; a single payment |
   | `shared-key` | **variants that share a lookup key** | A# vs Bb; +5:30 vs +5:45 |
   | `shown` | where the value is **displayed**, not just computed | the spelled note on a fret label; a date badge |

2. **A new frozen section, `## Edge classes`, placed right after `## Expected values`.** It is a table
   with exactly one row per class id:

   ```markdown
   | class | here | rows |
   |---|---|---|
   | span | a 90-minute meeting across the spring-forward jump in New York | V74, V75 |
   | discontinuity | — | n/a — there is no wall-time input; every slot is a UTC instant |
   ```

   It is frozen like `## Expected values`. Rows added later arrive by amendment, as now.

3. **`spec_form` gains one check, `edge classes`.** All eight class ids are present. Each `rows` cell
   either cites at least one **existing** `V` id, or starts with `n/a —` followed by a non-empty reason.
   Unknown class ids and duplicates fail. This checks shape, never content. Content belongs to the
   reviewer, which matches the gates' stated split (`gates.py:301`).

4. **The reviewer rules on every `n/a`.** A new bullet in the reviewer prompt says: check each
   `n/a` against what the delivered app accepts and shows. The canonical example is "n/a, no wrapped
   ranges" when the hours inputs accept 22:00–06:00. An `n/a` the app contradicts is a blocking
   finding that names the rows to propose, through the existing "key is incomplete" channel. It
   needs no new envelope field (see Notes: why not a schema change).

5. **The team arm changes in place; `git tag team-v1` marks the old one.** Team is the default. The
   control (`tdd` + `sssf.config.yaml` + `prompt_engineering/`) is the frozen comparison. `team-v1` keeps
   the mtg1/amort2/team2 arm reproducible (`git worktree add … team-v1`). The contract this plan
   verifies: **every control input is byte-identical**, and the shared modules it edits (`gates.py`,
   `team_spec.py`) change only in functions the control never calls (`adw_tdd_sdlc.py` calls no spec
   gate; see Phase 4).

## Relevant Files

### Existing — modified
- `adws/adw_modules/`
  - `team_spec.py` — `EDGE_CLASSES` tuple (the eight ids), `"Edge classes"` added to `FROZEN` and to
    `SECTIONS` after `"Expected values"`, `TeamSpec.edge_rows` parsed from the section's table, and the
    docstring changed from "eight-section" to "nine-section"
  - `gates.py` — `spec_form` gains the `edge classes` check; the header comment at 301 changes to "nine-section"
- `adws/`
  - `adw_team_sdlc.py` — docstring only: "nine-section form", with `spec_form` described as covering edge classes
- `adws/adw_data/prompt_engineering_team/`
  - `team.md` — the section table gains the `## Edge classes` row (frozen). Line 24 goes from "eight
    sections" to "nine sections", and the `spec_form` line (103) mentions edge classes
  - `planner/system.md` — "nine `##` headings"; a new item 4, `## Edge classes`, with the eight
    dimensions, the table form, the `n/a — <why>` rule, and the instruction that an `n/a` must say
    why the delivered app can **never** receive such an input. Later items are renumbered
  - `planner/user.md` — "nine-section form" (line 21)
  - `reviewer/system.md` — one new bullet under "Working with the spec": rule on every `n/a` in
    `## Edge classes` against the delivered app
- `NEXTSTEPS.md`, `CHANGELOG.md` — close-out

### Existing — deleted
Nothing.

### New
- `adws/adw_data/fixtures/team_spec/`
  - `good.md` — **modified, not new**: gains a valid `## Edge classes` table (some rows cite `V`s,
    some are `n/a — …`), so the existing "good passes" validation keeps meaning what it says
  - `edges_missing.md` — `good.md` without the `span` row → `spec_form` fails on `edge classes`
  - `edges_bad_ref.md` — a `rows` cell cites `V99`, which does not exist → fails
  - `edges_na_bare.md` — a `rows` cell reads `n/a` with no reason → fails
- `specs/`
  - `edge-class-calibration.md` — the corpus mapping (Phase 1): every shipped value defect since
    team1, the dimension it falls in, and whether its spec had a row in that dimension

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

| Phase | Purpose | Done when | Status |
|---|---|---|---|
| [1. Calibrate the taxonomy on the corpus](#phase-1-calibrate-the-taxonomy-on-the-corpus) | Prove the eight classes cover every past miss before building anything | every shipped defect maps to exactly one class, and every class has at least one real instance | `fail` |
| [2. Parser and gate](#phase-2-parser-and-gate) | `## Edge classes` parsed, frozen, and shape-checked | fixtures pass/fail as intended; the old fixtures still behave | `idle` |
| [3. Prompts](#phase-3-prompts) | Planner writes the section; reviewer rules on `n/a`s | the prompts render; the section names match `team_spec` exactly | `idle` |
| [4. Prove the control untouched](#phase-4-prove-the-control-untouched) | Byte-identity of every control input; changed shared functions unreachable from `tdd` | diff empty; grep shows no call | `idle` |
| [5. Draft the validation run](#phase-5-draft-the-validation-run) | Pre-registration drafted for Ron's approval, not mounted | draft entry exists, marked DRAFT | `idle` |

### Phase 1: Calibrate the taxonomy on the corpus

Memory `gates-catch-known-classes`: calibrate on the corpus first. The taxonomy is the whole lever.
If a past miss fits no class, or two, fix the taxonomy now, not after a run.

#### 1. Build the mapping

- [x] Write `specs/edge-class-calibration.md`: one row per shipped value defect in CHANGELOG since
  2026-09-19. Include at least team1 A#/Bb, the harn5/harn7 value defects, the amort1c half-cent tie,
  the mtg1 DST straddle, the mtg1c wrapped hours and end-inclusive boundary, and team1's missing
  dimension diagrams (these may classify as not-a-value-defect; record that). Columns: run, defect,
  class id, "did the key have a row in this class?", and the CHANGELOG tag.
- [x] For each team spec in the corpus (team1, team2, amort1, amort2, mtg1: the specs under
  `.sandbox/runs/*-artifacts/specs/` or `refs/sandbox/*`), fill in by hand which of the eight classes
  its `V` table covered. This is the "what would the gate have demanded" column.

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `fail` Every defect row in `edge-class-calibration.md` names exactly one class id from the eight. None is
  unmapped, and none is double-mapped. If one does not fit, amend the taxonomy (in this plan's Amendments)
  before continuing. — 6 of 31 fit no class (whole-range defects); 8 fit two (resolved by a proposed mechanism tie-break). See the calibration record.
- [x] Every class id has at least one real instance, either a defect or a pinned row, in the corpus. A
  class with no instance is a guess; record it in Notes as unvalidated rather than dropping it. (`discontinuity` has no shipped instance; marked unvalidated.)
- [ ] `fail` For mtg1, the table shows `span` = **no row** and the `boundary`/`shared-key`/`shown` classes =
  rows. This is the case the gate exists for. — FALSE: mtg1 had real `span` rows (V35/V37/V38, across work and sleep edges), so per-class coverage would have PASSED it; the missing span was across the DST limit specifically.

### Phase 2: Parser and gate

#### 1. `team_spec.py`

- [ ] `EDGE_CLASSES = ("boundary", "span", "wrap", "discontinuity", "rounding", "degenerate", "shared-key", "shown")`.
- [ ] `FROZEN = ("What we're solving for", "Requirements", "Expected values", "Edge classes")`. `SECTIONS`
  puts `"Edge classes"` directly after `"Expected values"`.
- [ ] `TeamSpec.edge_rows: dict[str, str]`, the class id → the `rows` cell, parsed from the section's
  table (skip the header and separator rows; lower-case and strip the class cell). Duplicates are kept
  detectable: parse into a list first, and let the gate count them.

#### 2. `gates.spec_form`

- [ ] A new `report.check("edge classes", …)` after `traps`. It passes when every id in `EDGE_CLASSES`
  appears exactly once, no unknown id appears, and each cell either names ≥1 `V` id in `spec.value_ids`
  or matches `^n/a\s*[—-]\s*\S`.
- [ ] The failure message is written for the planner, like the existing ones. It names the missing,
  unknown, duplicated, bad-reference and bare-`n/a` rows, and it restates the form:
  `| span | <what it is here> | V12, V40 |` or `| span | — | n/a — <why the app can never receive it> |`.

#### 3. Fixtures

- [ ] Extend `good.md` with a valid `## Edge classes`. Write `edges_missing.md`, `edges_bad_ref.md` and
  `edges_na_bare.md`, each exactly one defect away from `good.md`.

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] A scratch script (session scratchpad) runs `spec_form` over all seven fixtures with a stub `run` whose
  `context_handoff_dir` holds the fixture as `plan.md`. It prints pass for `good.md`; fail on `edge classes`
  for each `edges_*.md`; fail for `no_values.md` as before. It **exits non-zero if any expectation is wrong**.
- [ ] `spec_frozen` on a copy of `good.md` whose `## Edge classes` was edited in place → fails on
  `## Edge classes`. This proves the section is frozen.
- [ ] `effective_value_ids` on `good.md` still returns `['V1','V2','V3','V4','V5']`, which proves the
  existing parse is unchanged.

### Phase 3: Prompts

#### 1. Planner

- [ ] `planner/system.md`: "nine `##` headings". The new item 4, `## Edge classes`, carries the dimension
  table from Solution §1 with the **illustration column labelled as examples from other domains**, the
  row form, and the `n/a` rule: *an `n/a` must say why the delivered app can never receive such an
  input, not that it seems unlikely.* The sentence that ties it to `## Traps` says: a trap in a class
  cites the same rows. Later items are renumbered. `planner/user.md` line 21 says "nine-section".

#### 2. Reviewer and team

- [ ] `reviewer/system.md`, under "Working with the spec", gets one bullet: **Rule on every `n/a` in
  `## Edge classes` against the delivered app.** If the app accepts or shows the input the `n/a` says
  cannot occur (the hours form accepts 22:00–06:00; a date picker reaches a clock-change day), that is
  a blocking finding naming the rows the builder should propose. It also checks that each cited row
  really exercises its class (a `span` row must cross the limit, not sit beside it).
- [ ] `team.md`: the section table gains the frozen `## Edge classes` row; "nine sections"; the
  `spec_form` line mentions edge classes. The `adw_team_sdlc.py` and `gates.py:301` comments say "nine".

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `grep -c '## Edge classes' adws/adw_data/prompt_engineering_team/planner/system.md adws/adw_data/prompt_engineering_team/team.md` — both ≥1, and the
  heading text equals the `team_spec.SECTIONS` entry, checked by a one-line `uv run python -c` that
  asserts `"Edge classes" in team_spec.SECTIONS` and greps the prompt for `## Edge classes`
- [ ] `grep -rn 'eight' adws/adw_data/prompt_engineering_team adws/adw_modules/team_spec.py adws/adw_team_sdlc.py` returns no stale
  "eight sections/headings/section form" mention
- [ ] `uv run adws/adw_team_sdlc.py --help` exits 0, and `agents.validate` on `sssf.team.config.yaml`
  passes (the roster's prompt files still resolve)

### Phase 4: Prove the control untouched

#### 1. Byte identity and reachability

- [ ] Record `BASE` = this plan's first commit parent (`3b9e3b8`).

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `git diff --stat 3b9e3b8 -- adws/adw_tdd_sdlc.py adws/adw_sssf_config/sssf.config.yaml adws/adw_data/prompt_engineering adws/adw_data/harness_engineering sandbox_mount/guest/models.json.tmpl` prints nothing. These are the control's own inputs.
- [ ] `git diff 3b9e3b8 -- adws/adw_modules/ | grep '^@@'` shows hunks only inside `spec_form`, the
  gates header comment, and `team_spec.py`. `grep -nE 'spec_form|team_spec|Edge classes' adws/adw_tdd_sdlc.py`
  prints nothing: the control never reaches the changed code.
- [ ] `git tag team-v1 3b9e3b8` exists, and `git show team-v1:adws/adw_modules/team_spec.py | grep -c 'Edge classes'` = 0.

### Phase 5: Draft the validation run

A spec change is proven only by a run. This phase **drafts** the pre-registration; mounting needs
Ron's approval, as every run has.

#### 1. Draft

- [ ] Append a CHANGELOG entry marked **DRAFT, awaiting approval**: team-v2 (this plan) and the control
  on the **meeting-planner brief again** (see Notes: why the same brief first). Predictions:
  - **P5′ (the lever):** the spec_form-passing key has a `span` row that really crosses a transition,
    and a `wrap` row, or an `n/a` the reviewer rules on.
  - **P4:** the mtg1 straddle class is absent from team-v2's delivered app (the same sweep, `sweep_mtg1.ts`
    adapted).
  - **P7 (new, the gate's cost):** planner time, and whether `spec_form` needed a correction for edge
    classes. Recorded, and a miss is a result.
  - The same GRID and oracle. The control is P4-only, as before.

#### Validation — Phase 5

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `grep -n 'DRAFT, awaiting' CHANGELOG.md` shows the entry. `git log -1 --stat` shows no VM or
  run-record activity (nothing was mounted).

## Global Validation

- [ ] The Phase 2 fixture script exits 0
- [ ] The Phase 4 byte-identity diff is empty, and the reachability grep is empty
- [ ] `git status` is clean after the close-out commit; NEXTSTEPS item 3 names this spec as built and the run as drafted

## Notes

**Why a taxonomy and not a per-brief list of edge classes.** A host-written list per brief would name
answers, and the brief's rule is that it names none (`greenfield.md` constraint block). A planner-written
list with no taxonomy is what we have today: the planner lists the edges it thinks of, and "span"
never came to mind. The fixed dimensions are a *checklist of questions*, domain-free, and the planner
answers each one for its domain. That is the difference between "cover the edges" (asserted, missed
three times) and "answer these eight" (enumerated).

**Why `n/a` is allowed, and why the reviewer rules on it.** Some classes really don't apply: mtg1 had
no wall-time input, so `discontinuity` was genuinely unreachable. Forcing a row there would produce
filler rows that pin nothing. But `n/a` is also the obvious escape hatch. mtg1c's wrapped hours would
have been a plausible "n/a — hours are a normal day" at plan time, and false once the hours form
shipped. So the planner's `n/a` is a **claim about reachability**, and the reviewer is the seat that can
test reachability against the delivered app. That is the same pattern as amendments: one seat
proposes, another rules.

**Why not a schema change (an `edge_checks` field on ReviewOutput).** An enumerated reviewer output
would be stronger than a prompt bullet. But `data_types.py` is shared with the control, and its
schemas may render into prompts. Changing it risks the control's byte-identity for a second-order
gain. Deferred. If the validation run shows reviewers skipping the `n/a` audit, that is the evidence
to pay for it.

**Why the same brief first, then a fresh one.** The meeting-planner brief has a built oracle, a fixed
GRID, and a measured baseline (mtg1: `span` missing → 16 straddle instances). The same brief gives the
cleanest before/after on exactly the lever. **The confound:** the taxonomy was designed after seeing
that brief's miss, so success there is necessary, not sufficient. The claim "the lever generalises"
needs a fourth brief that meets the four brief-selection criteria (memory `brief-selection-criteria`).
Recorded as the next item, not built here.

**Risk: the planner spends its time on the table and not on the rows.** Eight classes × a real row each
is work. P7 records planner time. mtg1's planner took 457s against the control's 280s, and a large jump
is a cost worth knowing.

**Risk: gaming by shallow rows.** A `span` row that sits *beside* a transition rather than across it passes
the gate. The reviewer bullet asks for exactly this check. The validation run's P5′ judges it host-side.

**Deferred, recorded:**
- The unsatisfiable-test detector (NEXTSTEPS): mtg1 showed the team handles a wrong key row by
  amendment, which lowers its priority.
- The `−1d` overflow (a text-overflow render check).
- `ReviewOutput.edge_checks` (see above).
- A fourth brief.

**Open decision for Ron (defaulted, not blocking):** in-place change with a `team-v1` tag (the default
here), or a sibling `team2` arm (new ADW + roster + prompt dir). The sibling keeps mtg1's arm runnable
without a worktree, at the cost of a third arm to maintain. The in-place change matches the
consolidation decision that team is *the* arm.

## Amendments

<details>
<summary>2026-09-28T19:52:34-07:00 — PAUSED by Ron after Phase 1: the calibration failed the approved design; possible overdesign</summary>

Phase 1 ran; nothing in Phases 2–5 was built. `specs/edge-class-calibration.md` holds the evidence:
- 6 of 31 shipped defects are whole-range, not edge defects: out of any edge gate's reach.
- 8 fit two classes. A "classify by mechanism" tie-break resolves all 8. This is proposed, not adopted.
- **Decisive:** the approved per-class design would have PASSED mtg1. Its key had spans across work
  and sleep edges, not across DST. The candidate fix is per-limit coverage (boundary + span rows per
  named limit).

Ron's read (2026-09-28): "maybe we've got into a bit of an overdesign situation"; the coordination
gains already hold regardless of the team mix, and model mix may be the more interesting lever. The
open question for the next session is to rework as per-limit, shelve, or replace it with a lighter
lever (e.g. the reviewer writes an independent check of the core engine, the thing that actually
caught both mtg1 defects). Status stays `building` because of the open `fail` boxes. Set it to
`abandoned` only by Ron's call.
</details>
