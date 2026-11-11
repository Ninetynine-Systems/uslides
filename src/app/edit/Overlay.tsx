import {
  Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties,
} from 'react';
import { Type } from 'lucide-react';
import {
  bringToFront,
  deleteBox,
  duplicateBox,
  insertBox,
  sendToBack,
  setBoxAttrs,
  setBoxSpan,
  type Edit,
  type EditResult,
} from '../../core/edit';
import {
  centredSpan, clampNewBox, findFreeArea, moveSpan, resizeSpan, type Edge, type GridArea,
} from '../../core/layout';
import { deleteSlide, duplicateSlide, moveSlide, setSlideAttrs, setSlideGrid } from '../../core/slideEdit';
import type { Deck } from '../../core/parse';
import type { Box, Slide } from '../../core/slide';
import type { Grid, SourceRange } from '../../core/types';
import { FloatingBar } from './FloatingBar';
import { SlideBar } from './SlideBar';
import { boxesAt, cellAt } from './stageGeometry';
import type { QueuedTypingKey, TypingAreaProps, TypingLook } from './TypingArea';
import { FontPicker } from '../FontPicker';
import { usePopup, usePopupDismiss } from '../usePopup';
import { IconButton } from '../IconButton';

type OnEdit = (make: (deck: Deck) => EditResult | null, opts?: { userEvent?: string }) => void;
type Geometry = { anchor: DOMRect; bounds: DOMRect };
type Point = { x: number; y: number };
type TypingTarget = { kind: 'box'; index: number } | { kind: 'loose'; index: number };
type Typing = TypingTarget & { from: number; text: string; session: number; caret?: Point };
type Drag = {
  pointerId: number;
  start: Point;
  startCell: { col: number; row: number };
  moved: boolean;
  area: GridArea | null;
  hits: number[];
  selectedAtStart: number | null;
  /** The box element that follows the pointer, once the drag has started moving. */
  el?: HTMLElement;
} & (
  | { kind: 'draw' }
  | { kind: 'move'; boxIndex: number; original: GridArea }
  | { kind: 'resize'; boxIndex: number; edge: Edge; original: GridArea }
);

export type SelectionRequest = { id: number; box: number; typing?: boolean };

export type OverlayProps = {
  stage: HTMLElement;
  slide: Slide;
  grid: Grid;
  theme: 'light' | 'dark';
  blocked: boolean;
  onEdit: OnEdit;
  onMoveCursor(pos: number): void;
  getDeck(): Deck | undefined;
  getSource(): string;
  onUndo(): void;
  onRedo(): void;
  TypingArea: ComponentType<TypingAreaProps>;
  onSelectSlide?(): void;
  /** Only the current slide may keep the one selection shared by the preview. */
  active?: boolean;
  /** Selects a box that was inserted by a control outside this overlay. */
  selectionRequest?: SelectionRequest;
  onSelectionRequestHandled?(id: number): void;
  showHint?: boolean;
  onHintDone?(): void;
  /** True when the slide itself is selected: a click on it chose no box. Its settings bar shows. */
  slideSelected?: boolean;
  /** Selects or clears the slide itself. */
  onSlideSelect?(selected: boolean): void;
  /** After a slide is moved, copied or deleted, the slide to select next (null for none). */
  onSlideSelectIndex?(index: number | null): void;
  /** How many slides the deck has, for the move and delete buttons. */
  slideCount?: number;
  /** The deck's grid, which a slide goes back to when its own grid is removed. */
  deckGrid?: Grid;
};

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

type Hover = { index: number; left: number; top: number; width: number; height: number };

function boxElement(stage: HTMLElement, index: number): HTMLElement | null {
  return stage.querySelector<HTMLElement>(`:scope > .us-box[data-box="${index}"]`);
}

/** Screen pixels per slide pixel: the slide is drawn at full size and scaled to fit its frame. */
function viewScale(stage: HTMLElement): number {
  const width = stage.offsetWidth;
  return width === 0 ? 1 : stage.getBoundingClientRect().width / width;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isTransparent(colour: string): boolean {
  return colour === 'transparent' || /[,/]\s*0\)$/.test(colour);
}

/** Space between loose text and the frame drawn round it while typing. */
const LOOSE_PAD = 6;

/** How the typing area should look so it matches the box or text it covers. */
function typingLook(stage: HTMLElement, element: Element): TypingLook {
  const style = getComputedStyle(element);
  let background = style.backgroundColor;
  if (isTransparent(background)) background = getComputedStyle(stage).backgroundColor;
  if (isTransparent(background)) background = '#fff';
  const scale = viewScale(stage);
  return {
    background,
    color: style.color,
    fontFamily: style.fontFamily,
    // The size the text has on screen, so it does not jump when typing starts. Never too small to read.
    fontSize: clamp(Math.round(parseFloat(style.fontSize) * scale * 10) / 10, 10, 44),
    padding: clamp(Math.round(parseFloat(style.paddingTop) * scale), 2, 40),
    // Centred or right-aligned text stays where it is while it is typed.
    textAlign: style.textAlign,
  };
}

function pointNear(a: Point, b: Point): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= 4;
}

function sameArea(a: GridArea, b: GridArea): boolean {
  return a.col[0] === b.col[0] && a.col[1] === b.col[1]
    && a.row[0] === b.row[0] && a.row[1] === b.row[1];
}

