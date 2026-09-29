# archive/factory/

Retired **factory** pieces, not payload apps. Moved here 2026-09-28 by
`specs/team-default-consolidation.md` (NEXTSTEPS item 2b), with `git mv` so their
history follows them.

- `rosters/` — six rosters nothing ran any more: `asymmetric`, `deepestseek`,
  `inverse`, `open-weights`, `top-speed` (all on `deepseek-v4-flash-0731`) and
  `dsflash41` (a duplicate of the default roster).
- `prompts/demo/01-fan-out-five-rosters.md` — a demo that fanned out three of those
  rosters, so it could no longer run as written.

This directory has no `-YYYYMMDD-HHMMSS` suffix, so `target_sync.py` never turns its
name into a leak pattern. Only suffixed entries (retired apps) become patterns.

**To restore a roster**, `git mv` it back to `adws/adw_sssf_config/`. `0731` is still
registered in `sandbox_mount/guest/models.json.tmpl`, so a restored roster runs
without re-provisioning. The next `just target sync greenfield` carries it across.
