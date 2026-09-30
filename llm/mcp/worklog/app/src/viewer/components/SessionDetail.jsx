import { useEffect, useState } from 'react';
import { elapsed, elapsedBetween } from './elapsed.js';
import { LogEntry } from './LogEntry.jsx';

function formatStarted(createdAt) {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return createdAt;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} at ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function orderedEntries(entries = []) {
  return entries
    .map((entry, index) => ({ entry, index, timestamp: Date.parse(entry.time) }))
    .sort((left, right) => {
      const leftValid = Number.isFinite(left.timestamp);
      const rightValid = Number.isFinite(right.timestamp);
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      if (leftValid && left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

function peerDuration(peer) {
  if (peer.createdAt)
    return peer.completedAt
      ? elapsedBetween(peer.createdAt, peer.completedAt)
      : elapsed(peer.createdAt);
  return peer.duration ?? 'unavailable';
}

function peerStatus(peer) {
  return peer.complete ? 'Closed' : 'Open';
}

function peerSubtitle(peer) {
  const started = peer.createdAt ? formatStarted(peer.createdAt) : 'unavailable';
  return `${peerStatus(peer)} - Started ${started} - Duration ${peerDuration(peer)}`;
}

export function SessionDetail({ session }) {
  const [, tick] = useState(0);
  const [expandedPeers, setExpandedPeers] = useState({});
  useEffect(() => {
    setExpandedPeers({});
  }, [session?.orchestrationId]);
  useEffect(() => {
    if (!session || session.complete || !Number.isFinite(Date.parse(session.createdAt)))
      return undefined;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [session]);
  if (!session) return <p>Select a session.</p>;
  const peers = session.peers ?? [];
  const closedPeers = peers.filter((peer) => peer.complete).length;
  return (
    <article className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">{session.goal}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {session.complete ? 'Closed' : 'Open'} · Started {formatStarted(session.createdAt)} ·
        Duration{' '}
        {session.createdAtSource && !session.complete
          ? elapsed(session.createdAt)
          : session.duration}
      </p>
      <h3 className="mt-6 text-lg font-semibold">Plan</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {(session.steps ?? []).map((step, index) => (
          <li key={`${step}-${index}`}>{step}</li>
        ))}
      </ol>
      <h3 className="mt-6 text-lg font-semibold">
        Peers ({closedPeers}/{peers.length})
      </h3>
      <ul className="mt-2 space-y-2">
        {peers.map((peer) => {
          const panelId = `peer-entries-${session.orchestrationId}-${peer.id}`;
          return (
            <li key={peer.id} className="min-w-0">
              <button
                type="button"
                className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2.5 text-left transition hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
                aria-expanded={Boolean(expandedPeers[peer.id])}
                aria-controls={panelId}
                onClick={() =>
                  setExpandedPeers((current) => ({ ...current, [peer.id]: !current[peer.id] }))
                }
              >
                <strong
                  className="block break-words whitespace-normal text-sm font-semibold text-slate-800"
                  title={peer.goal}
                >
                  {peer.goal}
                </strong>
                <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 break-words text-xs text-slate-600">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      peer.complete ? 'bg-slate-400' : 'bg-blue-500 motion-safe:animate-pulse'
                    }`}
                  />
                  <span>{peer.actor}</span> · <span>{peer.id}</span> ·{' '}
                  <span>{peerDuration(peer)}</span>
                </span>
              </button>
              {expandedPeers[peer.id] && (
                <div
                  id={panelId}
                  className="mt-2 min-w-0 space-y-4 pl-5"
                  aria-label={`${peer.actor} worklog`}
                >
                  <p className="break-words text-sm text-slate-600">{peerSubtitle(peer)}</p>
                  <div>
                    <h4 className="font-semibold">Plan</h4>
                    <ol className="mt-1 list-decimal space-y-1 pl-5">
                      {(peer.plan ?? []).map((step, index) => (
                        <li key={`${step}-${index}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-semibold">Log entries</h4>
                    <ul className="mt-1 space-y-2">
                      {orderedEntries(peer.entries).map((entry, entryIndex) => (
                        <LogEntry entry={entry} key={`${entry.time}-${entryIndex}`} />
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <h3 className="mt-6 text-lg font-semibold">Log entries</h3>
      <ol className="mt-2 space-y-2 pl-0">
        {orderedEntries(session.entries).map((entry, index) => (
          <LogEntry entry={entry} key={`${entry.time}-${index}`} />
        ))}
      </ol>
    </article>
  );
}
