---
plan: bare-claude-control-arm-preregistration
created: 2026-09-19T00:00:00-07:00
modified:
  - 2026-09-19T00:00:00-07:00
commits: []
agents:
  - claude-opus-5[1m]
sessions:
  - 609c01b7-75ec-4c74-af00-45fa9d061fea
back_refs:
  - specs/next-session-memo.md — §3 named this the highest-value experiment and said run it FIRST
  - specs/greenfield-cof-experiment.md — the hidden rubric (part A frozen, part B added 2026-09-18)
  - specs/greenfield-fanout-3-results.md — the six factory arms this controls against
  - CHANGELOG.md — 2026-09-18f, the solo arm and the chord bug
forward_refs: []
status: open
---

# Bare Claude Code control arm — pre-registration

**HOST-ONLY.** The rubric stays in `specs/greenfield-cof-experiment.md` and must never enter a VM
or a target's `prompts/`.

Written **before the arm was executed**. Not edited after execution begins except to record that it
was followed or departed from.

## The question

**Does the factory beat one generalist agent with tools?**

Every experiment so far has tuned *inside* the factory — rosters, chains, gates, loop counts. This
one questions the premise. One Claude Code session, the byte-identical greenfield prompt, no
factory, no phases, no gates, no reviewer, scored on the same rubric as the seven TDD arms.

It is the only experiment we have that can return "the chain is not earning its keep," and it needs
no measurement fix to be readable: *does the app work* is scoreable regardless of what produced it.

## The arm

| | |
|---|---|
| target | `greenfield` (clean room, fresh history — nothing to crib from) |
| pin | the last pushed sync, `59b1738`. `apps/`, `app.manifest.yaml` and `prompts/` are **byte-identical** to `af18f0d`, the solo arm's pin; the only delta is `adws/adw_modules/agent_pi.py`, a factory file this arm never touches |
| prompt | `prompts/greenfield.md`, verbatim, resolved inside the VM's checkout — the same bytes every greenfield arm since 2026-08-28 received |
| kickoff | `just sbx run agent <id> "<prompt>"` — **one turn**, no equip line, no skill preamble, no mention of the factory |
| harness | Claude Code on exe.dev's key-free gateway (`llm.int.exe.xyz`). Model recorded post-hoc from the on-VM transcript, not assumed |
| budget | no cap on the turn. The OpenRouter key is untouched by this lane, so `spend` will read ~$0; VM wall-clock is the real cost |

**One turn, not a conversation.** The memo's framing is "one generalist agent with tools, versus the
entire chain." A single `-p` turn is the purest form of that and keeps the prompt identical. If it
stops short of a finished app, that *is* the result — not a reason to nudge it. Any follow-up turn
would be a different, separately labelled condition.

## Outcome measure

Registered in advance, and **accept/reject is not available here** — there is no reviewer. That is
a feature: fan-out 3 showed the verdict runs opposite to delivered quality.

1. **Part A /20 and Part B /12**, the frozen rubric, same procedure as every greenfield arm:
   host-side judge, one arm at a time, rubric in context, arm code in the working dir; plus the
   interaction pass and `just sbx manage shot <id>` after `just sbx lifecycle refresh <id>`.
2. **Process metrics, recorded and never scored**: wall clock, tokens (from the transcript), tool
   errors, whether it committed anything, billed spend as a dated fact.

### Two pre-registered tie-breakers, reported separately and never folded into A or B

Part A is saturated — three fan-out 3 arms tied at 20/20 and at 12/12. A prediction against a
ceiling is not a prediction. So two binary measures, both drawn from the defect that actually
escaped every gate on 2026-09-18:

- **T1 — silent-channel assertion.** Does the arm assert any non-visual output (emitted
  frequencies/MIDI, timing, focus order) in its own tests? Binary.