function areaStyle(stage: HTMLElement, frame: HTMLElement, grid: Grid, area: GridArea): CSSProperties {
  const stageRect = stage.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const cellWidth = stageRect.width / grid.cols;
  const cellHeight = stageRect.height / grid.rows;
  return {
    left: stageRect.left - frameRect.left + (area.col[0] - 1) * cellWidth,
    top: stageRect.top - frameRect.top + (area.row[0] - 1) * cellHeight,
    width: (area.col[1] - area.col[0] + 1) * cellWidth,
    height: (area.row[1] - area.row[0] + 1) * cellHeight,
  };
}

function gridStyle(stage: HTMLElement, frame: HTMLElement, grid: Grid): CSSProperties {
  const stageRect = stage.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  return {
    left: stageRect.left - frameRect.left,
    top: stageRect.top - frameRect.top,
    width: stageRect.width,
    height: stageRect.height,
    '--us-cols': String(grid.cols),
    '--us-rows': String(grid.rows),
  } as CSSProperties;
}

function trimLooseRange(source: string, range: SourceRange): SourceRange {
  const text = source.slice(range.from, range.to);
  const leading = /^(?:[\t ]*\n)+/.exec(text)?.[0].length ?? 0;
  const trailing = /(?:\n[\t ]*)+$/.exec(text)?.[0].length ?? 0;
  return { from: range.from + leading, to: Math.max(range.from + leading, range.to - trailing) };
}

/** The parser's empty range ends on the opening line; typing starts after that line break. */
function targetRange(source: string, slide: Slide, target: TypingTarget): SourceRange | undefined {
  if (target.kind === 'loose') {
    const range = slide.looseRanges[target.index];
    return range ? trimLooseRange(source, range) : undefined;
  }
  const box = slide.boxes[target.index];
  if (!box) return undefined;
  const range = box.contentRange;
  if (range.from === range.to && source.charAt(range.from) === '\n') {
    return { from: range.from + 1, to: range.to + 1 };
  }
  return range;
}

function loosePieceForLine(slide: Slide, line: number): number | undefined {
  const offset = slide.looseLines[line];
  if (offset === undefined) return undefined;
  const index = slide.looseRanges.findIndex((range) => range.from <= offset && offset < range.to);
  return index < 0 ? undefined : index;
}

/** Maps a marked rendered block back to the loose source piece that produced it. */
function loosePieceAt(
  stage: HTMLElement,
  slide: Slide,
  clientX: number,
  clientY: number,
): number | undefined {
  const direct = document.elementFromPoint(clientX, clientY);
  if (!(direct instanceof Element)) return undefined;
  let target = direct.closest('.us-loose') ? direct : undefined;
  // A transparent box covers the slide. Its blank area may still have rendered loose text under it.
  if (!target && direct.classList.contains('us-box')) {
    target = document.elementsFromPoint(clientX, clientY)
      .find((element) => element.closest('.us-loose'));
  }
  if (!target) return undefined;
  const loose = target.closest<HTMLElement>('.us-loose');
  if (!loose || loose.parentElement !== stage) return undefined;
  const block = target.closest<HTMLElement>('[data-line]');
  if (!block || !loose.contains(block)) return undefined;
  const line = Number(block.dataset.line);
  return Number.isInteger(line) ? loosePieceForLine(slide, line) : undefined;
}

function loosePieceElements(stage: HTMLElement, slide: Slide, pieceIndex: number): Element[] {
  const loose = stage.querySelector<HTMLElement>(':scope > .us-loose');
  if (!loose) return [];
  return [...loose.querySelectorAll<HTMLElement>('[data-line]')].filter((element) => {
    const line = Number(element.dataset.line);
    if (!Number.isInteger(line) || loosePieceForLine(slide, line) !== pieceIndex) return false;
    let parent = element.parentElement?.closest<HTMLElement>('[data-line]');
    while (parent && loose.contains(parent)) {
      const parentLine = Number(parent.dataset.line);
      if (Number.isInteger(parentLine) && loosePieceForLine(slide, parentLine) === pieceIndex) return false;
      parent = parent.parentElement?.closest<HTMLElement>('[data-line]');
    }
    return true;
  });
}

