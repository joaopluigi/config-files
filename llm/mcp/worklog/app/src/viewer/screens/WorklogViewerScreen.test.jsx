import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { filterSessions, sortSessions, WorklogViewerScreen } from './WorklogViewerScreen.jsx';
const createEventSource = () => {
  const listeners = {};
  return {
    listeners,
    addEventListener: vi.fn((name, handler) => {
      listeners[name] = handler;
    }),
    removeEventListener: vi.fn((name, handler) => {
      if (listeners[name] === handler) delete listeners[name];
    }),
    close: vi.fn(),
  };
};

const openSelector = async (label) => {
  await act(async () => screen.getByRole('button', { name: new RegExp(`^${label}:`) }).click());
};
const chooseOption = async (label, option) => {
  await openSelector(label);
  await act(async () => screen.getByRole('menuitemradio', { name: option }).click());
};

const data = {
  sessions: [
    {
      orchestrationId: 'abcdef12',
      goal: 'Inspect',
      complete: false,
      createdAt: '2026-09-30T10:00:00Z',
      duration: 'unavailable',
      peers: [],
      entries: [],
    },
  ],
};
describe('filterSessions', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const sessions = [
    { orchestrationId: 'recent-open', complete: false, createdAt: '2026-09-30T12:00:00Z' },
    { orchestrationId: 'boundary', complete: true, createdAt: '2026-09-27T12:00:00Z' },
    { orchestrationId: 'old-open', complete: false, createdAt: '2026-08-01T12:00:00Z' },
    { orchestrationId: 'invalid', complete: false, createdAt: 'not-a-date' },
  ];

  it('applies rolling date windows inclusively and supports all-time', () => {
    const last24Hours = [
      { orchestrationId: 'at-cutoff', complete: false, createdAt: '2026-09-29T12:00:00Z' },
      { orchestrationId: 'before-cutoff', complete: false, createdAt: '2026-09-29T11:59:59Z' },
    ];
    expect(filterSessions(last24Hours, '24h', 'all', now).map((s) => s.orchestrationId)).toEqual([
      'at-cutoff',
    ]);
    expect(filterSessions(sessions, '3', 'all', now).map((s) => s.orchestrationId)).toEqual([
      'recent-open',
      'boundary',
    ]);
    expect(filterSessions(sessions, '7', 'all', now)).toHaveLength(2);
    expect(filterSessions(sessions, '30', 'all', now)).toHaveLength(2);
    expect(filterSessions(sessions, 'all', 'all', now)).toHaveLength(4);
  });

  it('filters open, closed, and combined status/date selections', () => {
    expect(filterSessions(sessions, 'all', 'open', now).map((s) => s.orchestrationId)).toEqual([
      'recent-open',
      'old-open',
      'invalid',
    ]);
    expect(filterSessions(sessions, 'all', 'closed', now).map((s) => s.orchestrationId)).toEqual([
      'boundary',
    ]);
    expect(filterSessions(sessions, '3', 'closed', now).map((s) => s.orchestrationId)).toEqual([
      'boundary',
    ]);
    expect(filterSessions(sessions, '3', 'closed', Date.parse('2026-10-02T12:00:00Z'))).toEqual([]);
  });
});

describe('sortSessions', () => {
  it('sorts valid timestamps newest first, puts invalid values last, and breaks ties by id', () => {
    const sessions = [
      {
        orchestrationId: 'old',
        createdAt: '2026-09-29T00:00:00Z',
        updatedAt: '2026-09-29T00:00:00Z',
      },
      {
        orchestrationId: 'new',
        createdAt: '2026-09-30T00:00:00Z',
        updatedAt: '2026-09-30T00:00:00Z',
      },
      {
        orchestrationId: 'invalid',
        createdAt: 'not-a-date',
        updatedAt: 'not-a-date',
      },
      {
        orchestrationId: 'tie-b',
        createdAt: '2026-09-28T00:00:00Z',
        updatedAt: '2026-09-28T00:00:00Z',
      },
      {
        orchestrationId: 'tie-a',
        createdAt: '2026-09-28T00:00:00Z',
        updatedAt: '2026-09-28T00:00:00Z',
      },
    ];
    expect(sortSessions(sessions, 'created').map((session) => session.orchestrationId)).toEqual([
      'new',
      'old',
      'tie-a',
      'tie-b',
      'invalid',
    ]);
    expect(sortSessions(sessions, 'updated').map((session) => session.orchestrationId)).toEqual([
      'new',
      'old',
      'tie-a',
      'tie-b',
      'invalid',
    ]);
    expect(sortSessions(sessions, 'default')).toBe(sessions);
  });
});

