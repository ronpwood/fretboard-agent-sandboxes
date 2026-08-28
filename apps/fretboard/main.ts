// The only file that touches the DOM.

import {
  CIRCLE_OF_FIFTHS_MAJORS,
  diatonicTriads,
  noteName,
  pitchClass,
  type Triad,
} from "./theory.ts";
import { pitchAtFret, type Fingering } from "./fretboard.ts";
import { findVoicings } from "./voicing.ts";
import {
  layoutTriadOnStringSet,
  STRING_SETS,
  type Inversion,
  type TriadPosition,
} from "./triad-layout.ts";
import {
  notesForVoicing,
  notesForPositions,
  soundedNote,
  noteEnvelope,
  gainForVoiceCount,
  type SoundedNote,
} from "./playback.ts";
import {
  clampVoicingIndex,
  stepVoicingIndex,
  voicingAt,
  voicingPositionLabel,
} from "./voicing-browser.ts";
import { DEFAULT_VIEW, panelVisibility, type ViewMode } from "./view-mode.ts";
import {
  STORAGE_KEY,
  DEFAULT_PERSISTED_STATE,
  serializeState,
  parseState,
  resolveDegreeIndex,
  type PersistedState,
} from "./persisted-state.ts";
import {
  WHEEL_SEGMENTS,
  WHEEL_GEOMETRY,
  selectionForKey,
  keyForSelection,
  relativeSelection,
  neighborIndices,
  wedgePath,
  labelPoint,
  ringLabel,
  type WheelRing,
} from "./circle-wheel.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

type State = {
  tonicPc: number;
  mode: "major" | "minor";
  selected: Triad | null;
  voicingIndex: number;
  inversion: Inversion;
  stringSetIndex: number;
  view: ViewMode;
};

const state: State = {
  tonicPc: DEFAULT_PERSISTED_STATE.tonicPc,
  mode: DEFAULT_PERSISTED_STATE.mode,
  selected: null,
  voicingIndex: DEFAULT_PERSISTED_STATE.voicingIndex,
  inversion: DEFAULT_PERSISTED_STATE.inversion,
  stringSetIndex: DEFAULT_PERSISTED_STATE.stringSetIndex,
  view: DEFAULT_PERSISTED_STATE.view,
};

// --- Persistence -----------------------------------------------------------

function readStoredState(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing / disabled storage: property access itself can throw.
    return null;
  }
}

function writeStoredState(json: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Quota exceeded or storage unavailable — persistence is best-effort.
  }
}

function currentPersistedState(): PersistedState {
  const triads = currentTriads();
  const degreeIndex = state.selected
    ? Math.max(0, triads.findIndex((t) => t.degree === state.selected!.degree))
    : 0;
  return {
    tonicPc: state.tonicPc,
    mode: state.mode,
    degreeIndex,
    view: state.view,
    voicingIndex: state.voicingIndex,
    inversion: state.inversion,
    stringSetIndex: state.stringSetIndex,
  };
}

function saveState() {
  writeStoredState(serializeState(currentPersistedState()));
}

function restoreState() {
  const stored = parseState(readStoredState());

  state.tonicPc = stored.tonicPc;
  state.mode = stored.mode;
  state.view = stored.view;
  state.inversion = stored.inversion;
  state.stringSetIndex = stored.stringSetIndex;

  const triads = currentTriads();
  const degreeIndex = resolveDegreeIndex(stored.degreeIndex, triads.length);
  state.selected = degreeIndex === null ? null : triads[degreeIndex];

  // A voicing index from a previous chord may not exist for this one.
  state.voicingIndex = clampVoicingIndex(stored.voicingIndex, currentVoicings().length);
}

// Cache DOM references once.
const keySelect = document.getElementById("key-select") as HTMLSelectElement;
const modeMajorBtn = document.getElementById("mode-major") as HTMLButtonElement;
const modeMinorBtn = document.getElementById("mode-minor") as HTMLButtonElement;
const chordListEl = document.getElementById("chord-list") as HTMLDivElement;
const chordDiagramSvg = document.getElementById("chord-diagram") as unknown as SVGSVGElement;
const chordCaptionEl = document.getElementById("chord-caption") as HTMLParagraphElement;
const voicingPrevBtn = document.getElementById("voicing-prev") as HTMLButtonElement;
const voicingNextBtn = document.getElementById("voicing-next") as HTMLButtonElement;
const voicingPositionEl = document.getElementById("voicing-position") as HTMLSpanElement;
const inversionSelect = document.getElementById("inversion-select") as HTMLSelectElement;
const stringSetSelect = document.getElementById("string-set-select") as HTMLSelectElement;
const triadDiagramSvg = document.getElementById("triad-diagram") as unknown as SVGSVGElement;
const triadCaptionEl = document.getElementById("triad-caption") as HTMLParagraphElement;
const viewChordBtn = document.getElementById("view-chord") as HTMLButtonElement;
const viewTriadBtn = document.getElementById("view-triad") as HTMLButtonElement;
const chordPanel = document.getElementById("chord-panel") as HTMLDivElement;
const triadPanel = document.getElementById("triad-panel") as HTMLDivElement;
const wheelSvg = document.getElementById("circle-wheel") as unknown as SVGSVGElement;
const wheelCaptionEl = document.getElementById("wheel-caption") as HTMLParagraphElement;
const chordPlayBtn = document.getElementById("chord-play") as HTMLButtonElement;
const triadPlayBtn = document.getElementById("triad-play") as HTMLButtonElement;