function boundsOf(elements: Element[]): DOMRect | undefined {
  if (elements.length === 0) return undefined;
  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function localRect(anchor: DOMRect, bounds: DOMRect): DOMRect {
  return new DOMRect(anchor.left - bounds.left, anchor.top - bounds.top, anchor.width, anchor.height);
}

function replaceText(text: string, from: number, to: number, insert: string): string {
  return text.slice(0, from) + insert + text.slice(to);
}

/** A double-click on rendered loose content belongs to that content, not to box drawing. */
function isEmptyPoint(stage: HTMLElement, clientX: number, clientY: number): boolean {
  if (boxesAt(stage, clientX, clientY).length > 0) return false;
  const hit = document.elementFromPoint(clientX, clientY);
  return hit === stage || (hit instanceof Element && hit.classList.contains('us-loose'));
}

export function Overlay({
  stage,
  slide,
  grid,
  theme,
  blocked,
  onEdit,
  onMoveCursor,
  getDeck,
  getSource,
  onUndo,
  onRedo,
  TypingArea,
  onSelectSlide,
  active = true,
  selectionRequest,
  onSelectionRequestHandled,
  showHint = false,
  onHintDone,
  slideSelected = false,
  onSlideSelect,
  onSlideSelectIndex,
  slideCount = 1,
  deckGrid,
}: OverlayProps) {
  const slideSelectedRef = useRef(slideSelected);
  slideSelectedRef.current = slideSelected;
  const [selected, setSelected] = useState<number | null>(null);
  const fontPopup = usePopup();
  const fontContainer = useRef<HTMLDivElement>(null);
  const fontTrigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(fontPopup.open, fontPopup.close, [fontContainer], fontTrigger);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [typingRect, setTypingRect] = useState<DOMRect | null>(null);
  const [look, setLook] = useState<TypingLook | undefined>(undefined);
  /** Set for loose text, which may grow down to the bottom of the slide as it is typed. */
  const [typingMaxHeight, setTypingMaxHeight] = useState<number | undefined>(undefined);
  /** True from the first movement of a drag until the slide shows its result. */
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  /** Where a moved box was let go, so it can glide from there to its cells. */
  const settle = useRef<{ index: number; rect: DOMRect } | null>(null);
  const [typing, setTyping] = useState<Typing | null>(null);
  const typingRef = useRef<Typing | null>(null);
  typingRef.current = typing;
  const typingSession = useRef(0);
  const typingAreaReady = useRef(false);
  const queuedTypingInput = useRef<QueuedTypingKey[]>([]);
  const [pendingTyping, setPendingTyping] = useState<number | null>(null);
  const [ghost, setGhost] = useState<GridArea | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const lastSlide = useRef(slide.index);
  const previousSlide = useRef(slide);
  const frame = stage.parentElement as HTMLElement;

  const storeTyping = useCallback((next: Typing | null) => {
    if (next === null) {
      typingAreaReady.current = false;
      queuedTypingInput.current = [];
    }
    typingRef.current = next;
    setTyping(next);
  }, []);

  const beginTyping = useCallback((target: TypingTarget, deck = getDeck(), caret?: Point): boolean => {
    const source = deck?.source ?? getSource();
    const freshSlide = deck?.slides[slide.index];
    const range = freshSlide && targetRange(source, freshSlide, target);
    if (!range) return false;
    typingAreaReady.current = false;
    queuedTypingInput.current = [];
    frame.focus({ preventScroll: true });
    storeTyping({
      ...target,
      from: range.from,
      text: source.slice(range.from, range.to),
      session: ++typingSession.current,
      caret,
    });
    setSelected(target.kind === 'box' ? target.index : null);
    lastPoint.current = null;
    if (slideSelectedRef.current) onSlideSelect?.(false);
    onMoveCursor(range.from);
    return true;
  }, [frame, getDeck, getSource, onMoveCursor, onSlideSelect, slide.index, storeTyping]);

  const takeQueuedTypingInput = useCallback(() => {
    const queued = queuedTypingInput.current;
    queuedTypingInput.current = [];
    return queued;
  }, []);

  useEffect(() => {
    if (active) return;
    setSelected(null);
    fontPopup.close();
    storeTyping(null);
    lastPoint.current = null;
  }, [active, fontPopup.close, storeTyping]);

  const onSlideSelectRef = useRef(onSlideSelect);
  onSlideSelectRef.current = onSlideSelect;

  // Escape clears the selected slide wherever the keyboard is, unless something else used the key first
  // (an open menu, the typing area, the editor's search bar).
  useEffect(() => {
    if (!slideSelected || !active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.us-typing-area, .us-font-picker, input, select, textarea')) return;
      onSlideSelectRef.current?.(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, slideSelected]);

  // Another slide became current: this one is no longer selected. Only on that change, so a slide that is
  // selected a moment before it becomes current (after a move or copy) keeps its selection.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active && slideSelectedRef.current) onSlideSelectRef.current?.(false);
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (lastSlide.current === slide.index) return;
    lastSlide.current = slide.index;
    setSelected(null);
    fontPopup.close();
    storeTyping(null);
    lastPoint.current = null;
  }, [fontPopup.close, slide.index, storeTyping]);

  useEffect(() => {
    if (previousSlide.current === slide) return;
    previousSlide.current = slide;
    if (selected !== null && !slide.boxes[selected]) {
      setSelected(null);
      lastPoint.current = null;
    }
    if (
      typing &&
      ((typing.kind === 'box' && !slide.boxes[typing.index]) ||
        (typing.kind === 'loose' && !slide.looseRanges[typing.index]))
    ) storeTyping(null);
  }, [selected, slide, storeTyping, typing]);

  useEffect(() => {
    if (!active || !selectionRequest || !slide.boxes[selectionRequest.box]) return;
    if (selectionRequest.typing) beginTyping({ kind: 'box', index: selectionRequest.box });
    else setSelected(selectionRequest.box);
    lastPoint.current = null;
    onSelectionRequestHandled?.(selectionRequest.id);
  }, [active, beginTyping, onSelectionRequestHandled, selectionRequest, slide.boxes]);

  useEffect(() => {
    if (pendingTyping === null || !slide.boxes[pendingTyping]) return;
    beginTyping({ kind: 'box', index: pendingTyping });
    setPendingTyping(null);
  }, [beginTyping, pendingTyping, slide.boxes]);

  useEffect(() => {
    if (!typing) return;
    const onOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.us-typing-area, .us-typing-bar')) return;
      storeTyping(null);
    };
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', onOutsidePointerDown, true);
  }, [storeTyping, typing]);

  useEffect(
    () => () => {
      drag.current = null;
      frame.classList.remove('us-dragging');
    },
    [frame],
  );

  // The slide frame hides what overflows it, but the browser still scrolls it to show a focused control or
  // an open menu, which shifts the whole slide. The slide never scrolls, so put it back at once.
  useEffect(() => {
    const unscroll = () => {
      if (frame.scrollTop !== 0) frame.scrollTop = 0;
      if (frame.scrollLeft !== 0) frame.scrollLeft = 0;
    };
    frame.addEventListener('scroll', unscroll);
    return () => frame.removeEventListener('scroll', unscroll);
  }, [frame]);

  const updateGeometry = useCallback(() => {
    if (!stage.isConnected) return;
    const bounds = frame.getBoundingClientRect();
    const selectedBox = selected === null
      ? null
      : stage.querySelector<HTMLElement>(`:scope > .us-box[data-box="${selected}"]`);
    setGeometry(selectedBox ? { anchor: selectedBox.getBoundingClientRect(), bounds } : null);

    if (!typing) return void setTypingRect(null);
    let anchor: DOMRect | undefined;
    let styled: Element | null | undefined;
    if (typing.kind === 'box') {
      styled = boxElement(stage, typing.index);
      anchor = styled?.getBoundingClientRect();
    } else {
      const pieces = loosePieceElements(stage, slide, typing.index);
      const loose = stage.querySelector<HTMLElement>(':scope > .us-loose');
      styled = loose;
      anchor = boundsOf(pieces);
      if (!anchor || !loose) {
        setTypingRect(null);
        storeTyping(null);
        return;
      }
      // Loose text runs the width of the slide, so the area does too: lines wrap where they will on the slide.
      const looseRect = loose.getBoundingClientRect();
      const inset = parseFloat(getComputedStyle(loose).paddingLeft) * viewScale(stage);
      anchor = new DOMRect(
        looseRect.left + inset - LOOSE_PAD,
        anchor.top - LOOSE_PAD,
        looseRect.width - 2 * inset + 2 * LOOSE_PAD,
        anchor.height + 2 * LOOSE_PAD,
      );
    }
    if (styled) {
      const next = typingLook(stage, styled);
      if (typing.kind === 'loose') next.padding = LOOSE_PAD;
      setLook((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next));
    }
    setTypingMaxHeight(typing.kind === 'loose' && anchor ? bounds.bottom - anchor.top - 4 : undefined);
    setTypingRect(anchor ? localRect(anchor, bounds) : null);
  }, [frame, selected, slide, stage, storeTyping, typing]);

  // Layout effects: the outline is measured and drawn in the same frame as the slide it sits on.
  useLayoutEffect(() => {
    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(frame);
    observer.observe(stage);
    window.addEventListener('resize', updateGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateGeometry);
    };
  }, [slide, updateGeometry]);

  // A new stage means the slide was drawn again: the drag is over, and a moved box glides into its cells.
  useLayoutEffect(() => {
    setDragging(false);
    setHover(null);
    const from = settle.current;
    settle.current = null;
    const element = from && boxElement(stage, from.index);
    if (!from || !element) return;
    const now = element.getBoundingClientRect();
    const scale = viewScale(stage);
    const dx = (from.rect.left - now.left) / scale;
    const dy = (from.rect.top - now.top) / scale;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    element.style.translate = `${dx}px ${dy}px`;
    void element.offsetWidth; // start the glide from where the box was let go
    element.classList.add('us-settling');
    element.style.translate = '';
    const timer = window.setTimeout(() => element.classList.remove('us-settling'), 200);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const withSelected = useCallback(
    (
      make: (source: string, freshSlide: Slide, box: Box) => EditResult,
      selectionAfter?: (freshSlide: Slide) => number | null,
    ) => {
      if (selected === null) return;
      let next = selected;
      let found = false;
      onEdit((deck) => {
        const freshSlide = deck.slides[slide.index];
        const box = freshSlide?.boxes[selected];
        if (!freshSlide || !box) return null;
        found = true;
        if (selectionAfter) next = selectionAfter(freshSlide) ?? selected;
        return make(deck.source, freshSlide, box);
      });
      setSelected(found ? next : null);
    },
    [onEdit, selected, slide.index],
  );

  const setAttrs = useCallback(
    (attrs: Record<string, string | null>) => withSelected((source, _freshSlide, box) => setBoxAttrs(source, box, attrs)),
    [withSelected],
  );

  const duplicate = useCallback(() => {
    withSelected(
      (source, freshSlide, box) => duplicateBox(source, freshSlide, box, freshSlide.grid),
      (freshSlide) => freshSlide.boxes.length,
    );
  }, [withSelected]);

  const remove = useCallback(() => {
    withSelected((source, _freshSlide, box) => deleteBox(source, box));
    setSelected(null);
    lastPoint.current = null;
  }, [withSelected]);

  const insert = useCallback(
    (area: GridArea) => {
      let next: number | null = null;
      onEdit((deck) => {
        const freshSlide = deck.slides[slide.index];
        if (!freshSlide) return null;
        next = freshSlide.boxes.length;
        return insertBox(deck.source, freshSlide, area.col, area.row);
      });
      if (next !== null) {
        onHintDone?.();
        setSelected(next);
        setPendingTyping(next);
        lastPoint.current = null;
      }
    },
    [onEdit, onHintDone, slide.index],
  );

  /** Runs a slide edit against the latest deck. */
  const editSlide = useCallback(
    (make: (deck: Deck, freshSlide: Slide) => EditResult | null) => {
      onEdit((deck) => {
        const freshSlide = deck.slides[slide.index];
        return freshSlide ? make(deck, freshSlide) : null;
      });
    },
    [onEdit, slide.index],
  );

  const slideActions = {
    onSet: (attrs: Record<string, string | null>) => editSlide((deck, s) => setSlideAttrs(deck.source, s, attrs)),
    onGrid: (next: Grid | null) => editSlide((deck, s) => setSlideGrid(deck.source, s, deckGrid ?? deck.settings.grid, next)),
    onAddBox: () => {
      onSlideSelect?.(false);
      insert(findFreeArea(slide, 4, 2) ?? centredSpan(slide.grid, 4, 2));
    },
    onDuplicate: () => {
      editSlide((deck, s) => duplicateSlide(deck.source, s));
      onSlideSelectIndex?.(slide.index + 1);
    },
    onMove: (direction: -1 | 1) => {
      editSlide((deck) => moveSlide(deck.source, deck.slides, slide.index, direction));
      onSlideSelectIndex?.(slide.index + direction);
    },
    onDelete: () => {
      editSlide((deck) => deleteSlide(deck.source, deck.slides, slide.index));
      onSlideSelectIndex?.(null);
      // The bar goes away with the selection. Keep the keyboard on the slides, so Ctrl+Z undoes the delete.
      frame.focus({ preventScroll: true });
    },
  };

  const setSpan = useCallback(
    (boxIndex: number, area: GridArea) => {
      let found = false;
      onEdit((deck) => {
        const freshSlide = deck.slides[slide.index];
        const box = freshSlide?.boxes[boxIndex];
        if (!freshSlide || !box) return null;
        found = true;
        return setBoxSpan(deck.source, box, area.col, area.row, freshSlide.grid);
      });
      setSelected(found ? boxIndex : null);
    },
    [onEdit, slide.index],
  );

  const changeTyping = useCallback((edit: Edit): void => {
    const current = typingRef.current;
    if (!current) return;
    const localFrom = edit.from - current.from;
    const localTo = edit.to - current.from;
    if (localFrom < 0 || localTo < localFrom || localTo > current.text.length) return;
    let found = false;
    let start = current.from;
    let reload: Typing | null = null;
    onEdit((deck) => {
      let source = deck.source;
      let freshSlide = deck.slides[slide.index];
      if (!freshSlide) return null;
      let range = targetRange(source, freshSlide, current);
      if (!range) return null;
      const matchesAt = (from: number) => source.slice(from, from + current.text.length) === current.text;
      if (matchesAt(current.from)) {
        // Most typing changes keep the target at its last mapped position. Avoid reparsing the whole deck.
        start = current.from;
      } else if (current.text.startsWith('\n') && range.from > 0 && matchesAt(range.from - 1)) {
        // A leading blank line is deliberately outside the parser's trimmed range.
        start = range.from - 1;
      } else if (matchesAt(range.from)) {
        start = range.from;
      } else {
        const latest = getDeck();
        const latestSlide = latest?.slides[slide.index];
        const latestRange = latest && latestSlide && targetRange(latest.source, latestSlide, current);
        if (latest && latestSlide && latestRange &&
          latest.source.slice(latestRange.from, latestRange.from + current.text.length) === current.text) {
          source = latest.source;
          freshSlide = latestSlide;
          range = latestRange;
          start = latestRange.from;
        } else {
          const reloadSource = latest?.source ?? source;
          const reloadRange = latestRange ?? range;
          reload = { ...current, from: reloadRange.from, text: reloadSource.slice(reloadRange.from, reloadRange.to) };
          return null;
        }
      }
      found = true;
      let insert = edit.insert;
      if (current.kind === 'box' && current.text === '' && localFrom === 0 && localTo === 0 && insert !== '') {
        const box = freshSlide.boxes[current.index]!;
        const openingBreak = source.indexOf('\n', box.range.from);
        if (openingBreak === -1 || openingBreak >= box.range.to) insert = `\n${insert}`;
        else if (source.startsWith(':::', start) && !insert.endsWith('\n')) insert += '\n';
      }
      return {
        changes: [{
          from: start + localFrom,
          to: start + localTo,
          insert,
        }],
      };
    }, { userEvent: 'input.type' });
    if (reload) {
      storeTyping(reload);
      return;
    }
    if (!found) {
      storeTyping(null);
      return;
    }
    storeTyping({
      ...current,
      from: start,
      text: replaceText(current.text, localFrom, localTo, edit.insert),
    });
  }, [getDeck, onEdit, slide.index, storeTyping]);

  const reloadTyping = useCallback(() => {
    const current = typingRef.current;
    if (!current) return;
    const deck = getDeck();
    const source = deck?.source ?? getSource();
    const freshSlide = deck?.slides[slide.index];
    const range = freshSlide && targetRange(source, freshSlide, current);
    if (!range) return void storeTyping(null);
    storeTyping({ ...current, from: range.from, text: source.slice(range.from, range.to) });
  }, [getDeck, getSource, slide.index, storeTyping]);

  const undoTyping = useCallback(() => {
    onUndo();
    reloadTyping();
  }, [onUndo, reloadTyping]);

  const redoTyping = useCallback(() => {
    onRedo();
    reloadTyping();
  }, [onRedo, reloadTyping]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.us-floating-bar, .us-typing-area, .us-typing-bar')) return;
      const point = { x: event.clientX, y: event.clientY };
      const hits = boxesAt(stage, event.clientX, event.clientY);
      const handle = target instanceof Element ? target.closest<HTMLElement>('.us-handle[data-edge]') : null;
      const edge = handle?.dataset.edge as Edge | undefined;
      let nextDrag: Drag;

      if (edge && selected !== null && slide.boxes[selected]) {
        const box = slide.boxes[selected]!;
        nextDrag = {
          kind: 'resize',
          pointerId: event.pointerId,
          start: point,
          startCell: cellAt(stage, grid, event.clientX, event.clientY),
          moved: false,
          area: null,
          hits,
          selectedAtStart: selected,
          boxIndex: selected,
          edge,
          original: { col: box.col, row: box.row },
        };
      } else if (hits.length > 0) {
        const boxIndex = selected !== null && hits.includes(selected) ? selected : hits[0]!;
        const box = slide.boxes[boxIndex];
        if (!box) return;
        if (selected !== boxIndex) {
          setSelected(boxIndex);
          lastPoint.current = null;
        }
        if (slideSelectedRef.current) onSlideSelect?.(false);
        onSelectSlide?.();
        onMoveCursor(box.range.from);
        frame.focus({ preventScroll: true });
        nextDrag = {
          kind: 'move',
          pointerId: event.pointerId,
          start: point,
          startCell: cellAt(stage, grid, event.clientX, event.clientY),
          moved: false,
          area: null,
          hits,
          selectedAtStart: selected,
          boxIndex,
          original: { col: box.col, row: box.row },
        };
      } else {
        setSelected(null);
        lastPoint.current = null;
        nextDrag = {
          kind: 'draw',
          pointerId: event.pointerId,
          start: point,
          startCell: cellAt(stage, grid, event.clientX, event.clientY),
          moved: false,
          area: null,
          hits,
          selectedAtStart: selected,
        };
      }

      try {
        frame.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      drag.current = nextDrag;
      event.preventDefault();
    };

    const finishDrag = (event: PointerEvent, commit: boolean) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
      frame.classList.remove('us-dragging');
      setGhost(null);

      const el = current.el;
      /** Puts the dragged box back where the slide has it. */
      const putBack = (glide: boolean) => {
        setDragging(false);
        if (!el || !el.isConnected) return;
        if (current.kind === 'resize') {
          el.style.setProperty('grid-column', `${current.original.col[0]} / ${current.original.col[1] + 1}`);
          el.style.setProperty('grid-row', `${current.original.row[0]} / ${current.original.row[1] + 1}`);
        }
        el.classList.remove('us-lifted');
        if (glide) {
          el.classList.add('us-settling');
          window.setTimeout(() => el.classList.remove('us-settling'), 200);
        }
        el.style.translate = '';
      };

      if (!commit) {
        putBack(false);
        return;
      }

      if (current.moved) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        });
        if (current.kind === 'draw') {
          setDragging(false);
          if (current.area) insert(current.area);
        } else if (current.area && !sameArea(current.area, current.original)) {
          // The box stays where it was let go until the slide is drawn again, then glides into its cells.
          if (el && current.kind === 'move') settle.current = { index: current.boxIndex, rect: el.getBoundingClientRect() };
          setSpan(current.boxIndex, current.area);
          // If the change could not be made, nothing is drawn again, so put the box back here.
          window.setTimeout(() => {
            if (!el?.isConnected) return;
            settle.current = null;
            putBack(true);
          }, 400);
        } else {
          putBack(true);
        }
        frame.focus({ preventScroll: true });
        return;
      }

      if (current.kind !== 'move') return;
      let next = current.boxIndex;
      if (
        current.selectedAtStart !== null &&
        lastPoint.current &&
        pointNear(lastPoint.current, current.start)
      ) {
        const index = current.hits.indexOf(current.selectedAtStart);
        if (index !== -1) next = current.hits[(index + 1) % current.hits.length]!;
      }
      setSelected(next);
      lastPoint.current = current.start;
      const box = slide.boxes[next];
      if (box) onMoveCursor(box.range.from);
    };

    /** Shows what is under the pointer: an outline on a box, and a cursor for what a press would do. */
    const showHover = (event: PointerEvent) => {
      const target = event.target;
      if (typingRef.current || (target instanceof Element && target.closest('.us-floating-bar, .us-typing-area, .us-typing-bar, .us-handle'))) {
        frame.style.cursor = '';
        setHover(null);
        return;
      }
      const hits = boxesAt(stage, event.clientX, event.clientY);
      const index = selected !== null && hits.includes(selected) ? selected : hits[0];
      const element = index === undefined ? null : boxElement(stage, index);
      if (index === undefined || !element) {
        frame.style.cursor = loosePieceAt(stage, slide, event.clientX, event.clientY) === undefined ? 'crosshair' : 'text';
        setHover(null);
        return;
      }
      frame.style.cursor = 'move';
      const rect = element.getBoundingClientRect();
      const bounds = frame.getBoundingClientRect();
      const next = { index, left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height };
      setHover((shown) => (shown && JSON.stringify(shown) === JSON.stringify(next) ? shown : next));
    };

    const onPointerLeave = () => {
      if (!drag.current) setHover(null);
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) showHover(event);
      if (!current || current.pointerId !== event.pointerId) return;
      if (event.buttons === 0) {
        finishDrag(event, false);
        return;
      }
      if (!current.moved && Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) < 4) return;
      const stageRect = stage.getBoundingClientRect();
      const cellWidth = stageRect.width / grid.cols;
      const cellHeight = stageRect.height / grid.rows;
      if (!current.moved) {
        current.moved = true;
        frame.classList.add('us-dragging');
        setDragging(true);
        if (slideSelectedRef.current) onSlideSelect?.(false);
        setHover(null);
        fontPopup.close();
        if (current.kind !== 'draw') {
          current.el = boxElement(stage, current.boxIndex) ?? undefined;
          current.el?.classList.remove('us-settling');
          current.el?.classList.add('us-lifted');
        }
      }
      const cell = cellAt(stage, grid, event.clientX, event.clientY);
      const dc = Math.round((event.clientX - current.start.x) / cellWidth);
      const dr = Math.round((event.clientY - current.start.y) / cellHeight);
      let area: GridArea;
      if (current.kind === 'move') {
        area = moveSpan(current.original.col, current.original.row, dc, dr, grid);
      } else if (current.kind === 'resize') {
        area = resizeSpan(current.original.col, current.original.row, current.edge, dc, dr, grid);
      } else {
        area = {
          col: [Math.min(current.startCell.col, cell.col), Math.max(current.startCell.col, cell.col)],
          row: [Math.min(current.startCell.row, cell.row), Math.max(current.startCell.row, cell.row)],
        };
      }
      if (current.kind === 'move' && current.el) {
        // The box itself follows the pointer; the dashed outline shows the cells it will land on.
        const scale = viewScale(stage);
        const { col, row } = current.original;
        const dx = clamp(event.clientX - current.start.x, -(col[0] - 1) * cellWidth, (grid.cols - col[1]) * cellWidth);
        const dy = clamp(event.clientY - current.start.y, -(row[0] - 1) * cellHeight, (grid.rows - row[1]) * cellHeight);
        current.el.style.translate = `${dx / scale}px ${dy / scale}px`;
      }
      if (current.area && sameArea(current.area, area)) return;
      if (current.kind === 'resize' && current.el) {
        // The box takes its new cells as the handle moves, so the text shows how it will wrap.
        current.el.style.setProperty('grid-column', `${area.col[0]} / ${area.col[1] + 1}`);
        current.el.style.setProperty('grid-row', `${area.row[0]} / ${area.row[1] + 1}`);
      }
      current.area = area;
      setGhost(area);
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (suppressClick.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.us-floating-bar, .us-typing-bar')) return;
      if (boxesAt(stage, event.clientX, event.clientY).length === 0) {
        onSelectSlide?.();
        if (!typingRef.current) onSlideSelect?.(true);
      }
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('.us-typing-area, .us-typing-bar')) return;
      const caret = { x: event.clientX, y: event.clientY };
      const freshDeck = getDeck();
      const freshSlide = freshDeck?.slides[slide.index];
      const looseIndex = freshSlide && loosePieceAt(
        stage,
        freshSlide,
        event.clientX,
        event.clientY,
      );
      if (looseIndex !== undefined) {
        event.preventDefault();
        onSelectSlide?.();
        beginTyping({ kind: 'loose', index: looseIndex }, freshDeck, caret);
        return;
      }
      const hits = boxesAt(stage, event.clientX, event.clientY);
      if (hits.length > 0) {
        const boxIndex = selected !== null && hits.includes(selected) ? selected : hits[0]!;
        event.preventDefault();
        onSelectSlide?.();
        beginTyping({ kind: 'box', index: boxIndex }, freshDeck, caret);
        return;
      }
      if (!isEmptyPoint(stage, event.clientX, event.clientY)) return;
      const cell = cellAt(stage, grid, event.clientX, event.clientY);
      insert(clampNewBox(cell.col, cell.row, 3, 2, grid));
      frame.focus({ preventScroll: true });
    };
    const onPointerUp = (event: PointerEvent) => finishDrag(event, true);
    const onPointerCancel = (event: PointerEvent) => finishDrag(event, false);
    const onLostPointerCapture = (event: PointerEvent) => finishDrag(event, false);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('.us-font-picker')) return;
      if (event.target instanceof Element && event.target.closest('.us-typing-area, .us-typing-bar')) return;
      if (typingRef.current && !typingAreaReady.current) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          storeTyping(null);
          frame.focus({ preventScroll: true });
          return;
        }
        if (event.isComposing || event.key === 'Dead' || event.key === 'Process') return;
        const altGraph = event.getModifierState('AltGraph');
        if ((event.ctrlKey || event.metaKey) && !altGraph) return;
        queuedTypingInput.current.push({
          key: event.key,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
        });
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && ((key === 'z' && !event.shiftKey) || key === 'y')) {
        event.preventDefault();
        event.stopPropagation();
        if (key === 'z') onUndo();
        else onRedo();
        return;
      }
      if (mod && key === 'z' && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        onRedo();
        return;
      }
      if (selected === null) {
        if (event.key === 'Escape' && slideSelectedRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onSlideSelect?.(false);
        }
        return;
      }
      if (event.target !== frame) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setSelected(null);
          lastPoint.current = null;
        }
        return;
      }
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key] as [number, number] | undefined;

      if (direction) {
        event.preventDefault();
        event.stopPropagation();
        withSelected((source, freshSlide, box) => {
          const [dc, dr] = direction;
          const area = event.shiftKey
            ? resizeSpan(box.col, box.row, dc === 0 ? 's' : 'e', dc, dr, freshSlide.grid)
            : moveSpan(box.col, box.row, dc, dr, freshSlide.grid);
          if (sameArea(area, { col: box.col, row: box.row })) return { changes: [] };
          return setBoxSpan(source, box, area.col, area.row, freshSlide.grid);
        });
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        remove();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        event.stopPropagation();
        duplicate();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSelected(null);
        lastPoint.current = null;
      } else if (event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        beginTyping({ kind: 'box', index: selected });
      }
    };

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerleave', onPointerLeave);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerCancel);
    frame.addEventListener('lostpointercapture', onLostPointerCapture);
    frame.addEventListener('click', onClick);
    frame.addEventListener('dblclick', onDoubleClick);
    frame.addEventListener('keydown', onKeyDown);
    return () => {
      frame.removeEventListener('pointerdown', onPointerDown);
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerleave', onPointerLeave);
      frame.removeEventListener('pointerup', onPointerUp);
      frame.removeEventListener('pointercancel', onPointerCancel);
      frame.removeEventListener('lostpointercapture', onLostPointerCapture);
      frame.removeEventListener('click', onClick);
      frame.removeEventListener('dblclick', onDoubleClick);
      frame.removeEventListener('keydown', onKeyDown);
    };
  }, [
    beginTyping, duplicate, fontPopup.close, frame, getDeck, grid, insert, onMoveCursor, onRedo, onSelectSlide,
    onSlideSelect, onUndo, remove, selected, setSpan, slide, stage, withSelected,
  ]);

  const box = selected === null ? undefined : slide.boxes[selected];
  const selectionStyle = geometry
    ? {
        left: geometry.anchor.left - geometry.bounds.left,
        top: geometry.anchor.top - geometry.bounds.top,
        width: geometry.anchor.width,
        height: geometry.anchor.height,
      }
    : undefined;

  return (
    <div className="us-edit-overlay">
      {showHint && active && !slideSelected && slide.boxes.length === 0 && (
        <p className="us-hint" aria-hidden="true">
          Drag on the slide to draw a box. Double-click text to edit it.
        </p>
      )}
      <div className="us-selection-status" aria-live="polite" aria-atomic="true">
        {selected === null ? '' : `Box ${selected + 1} selected`}
      </div>
      {ghost && (
        <>
          <div className="us-grid" style={gridStyle(stage, frame, grid)} aria-hidden="true" />
          <div className="us-ghost" style={areaStyle(stage, frame, grid, ghost)} aria-hidden="true" />
        </>
      )}
      {hover && !dragging && !typing && hover.index !== selected && (
        <div
          className="us-hover"
          style={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height }}
          aria-hidden="true"
        />
      )}
      {typing && typingRect && (
        <Suspense fallback={null}>
          <TypingArea
            key={typing.session}
            rect={typingRect}
            look={look}
            maxHeight={typingMaxHeight}
            caretAt={typing.caret}
            alignBarRight={typingRect.x + 180 > frame.clientWidth}
            text={typing.text}
            from={typing.from}
            onChange={changeTyping}
            onUndo={undoTyping}
            onRedo={redoTyping}
            onReady={(ready) => {
              typingAreaReady.current = ready;
            }}
            takeQueuedInput={takeQueuedTypingInput}
            onDone={() => {
              storeTyping(null);
              frame.focus({ preventScroll: true });
            }}
          />
        </Suspense>
      )}
      {slideSelected && active && !typing && !dragging && selected === null && (
        <SlideBar
          index={slide.index}
          count={slideCount}
          theme={theme}
          grid={slide.grid}
          deckGrid={deckGrid ?? slide.grid}
          align={slide.align}
          valign={slide.valign}
          {...slideActions}
        />
      )}
      {!typing && !dragging && box && geometry && (
        <>
          <div className="us-selection" data-box={selected} style={selectionStyle} aria-hidden="true">
            {HANDLES.map((edge) => <span key={edge} className={`us-handle us-handle-${edge}`} data-edge={edge} />)}
          </div>
          <FloatingBar
            box={box}
            theme={theme}
            anchor={geometry.anchor}
            bounds={geometry.bounds}
            onSet={setAttrs}
            fontSlot={(
              <div ref={fontContainer} className="us-font-control">
                <IconButton
                  ref={fontTrigger}
                  label="Font"
                  icon={Type}
                  aria-haspopup="dialog"
                  aria-expanded={fontPopup.open}
                  onClick={fontPopup.toggle}
                />
                {fontPopup.open && (
                  <FontPicker
                    value={box.font}
                    blocked={blocked}
                    onPick={(name) => {
                      setAttrs({ font: name });
                      fontPopup.close();
                    }}
                    onClose={fontPopup.close}
                  />
                )}
              </div>
            )}
            onFront={() => withSelected(
              (source, freshSlide, selectedBox) => bringToFront(source, freshSlide, selectedBox),
              (freshSlide) => freshSlide.boxes.length - 1,
            )}
            onBack={() => withSelected(
              (source, freshSlide, selectedBox) => sendToBack(source, freshSlide, selectedBox),
              () => 0,
            )}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        </>
      )}
    </div>
  );
}
