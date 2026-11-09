import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bringToFront,
  deleteBox,
  duplicateBox,
  sendToBack,
  setBoxAttrs,
  setBoxSpan,
  type EditResult,
} from '../../core/edit';
import { moveSpan, resizeSpan } from '../../core/layout';
import type { Deck } from '../../core/parse';
import type { Box, Slide } from '../../core/slide';
import type { Grid } from '../../core/types';
import { FloatingBar } from './FloatingBar';
import { boxesAt } from './stageGeometry';

type OnEdit = (make: (deck: Deck) => EditResult | null, opts?: { userEvent?: string }) => void;
type Geometry = { anchor: DOMRect; bounds: DOMRect };

export type OverlayProps = {
  stage: HTMLElement;
  slide: Slide;
  grid: Grid;
  theme: 'light' | 'dark';
  onEdit: OnEdit;
  onMoveCursor(pos: number): void;
  onSelectSlide?(): void;
  /** Only the current slide may keep the one selection shared by the preview. */
  active?: boolean;
};

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

function pointNear(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= 4;
}

export function Overlay({
  stage,
  slide,
  theme,
  onEdit,
  onMoveCursor,
  onSelectSlide,
  active = true,
}: OverlayProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const lastSlide = useRef(slide.index);
  const frame = stage.parentElement as HTMLElement;

  useEffect(() => {
    if (active) return;
    setSelected(null);
    lastPoint.current = null;
  }, [active]);

  useEffect(() => {
    if (lastSlide.current === slide.index) return;
    lastSlide.current = slide.index;
    setSelected(null);
    lastPoint.current = null;
  }, [slide.index]);

  const updateGeometry = useCallback(() => {
    if (selected === null) return void setGeometry(null);
    const box = stage.querySelector<HTMLElement>(`:scope > .us-box[data-box="${selected}"]`);
    setGeometry(box ? { anchor: box.getBoundingClientRect(), bounds: frame.getBoundingClientRect() } : null);
  }, [frame, selected, stage]);

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
      onEdit((deck) => {
        const freshSlide = deck.slides[slide.index];
        const box = freshSlide?.boxes[selected];
        if (!freshSlide || !box) return null;
        if (selectionAfter) next = selectionAfter(freshSlide) ?? selected;
        return make(deck.source, freshSlide, box);
      });
      setSelected(next);
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

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.us-floating-bar')) return;
      const hits = boxesAt(stage, event.clientX, event.clientY);
      if (hits.length === 0) {
        setSelected(null);
        lastPoint.current = null;
        return;
      }

      onSelectSlide?.();
      let next = hits[0]!;
      const point = { x: event.clientX, y: event.clientY };
      if (selected !== null && lastPoint.current && pointNear(lastPoint.current, point)) {
        const current = hits.indexOf(selected);
        if (current !== -1) next = hits[(current + 1) % hits.length]!;
      }
      setSelected(next);
      lastPoint.current = point;
      const box = slide.boxes[next];
      if (box) onMoveCursor(box.range.from);
      frame.focus({ preventScroll: true });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.us-floating-bar')) return;
      if (boxesAt(stage, event.clientX, event.clientY).length === 0) onSelectSlide?.();
    };

    const onKeyDown = (event: KeyboardEvent) => {
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
      } else if (event.key === 'Enter') {
        // Typing on the slide is added in a later task. Keep Enter from moving focus meanwhile.
        event.preventDefault();
        event.stopPropagation();
      }
    };

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('click', onClick);
    frame.addEventListener('keydown', onKeyDown);
    return () => {
      frame.removeEventListener('pointerdown', onPointerDown);
      frame.removeEventListener('click', onClick);
      frame.removeEventListener('keydown', onKeyDown);
    };
  }, [duplicate, frame, onMoveCursor, onSelectSlide, remove, selected, slide.boxes, stage, withSelected]);

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
      {box && geometry && (
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