- **T2 — silent-channel correctness.** Reproduce the arm's audio computation for a known chord.
  C major must emit `{60, 64, 67}`. The solo arm emitted `{60, 61, 62}` — a chromatic cluster —
  and it survived 41 tests, typecheck, lint, the render gate, a reviewer and a manual pass.
  Binary, mechanically checkable, no browser needed.

## Predictions

### P1 — the bare agent reaches for runtime truth; the factory arms never did

**Control: 0 of 7.** Across six fan-out 3 arms plus the solo, zero mentions of chromium,
playwright, puppeteer, jsdom or selenium in any seat. They wanted runtime truth and reconstructed
it by inference instead.

**Claim:** this session **will** obtain runtime truth directly at least once — a browser or headless
render, or booting the app and hitting it over HTTP — unprompted.

**Check:** grep the on-VM transcript for the tool calls actually issued.

**Why it matters:** the factory arms had `read/bash/edit/write/grep/find/ls` and nothing that could
*discover* that playwright exists. A Claude Code session has discovery tools and a different posture.
If the bare agent goes looking while six specialists did not, the agency gap is **harness and
tooling**, not the models. Falsified by a bare arm that also works blind — which would move the
cause to the prompt or to the greenfield brief's "no frameworks" line reading as a prohibition.

### P2 — delivered quality is competitive, not dominant

**Claim:** the bare arm scores **A ≥ 16 and A+B ≥ 24** — inside the factory arms' range (24–32),
not below it. I do **not** predict it beats the 32/32 arms.

The honest directional bet: the chain's value shows up in *thoroughness* (test coverage, edge
handling, the sheer amount built), and a single turn will deliver less surface. Where it should win
is coherence — one agent holding the whole design, versus six envelopes handing it between seats.

**Falsified by** A+B < 24, which would mean the chain buys real quality; **or** by A+B = 32 with
materially fewer tokens, which would be the strongest possible result against the factory.

### P3 — the deafness is general, not a factory artifact

**Claim:** **T1 fails** — the bare arm also ships no assertion on a silent channel.

If an unasserted output channel is where wrong answers ship regardless of who is building, the fix
is "assert the silent channels" (a property of the *brief and the tests*), not "fix the factory."
If the bare arm *does* assert audio unprompted, that is a point for the generalist and against the
chain, and it is the more interesting outcome.

T2 is recorded either way; it is a defect check, not a prediction.

### P4 — it will not commit

**Claim:** the session finishes with a dirty tree and no commit on `sbx/<run-id>`. The prompt says
"design it, build it, test it, and deliver it" and never says commit; the factory's commits come
from the *chain*, not the agents.

**Handling, decided in advance:** `just sbx manage snapshot <id> "bare control arm"` puts the dirty
tree on the run branch so harvest can carry it. This changes nothing about the arm — it is host-side
bookkeeping after the turn ends — and it keeps the prompt identical, which matters more.

## Stop rule — the one thing that voids this arm

**The VM's checkout contains `.claude/skills/sssf/`.** The clean room ships the factory skill, so a
Claude Code session started in that directory will see it in its available-skills list. Nothing in
the prompt points at it, and no equip line is sent — but the session *could* invoke it.

**If the session invokes the sssf skill or runs anything under `adws/`, this arm is void as a
control.** Record it, say so plainly, and re-run with the skill directory moved aside — a change to
the *mount*, declared in advance, rather than a change to the prompt.

I am not pre-emptively stripping it, because the mount is what every other arm got and an
unannounced difference is worse than a declared risk. Checked by grepping the transcript for
`SKILL.md`, `Skill(`, `adws/` and `just adw`.

## Watch-fors

- An arm building outside `apps/app/` — check `git status --porcelain` and the diff stat, not just
  that files exist.
- The transcript is the evidence for P1, P3 and the stop rule. Pull it **before teardown**:
  it lives under the VM's `~/.claude/` and dies with the box.
- `just sbx manage traces` targets the factory's `adws/adw_data/`, which this arm never writes.
  The Claude Code transcript must be pulled separately.