describe('WorklogViewerScreen', () => {
  it('loads with the default date and status filters selected', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T12:00:00Z'));
    render(<WorklogViewerScreen fetcher={vi.fn().mockResolvedValue(data)} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Inspect' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Date: Last 24 hours' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Status: All' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Sort: Creation time' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    await openSelector('Date');
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: 'Date' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Date options');
    await openSelector('Date');

    await openSelector('Status');
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Status options');
    await openSelector('Status');

    await openSelector('Sort');
    expect(screen.getByText('Sort By')).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: 'Sort By' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitemradio').map((option) => option.textContent)).toEqual([
      'Creation time',
      'Last updated',
    ]);
    expect(screen.queryByRole('menuitemradio', { name: 'Default' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Sort options');
    expect(screen.getByRole('button', { name: 'Date: Last 24 hours' })).toHaveTextContent(
      'Last 24 hours',
    );
    expect(
      screen
        .getByRole('button', { name: 'Date: Last 24 hours' })
        .querySelector('[aria-hidden="true"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Date: Last 24 hours' }).querySelector('.text-slate-500'),
    ).toBeNull();
    nowSpy.mockRestore();
  });

  it('filters the list and safely falls back when the selected session disappears', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T12:00:00Z'));
    const sessions = {
      sessions: [
        data.sessions[0],
        { ...data.sessions[0], orchestrationId: 'closed', goal: 'Closed', complete: true },
      ],
    };
    render(<WorklogViewerScreen fetcher={vi.fn().mockResolvedValue(sessions)} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Inspect' })).toBeInTheDocument(),
    );
    await chooseOption('Status', 'Closed');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'Inspect' })).not.toBeInTheDocument();
    await chooseOption('Date', 'Last 3 days');
    expect(screen.getByRole('button', { name: 'Status: Closed' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    nowSpy.mockRestore();
  });

  it('handles an empty filter intersection without crashing or retaining a selection', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T12:00:00Z'));
    render(<WorklogViewerScreen fetcher={vi.fn().mockResolvedValue(data)} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Inspect' })).toBeInTheDocument(),
    );

    await chooseOption('Status', 'Closed');

    expect(screen.queryByRole('button', { name: /Inspect/ })).not.toBeInTheDocument();
    expect(screen.getByText('Select a session.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Status: Closed' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    nowSpy.mockRestore();
  });

  it('loads and renders a session', async () => {
    render(<WorklogViewerScreen fetcher={vi.fn().mockResolvedValue(data)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await waitFor(() => expect(screen.getAllByText('Inspect')).not.toHaveLength(0));
  });
  it('shows errors', async () => {
    render(<WorklogViewerScreen fetcher={vi.fn().mockRejectedValue(new Error('offline'))} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('offline'));
  });
  it('does not repeatedly fetch on the production default path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<WorklogViewerScreen />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Inspect' })).toBeInTheDocument(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  it('matches the open session view snapshot', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T17:25:22Z'));
    const view = render(<WorklogViewerScreen fetcher={vi.fn().mockResolvedValue(data)} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Inspect' })).toBeInTheDocument(),
    );
    expect(view.asFragment()).toMatchSnapshot();
    nowSpy.mockRestore();
  });

  it('refreshes once for newer revisions and ignores duplicate or older events', async () => {
    const fetcher = vi.fn().mockResolvedValue(data);
    let source;
    render(
      <WorklogViewerScreen
        fetcher={fetcher}
        eventSourceFactory={() => {
          source = createEventSource();
          return source;
        }}
      />,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(source.addEventListener).toHaveBeenCalledWith('revision', expect.any(Function));
    source.listeners.revision({ data: JSON.stringify({ revision: 2 }) });
    source.listeners.revision({ data: JSON.stringify({ revision: 2 }) });
    source.listeners.revision({ data: JSON.stringify({ revision: 1 }) });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('coalesces a newer revision received during an in-flight refresh', async () => {
    let resolveSecond;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(data)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)))
      .mockResolvedValueOnce(data);
    let source;
    render(
      <WorklogViewerScreen
        fetcher={fetcher}
        eventSourceFactory={() => {
          source = createEventSource();
          return source;
        }}
      />,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    source.listeners.revision({ data: JSON.stringify({ revision: 1 }) });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    source.listeners.revision({ data: JSON.stringify({ revision: 2 }) });
    source.listeners.revision({ data: JSON.stringify({ revision: 3 }) });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => resolveSecond(data));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  });

  it('falls back to revision polling after SSE failure and closes on unmount', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(data);
    const revisionFetcher = vi.fn().mockResolvedValue({ revision: 1 });
    const source = createEventSource();
    const { unmount } = render(
      <WorklogViewerScreen
        fetcher={fetcher}
        revisionFetcher={revisionFetcher}
        eventSourceFactory={() => source}
        refreshInterval={100}
      />,
    );
    source.onerror();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(revisionFetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();
    expect(source.removeEventListener).toHaveBeenCalledWith('revision', expect.any(Function));
    expect(source.close).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('preserves a selected session when refreshed data still contains it', async () => {
    const first = {
      sessions: [
        data.sessions[0],
        { ...data.sessions[0], orchestrationId: '12345678', goal: 'Second' },
      ],
    };
    const fetcher = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(first);
    let source;
    render(
      <WorklogViewerScreen
        fetcher={fetcher}
        eventSourceFactory={() => {
          source = createEventSource();
          return source;
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Second/ })).toBeInTheDocument());
    screen.getByRole('button', { name: /Second/ }).click();
    await act(async () => {
      source.listeners.revision({ data: JSON.stringify({ revision: 1 }) });
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: /Second/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
