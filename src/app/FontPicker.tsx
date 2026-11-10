import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { X } from 'lucide-react';
import {
  allFamilies,
  getCatalogVersion,
  loadCatalog,
  searchFamilies,
  subscribeCatalog,
  type Group,
} from '../fonts/catalog';
import { setCssFamilyName } from '../fonts/css';
import { IconButton } from './IconButton';

export type FontPickerProps = {
  value?: string;
  blocked: boolean;
  onPick(name: string | null): void;
  onClose(): void;
};

const ROW_HEIGHT = 44;
const DEFAULT_LIST_HEIGHT = 308;
const OVERSCAN = 3;

const GROUPS: { value: '' | Group; label: string }[] = [
  { value: '', label: 'All styles' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans-serif', label: 'Sans serif' },
  { value: 'display', label: 'Display' },
  { value: 'handwriting', label: 'Handwriting' },
  { value: 'monospace', label: 'Monospace' },
];

function previewUrl(name: string): string {
  const family = encodeURIComponent(name).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(name)}`;
}

function previewFamily(name: string): string {
  return `uslides-preview-${name}`;
}

function FontOption(props: {
  id: string;
  index: number;
  name: string | null;
  active: boolean;
  selected: boolean;
  previews: boolean;
  requestPreview(name: string): void;
  onActivate(index: number): void;
  onPick(): void;
}) {
  const { id, index, name, active, selected, previews, requestPreview, onActivate, onPick } = props;
  const row = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = row.current;
    if (!element || !name || !previews) return;
    const show = () => {
      requestPreview(name);
    };
    if (!('IntersectionObserver' in window)) {
      show();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) show();
    }, { threshold: 0.01 });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [name, previews, requestPreview]);

  const style: CSSProperties = {
    top: index * ROW_HEIGHT,
    height: ROW_HEIGHT,
    fontFamily: name && previews ? `"${previewFamily(name)}", var(--us-font)` : undefined,
  };
  return (
    <button
      ref={row}
      id={id}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      className={`us-font-option${active ? ' active' : ''}`}
      style={style}
      onMouseMove={() => onActivate(index)}
      onClick={onPick}
    >
      {name ?? 'Theme font'}
    </button>
  );
}

export function FontPicker({ value, blocked, onPick, onClose }: FontPickerProps) {
  const titleId = useId();
  const listId = useId();
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const previewStyles = useRef(new Map<string, HTMLStyleElement | null>());
  const previewsActive = useRef(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const catalogVersion = useSyncExternalStore(subscribeCatalog, getCatalogVersion, getCatalogVersion);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group | undefined>();
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(DEFAULT_LIST_HEIGHT);
  const [showBlockedPreviews, setShowBlockedPreviews] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const previews = !blocked || showBlockedPreviews;
  const families = useMemo(
    () => (query === '' && !group ? allFamilies() : searchFamilies(query, group)),
    [catalogVersion, group, query],
  );
  const count = families.length + 1;
  const activeIndex = Math.min(active, count - 1);

  const requestPreview = useCallback((name: string) => {
    if (previewStyles.current.has(name)) return;
    previewStyles.current.set(name, null);
    void fetch(previewUrl(name), { mode: 'cors' }).then(async (response) => {
      if (!response.ok) throw new Error('Font preview request failed');
      const style = document.createElement('style');
      style.dataset.uslidesFontPreview = name;
      style.textContent = setCssFamilyName(await response.text(), previewFamily(name));
      if (!previewsActive.current) return;
      previewStyles.current.set(name, style);
      document.head.append(style);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    previewsActive.current = true;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    let mounted = true;
    void loadCatalog().catch(() => {
      if (mounted) setCatalogError(true);
    });
    search.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      mounted = false;
      previewsActive.current = false;
      document.removeEventListener('keydown', closeOnEscape, true);
      for (const style of previewStyles.current.values()) style?.remove();
      previewStyles.current.clear();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (active !== activeIndex) setActive(activeIndex);
  }, [active, activeIndex]);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => setListHeight(element.clientHeight || DEFAULT_LIST_HEIGHT);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resetList = () => {
    setActive(0);
    setScrollTop(0);
    if (list.current) list.current.scrollTop = 0;
  };
  const optionId = (index: number) => `${listId}-option-${index}`;
  const scrollTo = (index: number) => {
    const element = list.current;
    if (!element) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
  };
  const move = (step: number) => {
    const next = Math.min(Math.max(0, activeIndex + step), count - 1);
    setActive(next);
    scrollTo(next);
  };
  const pickAt = (index: number) => {
    if (index === 0) {
      onPick(null);
      return;
    }
    const family = families[index - 1];
    if (family) onPick(family.name);
  };
  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pickAt(active);
    }
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(count, Math.ceil((scrollTop + listHeight) / ROW_HEIGHT) + OVERSCAN);
  const visible = Array.from({ length: last - first }, (_, offset) => first + offset);

  return (
    <div
      className="us-font-picker"
      role="dialog"
      aria-labelledby={titleId}
    >
      <div className="us-font-picker-head">
        <h2 id={titleId}>Font picker</h2>
        <IconButton label="Close font picker" icon={X} onClick={onClose} />
      </div>
      <div className="us-font-picker-controls">
        <input
          ref={search}
          type="search"
          role="combobox"
          aria-label="Search fonts"
          aria-controls={listId}
          aria-expanded="true"
          aria-activedescendant={optionId(activeIndex)}
          placeholder="Search fonts"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            resetList();
          }}
          onKeyDown={onSearchKeyDown}
        />
        <select
          aria-label="Style group"
          value={group ?? ''}
          onChange={(event) => {
            setGroup(event.currentTarget.value === '' ? undefined : event.currentTarget.value as Group);
            resetList();
          }}
        >
          {GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      {catalogError && <p className="us-font-catalog-error">Could not load the font list.</p>}
      {blocked && !showBlockedPreviews && (
        <div className="us-font-preview-choice">
          <span>Font previews are hidden.</span>
          <button
            type="button"
            onClick={() => {
              setShowBlockedPreviews(true);
              requestAnimationFrame(() => search.current?.focus());
            }}
          >
            Show previews
          </button>
        </div>
      )}
      <div
        ref={list}
        id={listId}
        className="us-font-list"
        role="listbox"
        aria-label="Fonts"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="us-font-list-inner" style={{ height: count * ROW_HEIGHT }}>
          {visible.map((index) => {
            const name = index === 0 ? null : families[index - 1]!.name;
            return (
              <FontOption
                key={name ?? 'theme'}
                id={optionId(index)}
                index={index}
                name={name}
                active={activeIndex === index}
                selected={name === null ? value === undefined : name.toLowerCase() === value?.toLowerCase()}
                previews={previews}
                requestPreview={requestPreview}
                onActivate={setActive}
                onPick={() => pickAt(index)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
