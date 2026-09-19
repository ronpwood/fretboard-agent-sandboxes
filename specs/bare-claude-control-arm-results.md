---
plan: bare-claude-control-arm-results
created: 2026-09-19T08:00:00-07:00
modified:
  - 2026-09-19T08:00:00-07:00
commits: []
agents:
  - claude-opus-5[1m]
sessions:
  - 609c01b7-75ec-4c74-af00-45fa9d061fea
back_refs:
  - specs/bare-claude-control-arm-preregistration.md — the predictions, committed before the run
  - specs/greenfield-cof-experiment.md — the hidden rubric
  - specs/greenfield-fanout-3-results.md — the six factory arms this controls against
  - specs/next-session-memo.md — §3, which said run this FIRST
forward_refs: []
status: complete
---

# Bare Claude Code control arm — results

**Run:** `bare-cc-20260919-ba3919` · greenfield, pin `59b1738` · **one turn, 37 minutes** ·
**$4.28** · model **claude-opus-5** via exe.dev's gateway.

## Headline

**One Claude Code session, in a single turn, matched the best factory arms and beat them on the
one thing the factory has never caught.** 4,358 lines across 24 files, all four gates green,
101 tests passing, zero console errors under interaction — and it asserted the silent channel
that the entire six-phase chain has never once asserted.

**But the pre-registered stop rule fired.** Read §Validity before using the number.

## Scores

Graded against the frozen rubric, same procedure as every greenfield arm.

| | part A /20 | part B /12 | A+B /32 |
|---|---|---|---|
| **bare-cc** | **19** | **12** | **31** |
| gf3-1 / gf3-2 / gf3-3 (best factory arms) | 20 | 12 | 32 |
| gf4-solo (previous best single app) | — | — | judged strongest of seven, rejected |
| gf3-6 (accepted) | 17 | 7 | 24 |

**The single point lost is structural, not qualitative.** Part A item 9 has two clauses: tests
exercise the theory engine (met overwhelmingly — 101 tests, 21,358 assertions, property-style over
all 12 keys × 7 modes) *and* a red suite in `tests/generated/` meaningfully preceded the build
(impossible by construction — there is no TDD chain in this condition). Scored 1, flagged here.
**A is therefore not strictly comparable on item 9**; on every clause describing the delivered
artifact, this arm scored 2.

