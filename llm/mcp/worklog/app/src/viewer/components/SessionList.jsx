import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { elapsed, hasValidCreatedAt } from './elapsed.js';

function formatSessionDate(createdAt) {
  if (!hasValidCreatedAt(createdAt)) return null;
  const date = new Date(createdAt);
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][date.getMonth()];
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

function compactWorkingDirectory(directory) {
  if (typeof directory !== 'string' || !directory.trim()) return null;
  const segments = directory.split(/[\\/]+/).filter(Boolean);
  if (!segments.length) return null;
  return segments.slice(-2).join('/');
}

export function SessionList({ sessions, selectedId, onSelect }) {
  const [, tick] = useState(0);
  const [enteringIds, setEnteringIds] = useState(new Set());
  const itemRefs = useRef(new Map());
  const previousRects = useRef(new Map());
  const seenIds = useRef(new Set());
  const enterAnimationFrame = useRef(null);
  const reorderAnimationFrames = useRef(new Set());
  const hasLiveSession = sessions.some(
    (session) => !session.complete && hasValidCreatedAt(session.createdAt),
  );

  useEffect(() => {
    if (!hasLiveSession) return undefined;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [hasLiveSession]);

  useLayoutEffect(() => {
    const currentIds = new Set(sessions.map((session) => session.orchestrationId));
    const newlyVisibleIds = sessions
      .map((session) => session.orchestrationId)
      .filter((id) => !seenIds.current.has(id));

    if (seenIds.current.size > 0 && newlyVisibleIds.length > 0) {
      setEnteringIds(new Set(newlyVisibleIds));
      if (enterAnimationFrame.current !== null) {
        cancelAnimationFrame(enterAnimationFrame.current);
      }
      enterAnimationFrame.current = requestAnimationFrame(() => {
        setEnteringIds(new Set());
        enterAnimationFrame.current = null;
      });
    }

    seenIds.current = currentIds;
    const nextRects = new Map();
    for (const id of currentIds) {
      const element = itemRefs.current.get(id);
      if (!element) continue;
      const nextRect = element.getBoundingClientRect();
      nextRects.set(id, nextRect);
      const previousRect = previousRects.current.get(id);
      if (
        !previousRect ||
        previousRect.top === nextRect.top ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      ) {
        continue;
      }
      const offset = previousRect.top - nextRect.top;
      element.classList.add('worklog-card-reorder');
      element.style.transform = `translateY(${offset}px)`;
      element.style.transition = 'none';
      const frame = requestAnimationFrame(() => {
        reorderAnimationFrames.current.delete(frame);
        element.style.transform = '';
        element.style.transition = '';
        element.classList.remove('worklog-card-reorder');
      });
      reorderAnimationFrames.current.add(frame);
    }
    previousRects.current = nextRects;

    return () => {
      for (const frame of reorderAnimationFrames.current) {
        cancelAnimationFrame(frame);
      }
      reorderAnimationFrames.current.clear();
    };
  }, [sessions]);

  useEffect(
    () => () => {
      if (enterAnimationFrame.current !== null) {
        cancelAnimationFrame(enterAnimationFrame.current);
      }
    },
    [],
  );

  return (
    <ul className="space-y-2">
      {sessions.map((session) => (
        <li
          key={session.orchestrationId}
          ref={(element) => {
            if (element) itemRefs.current.set(session.orchestrationId, element);
            else itemRefs.current.delete(session.orchestrationId);
          }}
          className={enteringIds.has(session.orchestrationId) ? 'worklog-card-enter' : undefined}
        >
          <button
            className={`w-full rounded-lg border p-4 text-left transition ${
              selectedId === session.orchestrationId
                ? 'border-slate-900 bg-slate-100'
                : 'border-slate-300 bg-white hover:border-slate-500'
            }`}
            aria-pressed={selectedId === session.orchestrationId}
            onClick={() => onSelect(session.orchestrationId)}
          >
            <span className="flex items-start justify-between gap-3 text-xs font-medium text-slate-500">
              <span className="min-w-0 truncate">
                {compactWorkingDirectory(session.workingDirectory) ?? null}
              </span>
              {formatSessionDate(session.createdAt) ? (
                <span className="shrink-0">{formatSessionDate(session.createdAt)}</span>
              ) : null}
            </span>
            <strong className="mt-1 block min-w-0 text-center text-base font-semibold text-slate-800">
              {session.goal}
            </strong>
            <span className="sr-only">{session.complete ? 'Closed session' : 'Open session'}</span>
            <span className="mt-1 flex items-center justify-center gap-2 text-center text-sm text-slate-600">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  session.complete ? 'bg-slate-400' : 'bg-blue-500 motion-safe:animate-pulse'
                }`}
              />
              <span>{session.actor}</span> · <span>{session.orchestrationId}</span> ·{' '}
              <span>
                {!session.complete && hasValidCreatedAt(session.createdAt)
                  ? elapsed(session.createdAt)
                  : session.duration}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
