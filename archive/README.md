# archive/

Inert history. Nothing under here is wired into the factory (ADWs, `just`,
`sssf.config.yaml`). There are two kinds of entry:

- **`<name>-<timestamp>/`**: a retired payload app, put here by `just app swap` (or
  `just app archive`) instead of being deleted. Each is a straight copy of what
  used to live at `apps/<name>/`. The `-YYYYMMDD-HHMMSS` suffix matters:
  `target_sync.py` turns `<name>` into a leak pattern, so a retired app can't
  leak into a clean-room target. To bring one back, copy it back into `apps/` and
  redo the quality.py / just-recipe wiring the same way you would for any new app.
- **`factory/`**: retired factory pieces, such as rosters and demo prompts. It has no
  suffix, so it is never a leak pattern. See `factory/README.md`.
