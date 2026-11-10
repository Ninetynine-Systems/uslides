import {
  Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties,
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
import { clampNewBox, moveSpan, resizeSpan, type Edge, type GridArea } from '../../core/layout';
import type { Deck } from '../../core/parse';
import type { Box, Slide } from '../../core/slide';
import type { Grid, SourceRange } from '../../core/types';
import { FloatingBar } from './FloatingBar';
import { boxesAt, cellAt } from './stageGeometry';
import type { QueuedTypingKey, TypingAreaProps } from './TypingArea';
import { FontPicker } from '../FontPicker';
import { IconButton } from '../IconButton';

type OnEdit = (make: (deck: Deck) => EditResult | null, opts?: { userEvent?: string }) => void;
type Geometry = { anchor: DOMRect; bounds: DOMRect };
type Point = { x: number; y: number };
type TypingTarget = { kind: 'box'; index: number } | { kind: 'loose'; index: number };
type Typing = TypingTarget & { from: number; text: string; session: number };
type Drag = {
  pointerId: number;
  start: Point;
  startCell: { col: number; row: number };
  moved: boolean;
  area: GridArea | null;
  hits: number[];
  selectedAtStart: number | null;
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
};

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

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
}: OverlayProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [fontOpen, setFontOpen] = useState(false);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [typingRect, setTypingRect] = useState<DOMRect | null>(null);
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

  const beginTyping = useCallback((target: TypingTarget, deck = getDeck()): boolean => {
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
    });
    setSelected(target.kind === 'box' ? target.index : null);
    lastPoint.current = null;
    onMoveCursor(range.from);
    return true;
  }, [frame, getDeck, getSource, onMoveCursor, slide.index, storeTyping]);

  const takeQueuedTypingInput = useCallback(() => {
    const queued = queuedTypingInput.current;
    queuedTypingInput.current = [];
    return queued;
  }, []);

  useEffect(() => {
    if (active) return;
    setSelected(null);
    setFontOpen(false);
    storeTyping(null);
    lastPoint.current = null;
  }, [active, storeTyping]);

  useEffect(() => {
    if (lastSlide.current === slide.index) return;
    lastSlide.current = slide.index;
    setSelected(null);
    setFontOpen(false);
    storeTyping(null);
    lastPoint.current = null;
  }, [slide.index, storeTyping]);

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
      if (target instanceof Element && target.closest('.us-typing-area')) return;
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

  const updateGeometry = useCallback(() => {
    if (!stage.isConnected) return;
    const bounds = frame.getBoundingClientRect();
    const selectedBox = selected === null
      ? null
      : stage.querySelector<HTMLElement>(`:scope > .us-box[data-box="${selected}"]`);
    setGeometry(selectedBox ? { anchor: selectedBox.getBoundingClientRect(), bounds } : null);

    if (!typing) return void setTypingRect(null);
    let anchor: DOMRect | undefined;
    if (typing.kind === 'box') {
      anchor = stage.querySelector<HTMLElement>(`:scope > .us-box[data-box="${typing.index}"]`)?.getBoundingClientRect();
    } else {
      anchor = boundsOf(loosePieceElements(stage, slide, typing.index));
      if (!anchor) {
        setTypingRect(null);
        storeTyping(null);
        return;
      }
    }
    setTypingRect(anchor ? localRect(anchor, bounds) : null);
  }, [frame, selected, slide, stage, storeTyping, typing]);

  useEffect(() => {
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
      if (target instanceof Element && target.closest('.us-floating-bar, .us-typing-area')) return;
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

      if (!commit) return;

      if (current.moved) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        });
        if (current.area) {
          if (current.kind === 'draw') insert(current.area);
          else if (!sameArea(current.area, current.original)) setSpan(current.boxIndex, current.area);
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

    const onPointerMove = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (event.buttons === 0) {
        finishDrag(event, false);
        return;
      }
      if (!current.moved && Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) < 4) return;
      current.moved = true;
      frame.classList.add('us-dragging');
      const cell = cellAt(stage, grid, event.clientX, event.clientY);
      const stageRect = stage.getBoundingClientRect();
      const dc = Math.round((event.clientX - current.start.x) / (stageRect.width / grid.cols));
      const dr = Math.round((event.clientY - current.start.y) / (stageRect.height / grid.rows));
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
      current.area = area;
      setGhost(area);
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (suppressClick.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.us-floating-bar')) return;
      if (boxesAt(stage, event.clientX, event.clientY).length === 0) onSelectSlide?.();
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('.us-typing-area')) return;
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
        beginTyping({ kind: 'loose', index: looseIndex }, freshDeck);
        return;
      }
      const hits = boxesAt(stage, event.clientX, event.clientY);
      if (hits.length > 0) {
        const boxIndex = selected !== null && hits.includes(selected) ? selected : hits[0]!;
        event.preventDefault();
        onSelectSlide?.();
        beginTyping({ kind: 'box', index: boxIndex }, freshDeck);
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
      if (event.target instanceof Element && event.target.closest('.us-typing-area')) return;
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
      if (selected === null) return;
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
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerCancel);
    frame.addEventListener('lostpointercapture', onLostPointerCapture);
    frame.addEventListener('click', onClick);
    frame.addEventListener('dblclick', onDoubleClick);
    frame.addEventListener('keydown', onKeyDown);
    return () => {
      frame.removeEventListener('pointerdown', onPointerDown);
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerup', onPointerUp);
      frame.removeEventListener('pointercancel', onPointerCancel);
      frame.removeEventListener('lostpointercapture', onLostPointerCapture);
      frame.removeEventListener('click', onClick);
      frame.removeEventListener('dblclick', onDoubleClick);
      frame.removeEventListener('keydown', onKeyDown);
    };
  }, [
    beginTyping, duplicate, frame, getDeck, grid, insert, onMoveCursor, onRedo, onSelectSlide, onUndo, remove,
    selected, setSpan, slide.boxes, slide.index, stage, withSelected,
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
      {showHint && active && slide.boxes.length === 0 && (
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
      {typing && typingRect && (
        <Suspense fallback={null}>
          <TypingArea
            key={typing.session}
            rect={typingRect}
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
      {!typing && box && geometry && (
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
              <div className="us-font-control">
                <IconButton
                  label="Font"
                  icon={Type}
                  aria-haspopup="dialog"
                  aria-expanded={fontOpen}
                  onClick={() => setFontOpen((open) => !open)}
                />
                {fontOpen && (
                  <FontPicker
                    value={box.font}
                    blocked={blocked}
                    onPick={(name) => {
                      setAttrs({ font: name });
                      setFontOpen(false);
                    }}
                    onClose={() => setFontOpen(false)}
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