// --- Web Audio ------------------------------------------------------------
// Created lazily on the first user gesture so autoplay policy never blocks us.

type Voice = { osc: OscillatorNode; gain: GainNode };

let audioCtx: AudioContext | null = null;
let activeVoices: Voice[] = [];

function ensureAudio(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

const FAST_RELEASE = 0.04;

function stopAllVoices(ctx: AudioContext) {
  const now = ctx.currentTime;
  for (const { osc, gain } of activeVoices) {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FAST_RELEASE);
    try {
      osc.stop(now + FAST_RELEASE);
    } catch {
      // Already stopped; ignore.
    }
  }
  activeVoices = [];
}

function playNotes(notes: readonly SoundedNote[]) {
  if (notes.length === 0) return;
  const ctx = ensureAudio();
  stopAllVoices(ctx);

  const start = ctx.currentTime + 0.02;
  const peak = gainForVoiceCount(notes.length);

  for (const note of notes) {
    const env = noteEnvelope(start + note.offset, peak);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(note.frequency, env.startAt);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, env.startAt);
    gain.gain.linearRampToValueAtTime(env.peakGain, env.peakAt);
    gain.gain.linearRampToValueAtTime(env.sustainGain, env.sustainAt);
    gain.gain.setValueAtTime(env.sustainGain, env.releaseAt);
    gain.gain.linearRampToValueAtTime(0, env.stopAt);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(env.startAt);
    osc.stop(env.stopAt);

    const voice: Voice = { osc, gain };
    osc.onended = () => {
      activeVoices = activeVoices.filter((v) => v !== voice);
      gain.disconnect();
    };
    activeVoices.push(voice);
  }
}

function makePlayable(node: SVGElement, label: string, notes: readonly SoundedNote[]) {
  node.classList.add("note-marker");
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", label);
  node.addEventListener("click", () => playNotes(notes));
  node.addEventListener("keydown", (event) => {
    const e = event as KeyboardEvent;
    if (e.key === "Enter" || e.key === " ") {
      if (e.key === " ") e.preventDefault();
      playNotes(notes);
    }
  });
}

const STRING_SET_LABELS = ["E–A–D", "A–D–G", "D–G–B", "G–B–E"];

