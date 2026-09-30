---
plan: bare-sonnet-55-control-arm-preregistration
created: 2026-09-30T13:40:00-07:00
modified:
  - 2026-09-30T13:40:00-07:00
commits: []
agents:
  - claude-opus-5-5
back_refs:
  - specs/bare-claude-control-arm-preregistration.md — the Opus 5 arm this repeats; every rule there holds unless overridden below
  - specs/bare-claude-control-arm-results.md — the 31/32 baseline and the 32-point procedure
  - NEXTSTEPS.md — item 1 (2026-09-30)
forward_refs: []
status: open
---

# Bare Sonnet 5.5 control arm — pre-registration

**HOST-ONLY.** Written before the arm runs. After execution begins, edit only to record whether it was followed or departed from.

## The question

How far has the Sonnet line moved against the bare Opus 5 arm (`bare-cc-20260919-ba3919`: **31/32, 37 min, one turn, $4.28**)? The only intended change is the model.

## The arm: identical except as declared

| | Opus 5 arm (2026-09-19) | this arm |
|---|---|---|
| target / pin | `greenfield` @ `59b1738` | **same**: `lifecycle create` → `fill <id> 59b1738` → `setup` → `observe` |
| prompt | `prompts/greenfield.md` verbatim | **same bytes** (the pin guarantees it) |
| kickoff | one `just sbx run agent` turn, no equip line, no preamble | **same** |
| model | unflagged default → `claude-opus-5` | **`--model claude-sonnet-5-5`** via the new optional `MODEL` arg on `sbx run agent`. Confirm that Sonnet served by reading the `message.model` fields in the on-VM transcript |
| Claude Code | 2.1.272 | **DEVIATION:** the VM image's current version, recorded from the run record. Harness drift can't be separated from model drift here |
| gateway | exe.dev `llm.int.exe.xyz` | same; probed with a one-line Sonnet call before the arm |

Pinning to `59b1738` also means the VM carries the *old* `render_smoke.py` (no `--eval`), so the stop rule's temptation is the same one Opus faced.

## Outcome measures (same as before)

0. **"Would you use it?"**: Ron's judgment, recorded **before** any scored item.
1. **Part A /20 + Part B /12**, the frozen rubric (`specs/greenfield-cof-experiment.md`). Every gate is re-run rather than taken on trust: tests, oxlint, the factory's typecheck argv, the console-error pass.
2. **Carried from rmix1:** a real-browser value read (not bun alone), and no user-visible label derived from `Intl` display names.
3. **T1 / T2** as before: does the arm assert a silent channel, and does C major emit a C-major pitch set.
4. **Process, recorded and never scored:** wall clock, tokens (transcript), tool calls, browser use, commits, cost as a Shelley balance delta.

## Predictions

- **P1: competitive, not dominant.** A+B ≥ 28/32. The structural red-suite point is lost again, since one turn can't run a TDD chain. I don't predict it beats 31.
- **P2: it reaches for runtime truth unprompted.** It uses a browser or HTTP against the running app at least once. Opus did.
- **P3: T1 passes and T2 passes.** It asserts the audio/MIDI channel in its own tests, and C major is correct. This is a weaker bet than P2, because Opus's assertion may have been a sampled trait of that one run.
- **P4: no commit.** The tree is left dirty and gets `manage snapshot` host-side, as before.
- **P5: faster than 37 min wall clock.** Recorded, not scored.

## Stop rule (unchanged)

The arm is **void as a "no shared tooling" control** if it invokes the sssf skill or runs anything under `adws/`. The Opus arm tripped this rule (`render_smoke.py`), so a void here is **comparable to its reading**, not a failure. Checked by grepping the transcript for `SKILL.md`, `Skill(`, `adws/` and `just adw`.

## Cost precondition

Nothing else may spend Shelley in the window. Read the balance with `ssh exe.dev billing credits` immediately before and after the turn. The gateway probe runs before the "before" reading. The allowance resets at 00:00 Oct 1, so the run must finish before then or the delta is void.

## Before teardown

Pull the Claude Code transcript from the VM's `~/.claude/projects/`. Then snapshot, harvest, shot.
