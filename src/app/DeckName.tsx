import { useEffect, useRef, useState } from 'react';

type Props = {
  name: string;
  disabled: boolean;
  onRename(title: string): void;
};

export function DeckName({ name, disabled, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const active = useRef(false);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      button.current?.focus();
    }
  }, [editing]);

  const start = () => {
    setValue(name);
    active.current = true;
    setEditing(true);
  };

  const finish = (focusButton = false) => {
    if (!active.current) return;
    active.current = false;
    restoreFocus.current = focusButton;
    setEditing(false);
    const title = value.trim();
    if (title !== '' && title !== name) onRename(title);
  };

  const cancel = () => {
    if (!active.current) return;
    active.current = false;
    restoreFocus.current = true;
    setEditing(false);
  };

  if (disabled) return <h1 className="toolbar-name">{name}</h1>;

  return (
    <h1 className="toolbar-name">
      {editing ? (
        <input
          ref={input}
          className="toolbar-name-input"
          aria-label="Deck name"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onBlur={() => finish()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finish(true);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <button
          ref={button}
          type="button"
          className="toolbar-name-button"
          aria-label={`Rename deck: ${name}`}
          onClick={start}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault();
              start();
            }
          }}
        >
          {name}
        </button>
      )}
    </h1>
  );
}
