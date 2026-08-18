// The only file that touches the DOM.

import {
  CIRCLE_OF_FIFTHS_MAJORS,
  diatonicTriads,
  noteName,
  pitchClass,
  type Triad,
} from "./theory.ts";
import { pitchAtFret, frequencyAtFret, type Fingering } from "./fretboard.ts";
import { findVoicings } from "./voicing.ts";
import {
  layoutTriadOnStringSet,
  STRING_SETS,
  type Inversion,
} from "./triad-layout.ts";
import {
  clampVoicingIndex,
  stepVoicingIndex,
  voicingAt,
  voicingPositionLabel,
} from "./voicing-browser.ts";
import { DEFAULT_VIEW, panelVisibility, type ViewMode } from "./view-mode.ts";

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
  tonicPc: pitchClass("C"),
  mode: "major",
  selected: null,
  voicingIndex: 0,
  inversion: "root",
  stringSetIndex: 2,
  view: DEFAULT_VIEW,
};

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
const triadPlayBtn = document.getElementById("triad-play") as HTMLButtonElement;
const viewChordBtn = document.getElementById("view-chord") as HTMLButtonElement;
const viewTriadBtn = document.getElementById("view-triad") as HTMLButtonElement;
const chordPanel = document.getElementById("chord-panel") as HTMLDivElement;
const triadPanel = document.getElementById("triad-panel") as HTMLDivElement;

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
    return;
  }

  const chord = state.selected;
  const voicings = currentVoicings();
  state.voicingIndex = clampVoicingIndex(state.voicingIndex, voicings.length);
  const voicing = voicingAt(voicings, state.voicingIndex);
  renderVoicingControls(state.voicingIndex, voicings.length);

  if (!voicing) {
    chordDiagramSvg.appendChild(
      textNode(15, 130, "No fingering found in this position.", { fill: "#ff8080", "font-size": 12 })
    );
    chordCaptionEl.textContent = `${noteName(chord.root)} ${qualityLabel(chord.quality)}: no voicing found.`;
    return;
  }

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
      chordDiagramSvg.appendChild(
        textNode(x, marginTop - 12, "\u25cb", { fill: "#9aa1b5", "font-size": 12, "text-anchor": "middle" })
      );
      continue;
    }

    const displayFret = fret - fretOffset;
    const y = marginTop + (displayFret - 0.5) * fretSpacing;
    const pc = pitchAtFret(s, fret);
    const isRoot = pc === chord.root;

    chordDiagramSvg.appendChild(
      el("circle", {
        cx: x,
        cy: y,
        r: 9,
        fill: isRoot ? "#ffb454" : "#7cc4ff",
        stroke: isRoot ? "#fff" : "none",
        "stroke-width": isRoot ? 2 : 0,
      })
    );
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
  const stringSet = STRING_SETS[state.stringSetIndex];
  const layout = layoutTriadOnStringSet(chord.root, chord.quality, state.inversion, stringSet);

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

    triadDiagramSvg.appendChild(
      el("circle", {
        cx: x,
        cy: y,
        r: 12,
        fill: roleColor[pos.role],
      })
    );
    triadDiagramSvg.appendChild(
      textNode(x, y + 4, `${noteName(pc)}`, {
        fill: "#12131a",
        "font-size": 11,
        "text-anchor": "middle",
        "font-weight": "600",
      })
    );
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

function render() {
  renderView();
  renderChordList();
  renderChordDiagram();
  renderTriadDiagram();
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
    state.tonicPc = Number(keySelect.value);
    state.selected = null;
    state.voicingIndex = 0;
    render();
  });

  modeMajorBtn.addEventListener("click", () => {
    state.mode = "major";
    state.selected = null;
    state.voicingIndex = 0;
    modeMajorBtn.setAttribute("aria-pressed", "true");
    modeMinorBtn.setAttribute("aria-pressed", "false");
    render();
  });

  modeMinorBtn.addEventListener("click", () => {
    state.mode = "minor";
    state.selected = null;
    state.voicingIndex = 0;
    modeMajorBtn.setAttribute("aria-pressed", "false");
    modeMinorBtn.setAttribute("aria-pressed", "true");
    render();
  });

  voicingPrevBtn.addEventListener("click", () => stepVoicing(-1));
  voicingNextBtn.addEventListener("click", () => stepVoicing(1));

  triadPlayBtn.addEventListener("click", () => playTriad());

  inversionSelect.addEventListener("change", () => {
    state.inversion = inversionSelect.value as Inversion;
    render();
  });

  stringSetSelect.addEventListener("change", () => {
    state.stringSetIndex = Number(stringSetSelect.value);
    render();
  });
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

// Play the current triad layout as a short ascending arpeggio. Each note gets
// a brief attack/decay envelope so it does not click on/off.
async function playTriad() {
  if (!state.selected) return;
  const stringSet = STRING_SETS[state.stringSetIndex];
  const layout = layoutTriadOnStringSet(
    state.selected.root,
    state.selected.quality,
    state.inversion,
    stringSet
  );
  if (!layout) return;

  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state !== "running") return;

  const now = ctx.currentTime;
  const noteDur = 0.4;
  const gap = 0.15;
  const attack = 0.02;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.6;
  masterGain.connect(ctx.destination);

  // layout[0] is the lowest string of the set; play low-to-high.
  layout.forEach((pos, i) => {
    const freq = frequencyAtFret(pos.string, pos.fret);
    const t0 = now + i * (noteDur + gap);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + noteDur);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + noteDur + 0.05);
  });
}

function init() {
  initKeySelect();
  initInversionSelect();
  initStringSetSelect();
  attachListeners();
  const triads = currentTriads();
  state.selected = triads[0] ?? null;
  state.voicingIndex = 0;
  render();
}

init();
