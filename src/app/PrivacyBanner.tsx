import { useId, useState } from 'react';

type Props = {
  hosts: string[];
  onAllowOnce(): void;
  onAlwaysAllow(): void;
};

export function PrivacyBanner({ hosts, onAllowOnce, onAlwaysAllow }: Props) {
  const [showHosts, setShowHosts] = useState(false);
  const listId = useId();
  const n = hosts.length;
  return (
    <aside className="privacy-banner" aria-label="Other websites blocked">
      <p>
        {`This deck wants to load images and fonts from ${n} other ${n === 1 ? 'website' : 'websites'}. They are blocked until you allow them.`}
      </p>
      <div className="privacy-actions">
        <button type="button" onClick={onAllowOnce}>Allow once</button>
        <button type="button" onClick={onAlwaysAllow}>Always allow for this deck</button>
        <button
          type="button"
          aria-expanded={showHosts}
          aria-controls={listId}
          onClick={() => setShowHosts((shown) => !shown)}
        >
          Show websites
        </button>
      </div>
      {showHosts && (
        <ul id={listId}>
          {hosts.map((host) => <li key={host}>{host}</li>)}
        </ul>
      )}
    </aside>
  );
}