function el(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function textNode(x: number, y: number, content: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = el("text", { x, y, ...attrs });
  node.textContent = content;
  return node;
}

function initKeySelect() {
  for (const name of CIRCLE_OF_FIFTHS_MAJORS) {
    const option = document.createElement("option");
    option.value = String(pitchClass(name));
    option.textContent = name;
    keySelect.appendChild(option);
  }
  keySelect.value = String(state.tonicPc);
}

function initInversionSelect() {
  inversionSelect.value = state.inversion;
}

function initStringSetSelect() {
  stringSetSelect.value = String(state.stringSetIndex);
}

function currentTriads(): Triad[] {
  return diatonicTriads(state.tonicPc, state.mode);
}

function renderChordList() {
  chordListEl.replaceChildren();
  const triads = currentTriads();
  for (const triad of triads) {
    const button = document.createElement("button");
    button.type = "button";
    const isSelected = !!state.selected && state.selected.degree === triad.degree
      && state.selected.root === triad.root && state.selected.quality === triad.quality;
    button.setAttribute("aria-pressed", String(isSelected));
    button.textContent = `${triad.degree} — ${noteName(triad.root)} ${qualityLabel(triad.quality)}`;
    button.addEventListener("click", () => {
      state.selected = triad;
      state.voicingIndex = 0;
      render();
    });
    chordListEl.appendChild(button);
  }
}

function qualityLabel(quality: Triad["quality"]): string {
  switch (quality) {
    case "major": return "";
    case "minor": return "m";
    case "diminished": return "dim";
    case "augmented": return "aug";
  }
}

function currentVoicings(): Fingering[] {
  if (!state.selected) return [];
  return findVoicings(state.selected.notes, state.selected.root);
}

function currentVoicing(): Fingering | null {
  const voicings = currentVoicings();
  return voicingAt(voicings, state.voicingIndex);
}

function currentTriadLayout(): TriadPosition | null {
  if (!state.selected) return null;
  return layoutTriadOnStringSet(
    state.selected.root,
    state.selected.quality,
    state.inversion,
    STRING_SETS[state.stringSetIndex]
  );
}

function renderVoicingControls(index: number, count: number) {
  voicingPositionEl.textContent = voicingPositionLabel(index, count);
  voicingPrevBtn.disabled = count <= 1 || index <= 0;
  voicingNextBtn.disabled = count <= 1 || index >= count - 1;
}

function renderChordDiagram() {
  chordDiagramSvg.replaceChildren();

  if (!state.selected) {
    chordDiagramSvg.appendChild(
      textNode(20, 130, "Select a chord to see its fingering.", { fill: "#9aa1b5", "font-size": 12 })
    );
    chordCaptionEl.textContent = "";
    renderVoicingControls(0, 0);
    chordPlayBtn.disabled = true;
    return;
  }

  const chord = state.selected;
  const voicings = currentVoicings();
  state.voicingIndex = clampVoicingIndex(state.voicingIndex, voicings.length);
  const voicing = currentVoicing();
  renderVoicingControls(state.voicingIndex, voicings.length);

  if (!voicing) {
    chordDiagramSvg.appendChild(
      textNode(15, 130, "No fingering found in this position.", { fill: "#ff8080", "font-size": 12 })
    );
    chordCaptionEl.textContent = `${noteName(chord.root)} ${qualityLabel(chord.quality)}: no voicing found.`;
    chordPlayBtn.disabled = true;
    return;
  }

  chordPlayBtn.disabled = false;

  const marginLeft = 30;
  const marginTop = 30;
  const stringSpacing = 32;
  const fretSpacing = 40;
  const fretCount = 5;

  // Determine a fret offset: if any fretted note is beyond the displayed range, shift the window.
  const frettedFrets = voicing.filter((f): f is number => f !== null && f > 0);
  const maxFret = frettedFrets.length > 0 ? Math.max(...frettedFrets) : 0;
  const fretOffset = maxFret > fretCount ? maxFret - fretCount : 0;

  if (fretOffset > 0) {
    chordDiagramSvg.appendChild(
      textNode(marginLeft - 20, marginTop + fretSpacing / 2, String(fretOffset + 1), {
        fill: "#9aa1b5",
        "font-size": 11,
      })
    );
  }

  // String lines (vertical), 6 strings low-to-high left-to-right.
  for (let s = 0; s < 6; s++) {
    const x = marginLeft + s * stringSpacing;
    chordDiagramSvg.appendChild(
      el("line", {
        x1: x,
        y1: marginTop,
        x2: x,
        y2: marginTop + fretCount * fretSpacing,
        stroke: "#9aa1b5",
        "stroke-width": 1.5,
      })
    );
  }

  // Fret lines (horizontal). The nut (fret 0 offset only) is thicker.
  for (let f = 0; f <= fretCount; f++) {
    const y = marginTop + f * fretSpacing;
    const isNut = f === 0 && fretOffset === 0;
    chordDiagramSvg.appendChild(
      el("line", {
        x1: marginLeft,
        y1: y,
        x2: marginLeft + 5 * stringSpacing,
        y2: y,
        stroke: isNut ? "#edf0f7" : "#4a4e63",
        "stroke-width": isNut ? 4 : 1.5,
      })
    );
  }

  // Muted / open markers and fretted dots.
  for (let s = 0; s < 6; s++) {
    const x = marginLeft + s * stringSpacing;
    const fret = voicing[s];

    if (fret === null) {
      chordDiagramSvg.appendChild(
        textNode(x, marginTop - 12, "\u00d7", { fill: "#ff8080", "font-size": 14, "text-anchor": "middle" })
      );
      continue;
    }

    if (fret === 0) {
      const openText = textNode(x, marginTop - 12, "\u25cb", { fill: "#9aa1b5", "font-size": 12, "text-anchor": "middle" });
      const openPc = pitchAtFret(s, fret);
      makePlayable(openText, `Play ${noteName(openPc)}, string ${6 - s} fret 0`, [soundedNote(s, fret)]);
      chordDiagramSvg.appendChild(openText);
      continue;
    }

    const displayFret = fret - fretOffset;
    const y = marginTop + (displayFret - 0.5) * fretSpacing;
    const pc = pitchAtFret(s, fret);
    const isRoot = pc === chord.root;

    const circle = el("circle", {
      cx: x,
      cy: y,
      r: 9,
      fill: isRoot ? "#ffb454" : "#7cc4ff",
      stroke: isRoot ? "#fff" : "none",
      "stroke-width": isRoot ? 2 : 0,
    });
    makePlayable(circle, `Play ${noteName(pc)}, string ${6 - s} fret ${fret}`, [soundedNote(s, fret)]);
    chordDiagramSvg.appendChild(circle);
  }

  const grid = voicing.map((f) => (f === null ? "x" : String(f))).join(" ");
  const position = voicings.length > 1
    ? ` (voicing ${voicingPositionLabel(state.voicingIndex, voicings.length)})`
    : "";
  chordCaptionEl.textContent =
    `${noteName(chord.root)} ${qualityLabel(chord.quality)}: ${grid}${position}`;
}

function renderTriadDiagram() {
  triadDiagramSvg.replaceChildren();

  if (!state.selected) {
    triadDiagramSvg.appendChild(
      textNode(20, 80, "Select a chord to see its triad layout.", { fill: "#9aa1b5", "font-size": 12 })
    );
    triadCaptionEl.textContent = "";
    triadPlayBtn.disabled = true;
    return;
  }

  const chord = state.selected;
  const layout = currentTriadLayout();

  if (!layout) {
    triadDiagramSvg.appendChild(
      textNode(15, 80, "No layout found for this string set.", { fill: "#ff8080", "font-size": 12 })
    );
    triadCaptionEl.textContent = "";
    triadPlayBtn.disabled = true;
    return;
  }

  triadPlayBtn.disabled = false;

  const marginLeft = 40;
  const marginTop = 30;
  const stringSpacing = 40;
  const noteSpacing = 80;

  const roleColor: Record<string, string> = {
    root: "#ffb454",
    third: "#7cc4ff",
    fifth: "#8fe38f",
  };

  // Establish one shared fret-to-x scale across all three positions so the
  // horizontal placement of each dot reflects its actual fret number, not
  // just its index in the layout array.
  const frets = layout.map((pos) => pos.fret);
  const minLayoutFret = Math.min(...frets);
  const maxLayoutFret = Math.max(...frets);
  const fretRange = Math.max(1, maxLayoutFret - minLayoutFret);
  const diagramWidth = 3 * noteSpacing;
  function xForFret(fret: number): number {
    return marginLeft + ((fret - minLayoutFret) / fretRange) * diagramWidth;
  }

  // Draw 3 horizontal string lines.
  for (let i = 0; i < 3; i++) {
    const y = marginTop + i * stringSpacing;
    triadDiagramSvg.appendChild(
      el("line", {
        x1: marginLeft,
        y1: y,
        x2: marginLeft + 3 * noteSpacing,
        y2: y,
        stroke: "#4a4e63",
        "stroke-width": 1.5,
      })
    );
  }

  // Draw notes low string at bottom to top visually (index 0 = lowest, place at bottom).
  layout.forEach((pos, i) => {
    // i=0 is the lowest string in stringSet order; draw it at the bottom (largest y).
    const y = marginTop + (2 - i) * stringSpacing;
    const x = xForFret(pos.fret);
    const pc = pitchAtFret(pos.string, pos.fret);

    const circle = el("circle", {
      cx: x,
      cy: y,
      r: 12,
      fill: roleColor[pos.role],
    });
    const nameText = textNode(x, y + 4, `${noteName(pc)}`, {
      fill: "#12131a",
      "font-size": 11,
      "text-anchor": "middle",
      "font-weight": "600",
    });

    const group = el("g");
    group.appendChild(circle);
    group.appendChild(nameText);
    makePlayable(group, `Play ${noteName(pc)}, ${pos.role}, fret ${pos.fret}`, [soundedNote(pos.string, pos.fret)]);
    triadDiagramSvg.appendChild(group);

    triadDiagramSvg.appendChild(
      textNode(x, y + 24, `fret ${pos.fret}`, {
        fill: "#9aa1b5",
        "font-size": 10,
        "text-anchor": "middle",
      })
    );
  });

  triadCaptionEl.textContent = `${STRING_SET_LABELS[state.stringSetIndex]} strings, ${state.inversion} inversion`;
}

function renderView() {
  const visible = panelVisibility(state.view);
  chordPanel.hidden = !visible.chord;
  triadPanel.hidden = !visible.triad;
  viewChordBtn.setAttribute("aria-pressed", String(visible.chord));
  viewTriadBtn.setAttribute("aria-pressed", String(visible.triad));
}

function syncKeyControls() {
  keySelect.value = String(state.tonicPc);
  modeMajorBtn.setAttribute("aria-pressed", String(state.mode === "major"));
  modeMinorBtn.setAttribute("aria-pressed", String(state.mode === "minor"));
}

function applyKey(tonicPc: number, mode: "major" | "minor") {
  state.tonicPc = ((tonicPc % 12) + 12) % 12;
  state.mode = mode;
  state.voicingIndex = 0;
  state.selected = diatonicTriads(state.tonicPc, state.mode)[0] ?? null;
  render();
}

function renderWheel() {
  wheelSvg.replaceChildren();

  const selection = selectionForKey(state.tonicPc, state.mode);
  const related = relativeSelection(selection);
  const { previous, next } = neighborIndices(selection.index);

  for (const segment of WHEEL_SEGMENTS) {
    for (const ring of ["major", "minor"] as const) {
      const isSelected = segment.index === selection.index && ring === selection.ring;
      const isRelated = segment.index === related.index && ring === related.ring;
      const isNeighbor = segment.index === previous || segment.index === next;

      const classes = ["wheel-wedge"];
      if (isSelected) classes.push("is-selected");
      if (isRelated) classes.push("is-related");
      if (isNeighbor) classes.push("is-neighbor");

      const path = el("path", {
        d: wedgePath(segment.index, ring),
        class: classes.join(" "),
        role: "button",
        tabindex: 0,
        "aria-label": ringLabel(segment.index, ring),
        "aria-pressed": String(isSelected),
      });

      const activate = () => {
        const { tonicPc, mode } = keyForSelection({ index: segment.index, ring });
        applyKey(tonicPc, mode);
      };

      path.addEventListener("click", activate);
      path.addEventListener("keydown", (event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          if (keyboardEvent.key === " ") keyboardEvent.preventDefault();
          activate();
        }
      });

      wheelSvg.appendChild(path);

      const point = labelPoint(segment.index, ring);
      const labelClasses = ["wheel-label"];
      if (ring === "minor") labelClasses.push("minor");
      if (isSelected) labelClasses.push("on-selected");
      const labelText = ring === "major" ? segment.majorName : `${segment.minorName}m`;
      wheelSvg.appendChild(
        textNode(point.x, point.y + 4, labelText, { class: labelClasses.join(" ") })
      );
    }
  }

  const relativeKey = keyForSelection(related);
  wheelCaptionEl.textContent =
    `${noteName(state.tonicPc)} ${state.mode} \u2014 relative ${state.mode === "major" ? "minor" : "major"}: ${noteName(relativeKey.tonicPc)}`;
}

