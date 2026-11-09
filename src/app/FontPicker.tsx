import {
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

function FontOption(props: {
  id: string;
  index: number;
  name: string | null;
  active: boolean;
  selected: boolean;
  previews: boolean;
  onActivate(index: number): void;
  onPick(): void;
}) {
  const { id, index, name, active, selected, previews, onActivate, onPick } = props;
  const row = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = row.current;
    if (!element || !name || !previews) return;
    let link: HTMLLinkElement | undefined;
    const show = () => {
      if (link) return;
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = previewUrl(name);
      link.dataset.uslidesFontPreview = name;
      document.head.append(link);
    };
    if (!('IntersectionObserver' in window)) {
      show();
      return () => link?.remove();
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) show();
    }, { threshold: 0.01 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      link?.remove();
    };
  }, [name, previews]);

  const style: CSSProperties = {
    top: index * ROW_HEIGHT,
    height: ROW_HEIGHT,
    fontFamily: name && previews ? `"${name}", var(--us-font)` : undefined,
  };
  return (
    <button
      ref={row}
      id={id}
      type="button"
      role="option"
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const catalogVersion = useSyncExternalStore(subscribeCatalog, getCatalogVersion, getCatalogVersion);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group | undefined>();
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(DEFAULT_LIST_HEIGHT);
  const [showBlockedPreviews, setShowBlockedPreviews] = useState(false);
  const previews = !blocked || showBlockedPreviews;
  const families = useMemo(
    () => (query === '' && !group ? allFamilies() : searchFamilies(query, group)),
    [catalogVersion, group, query],
  );
  const count = families.length + 1;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    void loadCatalog().catch(() => undefined);
    search.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape, true);
      previousFocus?.focus();
    };
  }, []);

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
    const next = Math.min(Math.max(0, active + step), count - 1);
    setActive(next);
    scrollTo(next);
  };
  const pickAt = (index: number) => onPick(index === 0 ? null : families[index - 1]?.name ?? null);
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
          aria-label="Search fonts"
          aria-controls={listId}
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
        aria-activedescendant={optionId(active)}
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
                active={active === index}
                selected={name === null ? value === undefined : name.toLowerCase() === value?.toLowerCase()}
                previews={previews}
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
