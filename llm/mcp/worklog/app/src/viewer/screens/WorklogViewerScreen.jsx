import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SessionList } from '../components/SessionList.jsx';
import { SessionDetail } from '../components/SessionDetail.jsx';

const DATE_FILTERS = [
  { key: '24h', label: 'Last 24 hours', hours: 24 },
  { key: '3', label: 'Last 3 days', hours: 72 },
  { key: '7', label: 'Last 7 days', hours: 168 },
  { key: '30', label: 'Last 30 days', hours: 720 },
  { key: 'all', label: 'All-time' },
];
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
];
const SORT_OPTIONS = [
  { key: 'created', label: 'Creation time' },
  { key: 'updated', label: 'Last updated' },
];

export function filterSessions(sessions, dateFilter, statusFilter, now = Date.now()) {
  const dateOption = DATE_FILTERS.find((filter) => filter.key === dateFilter);
  const cutoff = dateOption?.hours ? now - dateOption.hours * 60 * 60 * 1000 : null;
  return sessions.filter((session) => {
    const statusMatches =
      statusFilter === 'all' || (statusFilter === 'closed' ? session.complete : !session.complete);
    if (!statusMatches) return false;
    if (!cutoff) return true;
    const createdAt = Date.parse(session.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}

export function sortSessions(sessions, sortFilter) {
  if (sortFilter === 'default') return sessions;
  const field = sortFilter === 'created' ? 'createdAt' : 'updatedAt';
  return [...sessions].sort((a, b) => {
    const aTime = Date.parse(a[field]);
    const bTime = Date.parse(b[field]);
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && aTime !== bTime) return bTime - aTime;
    return a.orchestrationId.localeCompare(b.orchestrationId);
  });
}

function DisclosureSelector({ id, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const menuId = `${id}-menu`;
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:border-slate-500"
        aria-label={`${label}: ${value.label}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {value.label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`${label} options`}
          className="absolute z-10 mt-1 min-w-full rounded-md border border-slate-300 bg-white p-1 shadow-lg"
        >
          <div className="px-2 py-1 text-xs font-semibold text-slate-500">
            {label === 'Sort' ? 'Sort By' : label}
          </div>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={option.key === value.key}
              className="block w-full whitespace-nowrap rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
              onClick={() => {
                onChange(option.key);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const defaultFetcher = () =>
  fetch('/api/worklogs').then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load worklogs (${response.status})`);
    return response.json();
  });
const defaultRevisionFetcher = () =>
  fetch('/api/worklogs/revision').then((response) => response.json());

export function WorklogViewerScreen({
  fetcher = defaultFetcher,
  revisionFetcher = defaultRevisionFetcher,
  eventSourceFactory = (url) => new EventSource(url),
  refreshInterval = 3000,
}) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: { sessions: [] },
    selectedId: null,
  });
  const [dateFilter, setDateFilter] = useState('24h');
  const [statusFilter, setStatusFilter] = useState('open');
  const [sortFilter, setSortFilter] = useState('created');
  const inFlight = useRef(false);
  const queuedRefresh = useRef(false);
  const revisionRef = useRef(-1);
  const refresh = useCallback(
    async (initial = false) => {
      if (inFlight.current) {
        queuedRefresh.current = true;
        return;
      }
      inFlight.current = true;
      setState((current) => ({ ...current, loading: initial, error: null }));
      try {
        const data = await fetcher();
        setState((current) => ({
          loading: false,
          error: null,
          data,
          selectedId: data.sessions.some((s) => s.orchestrationId === current.selectedId)
            ? current.selectedId
            : (data.sessions[0]?.orchestrationId ?? null),
        }));
      } catch (error) {
        setState((current) => ({ ...current, loading: false, error: error.message }));
      } finally {
        inFlight.current = false;
        if (queuedRefresh.current) {
          queuedRefresh.current = false;
          refresh();
        }
      }
    },
    [fetcher],
  );
  useEffect(() => {
    refresh(true);
  }, [refresh]);
  useEffect(() => {
    let disposed = false;
    let source;
    let eventSource;
    const request = (revision) => {
      if (!disposed && revision > revisionRef.current) {
        revisionRef.current = revision;
        refresh();
      }
    };
    let revisionHandler;
    try {
      source = eventSourceFactory('/api/worklogs/events');
      eventSource = source;
      revisionHandler = (event) => request(Number(JSON.parse(event.data).revision));
      source.addEventListener('revision', revisionHandler);
      source.onerror = () => {
        source.close?.();
        source = undefined;
      };
    } catch {
      source = undefined;
    }
    const timer = setInterval(async () => {
      if (source || disposed) return;
      try {
        request(Number((await revisionFetcher()).revision));
      } catch {
        /* retry next interval */
      }
    }, refreshInterval);
    return () => {
      disposed = true;
      clearInterval(timer);
      if (eventSource && revisionHandler)
        eventSource.removeEventListener('revision', revisionHandler);
      eventSource?.close?.();
    };
  }, [eventSourceFactory, refresh, refreshInterval, revisionFetcher]);
  const visibleSessions = useMemo(
    () => sortSessions(filterSessions(state.data.sessions, dateFilter, statusFilter), sortFilter),
    [state.data.sessions, dateFilter, statusFilter, sortFilter],
  );
  const selectedVisible = visibleSessions.some(
    (session) => session.orchestrationId === state.selectedId,
  );
  useEffect(() => {
    if (!selectedVisible) {
      setState((current) => ({
        ...current,
        selectedId: visibleSessions[0]?.orchestrationId ?? null,
      }));
    }
  }, [selectedVisible, visibleSessions]);
  const selected = visibleSessions.find((session) => session.orchestrationId === state.selectedId);
  return (
    <main className="mx-auto max-w-6xl p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Worklogs</h1>
          <div
            className="mt-3 mb-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Worklog controls"
          >
            <DisclosureSelector
              id="date-selector"
              label="Date"
              value={DATE_FILTERS.find((filter) => filter.key === dateFilter)}
              options={DATE_FILTERS}
              onChange={setDateFilter}
            />
            <DisclosureSelector
              id="status-selector"
              label="Status"
              value={STATUS_FILTERS.find((filter) => filter.key === statusFilter)}
              options={STATUS_FILTERS}
              onChange={setStatusFilter}
            />
            <DisclosureSelector
              id="sort-selector"
              label="Sort"
              value={SORT_OPTIONS.find((filter) => filter.key === sortFilter)}
              options={SORT_OPTIONS}
              onChange={setSortFilter}
            />
          </div>
        </div>
      </header>
      {state.loading && <p role="status">Loading…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {!state.loading && !state.error && (
        <div className="grid gap-8 md:grid-cols-[20rem_1fr]">
          <nav>
            <SessionList
              sessions={visibleSessions}
              selectedId={state.selectedId}
              onSelect={(selectedId) => setState((current) => ({ ...current, selectedId }))}
            />
          </nav>
          <SessionDetail session={selected} />
        </div>
      )}
    </main>
  );
}
