# Next Steps

The open queue only, ordered by value. Findings, measurements and closed items are in
[CHANGELOG.md](CHANGELOG.md), cited by date tag (e.g. `CHANGELOG 2026-09-23e`). When an item
closes, write its result entry in the changelog and delete it here.

**Recently closed:** `specs/render-content-and-prompt-gaps.md` (CHANGELOG 2026-09-23b/c) and the
harn2 baseline arm, 6/6 predictions met (CHANGELOG 2026-09-23d/e), its two harness fixes
(CHANGELOG 2026-09-23f), and the harness-signals spec (CHANGELOG 2026-09-23g; target sync pending).

Item numbers in parentheses, such as "4(5)", refer to the queue in CHANGELOG 2026-09-20b.

## 1. N=3 replicates of the harn2/harn3 arm (CHANGELOG 2026-09-23i, 2026-09-24b)

- **Pre-registration CHANGELOG 2026-09-24b approved.** harn4/5 running on
  `a11ba95`. harn6 was lost to an Alibaba content-filter `provider_error` and replaced by harn7.
- The smoke blind spot is fixed (CHANGELOG 2026-09-24a): harn3 now clicks 25/25, and the corpus
  verdicts are unchanged. The cause was a hidden control, not `pointer-events: none`. The fix is
  synced to the target, so the replicates' gate carries it.
- Still open, a different class: Playwright clicks a control's box centre, so a hub covering every
  sector's centre (gf3-2, 9/25) blocks D. A centroid hit-test would reach those sectors.

## 2. Still open, not in a spec

- **Pin the OpenRouter provider for v4.1-flash** (CHANGELOG 2026-09-24b): Alibaba's content filter
  killed harn6's build. Do this after the N=3 set, since it would be a new difference between runs.

- **(6) the audio channel**: four defects in four runs. It needs a brief-level requirement and an
  `AudioContext` value spy in `test-dom.ts`. This is a design task.

## 3. A 0731 control roster, if any A/B is wanted

The default runs v4.1 and nothing runs `0731`. Build one only when an A/B needs it.

## 4. `specs/context-rot-and-self-compact.md` — a later experiment, gated

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