function render() {
  renderView();
  syncKeyControls();
  renderWheel();
  renderChordList();
  renderChordDiagram();
  renderTriadDiagram();
  saveState();
}

function stepVoicing(delta: number) {
  const count = currentVoicings().length;
  const next = stepVoicingIndex(state.voicingIndex, count, delta);
  if (next === state.voicingIndex) return;
  state.voicingIndex = next;
  render();
}

function setView(view: ViewMode) {
  if (state.view === view) return;
  state.view = view;
  render();
}

function attachListeners() {
  viewChordBtn.addEventListener("click", () => setView("chord"));
  viewTriadBtn.addEventListener("click", () => setView("triad"));

  keySelect.addEventListener("change", () => {
    applyKey(Number(keySelect.value), state.mode);
  });

  modeMajorBtn.addEventListener("click", () => {
    applyKey(state.tonicPc, "major");
  });

  modeMinorBtn.addEventListener("click", () => {
    applyKey(state.tonicPc, "minor");
  });

  voicingPrevBtn.addEventListener("click", () => stepVoicing(-1));
  voicingNextBtn.addEventListener("click", () => stepVoicing(1));

  inversionSelect.addEventListener("change", () => {
    state.inversion = inversionSelect.value as Inversion;
    render();
  });

  stringSetSelect.addEventListener("change", () => {
    state.stringSetIndex = Number(stringSetSelect.value);
    render();
  });

  chordPlayBtn.addEventListener("click", () => {
    const voicing = currentVoicing();
    if (voicing) playNotes(notesForVoicing(voicing));
  });

  triadPlayBtn.addEventListener("click", () => {
    const layout = currentTriadLayout();
    if (layout) playNotes(notesForPositions(layout));
  });
}

function init() {
  restoreState();
  initKeySelect();
  initInversionSelect();
  initStringSetSelect();
  attachListeners();
  render();
}

init();