Part B item 16 (recoverability, judged from the arm's own review) is **inapplicable** — there is no
reviewer in this condition. Scored against my own worst finding, which was cosmetic.

## Gates — verified independently, not taken from the agent's summary

| gate | result | how verified |
|---|---|---|
| `bun test` | **101 pass, 0 fail, 21,358 assertions** | re-run on the VM by me |
| `oxlint` | 0 warnings, 0 errors, 23 files | re-run by me |
| typecheck | clean | the factory's **exact** `quality.py` argv, re-run by me |
| `bun build --target=browser` | 78.39 KB js + 17.52 KB css | re-run by me |
| browser, after `lifecycle refresh` | loads, interactive, **0 console errors** | Playwright interaction pass |

## The tie-breakers — the reason this arm matters

### T1 — silent-channel assertion: **PASS** (P3 falsified)

The suite computes `voicingMidis(...)` — *the actual numbers handed to the audio engine* — and
asserts, for every shape at every one of twelve roots, that they form the chord claimed and that
the root is in the bass. It also pins the CAGED grips against ground truth (`x32010` for C,
`022100` for E, `133211` for the F barre).

**This is the assertion whose absence let the solo arm ship a chromatic cluster.** No one asked for
it. I predicted it would be absent and was wrong.

### T2 — silent-channel correctness: **PASS**

Reproduced independently against the arm's own code:

```
PASS  C major   grip=x32010  midis=[48,52,55,60,64]  pcs=[0,4,7]
PASS  A major   grip=x02220  midis=[45,52,57,61,64]  pcs=[1,4,9]
PASS  G major   grip=320003  midis=[43,47,50,55,59,67]  pcs=[2,7,11]
PASS  E minor   grip=022000  midis=[40,47,52,55,59,64]  pcs=[4,7,11]
```

The engine is also *structurally* immune to the solo arm's bug: `strum(midis)` plucks each MIDI
number through `frequencyOf(midi)`, with no index arithmetic anywhere.

## Predictions

| | claim | outcome |
|---|---|---|
| **P1** | the bare agent obtains runtime truth directly, where 0 of 7 factory arms did | **CONFIRMED, emphatically** — see below |
| **P2** | A ≥ 16 and A+B ≥ 24, competitive but not dominant | **CONFIRMED** (19 / 31), at the top of the range |
| **P3** | it also ships no silent-channel assertion | **FALSIFIED** — T1 passed |
| **P4** | it will not commit | **CONFIRMED** — finished dirty; `snapshot` carried it |

### P1 in detail — the agency gap is harness, not model

The session, unprompted, in one turn:

- **wrote its own PEP-723 Playwright script** (`# dependencies = ["playwright"]`) — it *installed a
  browser automation library*, which no factory arm ever did
- **took screenshots, cropped them with PIL, and read them back as images** — 10 of its 81 tool
  calls were image reads. It *looked at its own app.*
- **found and ran the factory's own `render_smoke.py`**, having first read `quality.py` to learn
  what the gates check
- iterated on what it saw: it clipped the wheel caption out of the viewBox once, noticed it in a
  screenshot, moved the caption to HTML, and **added a test that fails if it vanishes again**

Control: across six fan-out 3 arms plus the solo, **zero** mentions of chromium, playwright,
puppeteer, jsdom or selenium in any seat. Same models are available to both. The difference is that
the factory's `tools:` allowlist (`read/bash/edit/write/grep/find/ls`) contains **no discovery
tool**, so a factory agent cannot find out that Playwright exists. This one could, and did.

## Validity — the stop rule fired

Pre-registered: *"If the session invokes the sssf skill or runs anything under `adws/`, this arm is
void as a control."*

**It ran `./adws/adw_modules/render_smoke.py` and read `adws/adw_modules/quality.py`.** So by my own
rule, stated in advance:

- **Void as a "no shared tooling" control.** It borrowed the factory's render gate and learned the
  gate criteria from `quality.py`. Its "browser render smoke passed" is the factory's instrument.
- **Not void as a "one generalist vs the chain" control.** It never invoked the Skill tool (0
  calls), never ran an ADW, never used a roster, never delegated a phase. All 4,358 lines are its
  own work in one turn, entirely within `apps/app/`. No factory file was modified — it copied
  `render_smoke.py` to `/tmp` before patching it.

The contamination is narrow and it runs **against** the factory's interest: the bare agent used the
factory's own gate, which the factory's own agents never invoke. Worth re-running clean with
`adws/` moved aside — but that re-run tests tooling access, not capability, and the capability
question is already answered.

## Process metrics — recorded, never scored

| metric | value |
|---|---|
| wall clock | **37 minutes**, one turn |
| model | `claude-opus-5` (141 assistant messages) |
| tokens | 351,385 out · 21.8M cache read · 466,851 cache write · 282 in |
| tool calls | 81 — 71 Bash, 10 Read (all screenshots) |
| billed | **$4.28** (exe.dev Shelley credit, not the OpenRouter key, which moved $0.00075 for setup gates only) |
| output | 4,358 insertions, 24 files, all under `apps/app/` |

Cost is **not** comparable to the factory arms' $0.36–$1.43: different provider, different model
tier, frontier vs cheap roster. Recorded as a dated fact, never ranked.

## The verdict the rubric could not produce

Ron, a guitarist who has been actively studying this material, reviewed the live app and the audio
by ear:

> "It sounds perfect, and of all of our runs so far, I would call this visually the most stunning...
> the most useful result I've seen. The fretboard portion is truly a professional-looking result...
> I would consider it a base for an application worth building from and probably would enjoy hosting
> and sharing with other guitar players."

> "Of all of the runs we've done through the factory, I've only seen portions of screenshots of
> results from individual runs that look intriguing to try and integrate. With my current version,
> this is the first one where I think of replacing my current version entirely."

**This is the important result of the session, and the rubric cannot see it.** Four arms now sit at
31–32/32 — statistically tied, indistinguishable on every scored item. The domain expert told them
apart in under a minute, and not marginally: the others produced fragments worth *integrating*, this
one is a candidate to *replace* the incumbent outright.

Two consequences:

1. **"Would you use it?" is a live discriminator where A and B have both saturated.** It is a single
   expert judgment, not a metric, and it does not scale to N=6 — but it separated a tied field
   instantly and should be recorded for every arm from here on, before the scored items, so the
   number never launders the judgment.
2. **Earlier comparisons that called arms tied were measuring badly, not observing real parity.**
   The saturation was hiding differences this large. Re-read fan-out 2 and 3 rankings with that in
   mind: "all scored 20/20" may have concealed the same spread.

**T2 is now also human-verified.** The mechanical check proved C major emits `[48,52,55,60,64]`;
"it sounds perfect" confirms the channel end to end, which no gate in this system can do.

## What this changes

1. **The chain's marginal value is now an open question, not an assumption.** A single turn reached
   31/32 against a six-phase, multi-agent, gated, reviewed pipeline's best of 32/32 — and did it in
   37 minutes for one arm's cost, with no reviewer, no revision loop and no red gate.
2. **The agency gap is fixable and cheap.** Give factory agents a discovery path and tell them what
   is on the box. The models clearly *want* runtime truth; six arms reconstructed it by inference
   because nothing let them observe it.
3. **"Assert the silent channels" got a working example.** The `voicingMidis` test is exactly the
   shape the memo asked for, written unprompted. It can be lifted into the greenfield brief or the
   test_designer prompt directly.
4. **Rubric saturation is now acute.** Three factory arms and this one cluster at 31–32/32. Part B
   was added to break a part A tie and has itself tied. The next fan-out needs discriminators with
   real headroom, or a different outcome measure entirely.

## Artifacts

- commits: `refs/sandbox/bare-cc-20260919-ba3919` in `../greenfield-sandboxes` (snapshot `92af88a`)
- bundle: `.sandbox/runs/bare-cc-20260919-ba3919.bundle`
- transcript: `.sandbox/traces/bare-cc-20260919-ba3919/60c76563-….jsonl` (10 MB, 363 rows) —
  pulled manually; `manage traces` covers only `adws/adw_data/`, which this arm never wrote
- screenshots: `specs/greenfield-judge/judge-bare-cc-{home,fsharp}.png`
