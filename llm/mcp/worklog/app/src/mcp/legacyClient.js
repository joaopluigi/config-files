export const defaultFetcher = () =>
  globalThis.fetch('/api/worklogs').then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load worklogs (${response.status})`);
    return response.json();
  });

export const defaultRevisionFetcher = () =>
  globalThis.fetch('/api/worklogs/revision').then((response) => response.json());

export const defaultStreamFactory = (url) => new globalThis.EventSource(url);

export function startLegacyRefresh({
  refresh,
  refreshInterval,
  revisionFetcher,
  eventSourceFactory,
}) {
  let disposed = false;
  let source;
  let eventSource;
  const revisionRef = { current: -1 };
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
  const timer = globalThis.setInterval(async () => {
    if (source || disposed) return;
    try {
      request(Number((await revisionFetcher()).revision));
    } catch {
      /* retry next interval */
    }
  }, refreshInterval);
  return () => {
    disposed = true;
    globalThis.clearInterval(timer);
    if (eventSource && revisionHandler)
      eventSource.removeEventListener('revision', revisionHandler);
    eventSource?.close?.();
  };
}
