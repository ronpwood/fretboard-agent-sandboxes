// Which stage view is on screen: the chord fingering diagram or the triad layout.
// Pure — no DOM.

export type ViewMode = "chord" | "triad";

/** Every view, in the order the toggle buttons appear. First entry is the default. */
export const VIEW_MODES: readonly ViewMode[] = ["chord", "triad"];

/** The view shown on a fresh load. */
export const DEFAULT_VIEW: ViewMode = "chord";

/** Narrow an untrusted string (dataset value, stored value) to a ViewMode; DEFAULT_VIEW otherwise. */
export function toViewMode(value: unknown): ViewMode {
  if (value === "chord" || value === "triad") return value;
  return DEFAULT_VIEW;
}

/** The other view — what a single-button "switch" would land on. */
export function otherView(view: ViewMode): ViewMode {
  return view === "chord" ? "triad" : "chord";
}

/** Human-facing button/heading label. */
export function viewLabel(view: ViewMode): string {
  switch (view) {
    case "chord": return "Chord diagram";
    case "triad": return "Triad layout";
  }
}

/** Which panels are visible for a given view. Exactly one entry is true. */
export function panelVisibility(view: ViewMode): { chord: boolean; triad: boolean } {
  return { chord: view === "chord", triad: view === "triad" };
}
