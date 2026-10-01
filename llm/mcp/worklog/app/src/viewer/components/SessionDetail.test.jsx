import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionDetail } from './SessionDetail.jsx';

const session = {
  orchestrationId: 'session1',
  goal: 'Inspect',
  complete: false,
  createdAt: '2026-09-30T10:00:00Z',
  createdAtSource: 'recorded session.json.createdAt',
  duration: 'unavailable',
  peers: [],
  entries: [],
};

describe('SessionDetail', () => {
  it('shows closed peers over total peers in the Peers heading', () => {
    render(
      <SessionDetail
        session={{
          ...session,
          peers: [
            { id: 'peer-a', complete: false },
            { id: 'peer-b', complete: true },
          ],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Peers (1/2)' })).toBeInTheDocument();
  });

  it('shows zero when no peers were spawned', () => {
    render(<SessionDetail session={session} />);

    expect(screen.getByRole('heading', { name: 'Peers (0/0)' })).toBeInTheDocument();
  });

  it('shows all peers closed when every persisted peer is complete', () => {
    render(
      <SessionDetail
        session={{
          ...session,
          peers: [
            { id: 'peer-a', complete: true },
            { id: 'peer-b', complete: true },
          ],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Peers (2/2)' })).toBeInTheDocument();
  });

  it('formats Started in the browser timezone without the source label', () => {
    const started = new Date(session.createdAt);
    const pad = (value) => String(value).padStart(2, '0');
    const expected = `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(
      started.getDate(),
    )} at ${pad(started.getHours())}:${pad(started.getMinutes())}`;

    render(<SessionDetail session={session} />);

    expect(screen.getByText(new RegExp(`Started ${expected} · Duration`))).toBeInTheDocument();
    expect(screen.queryByText(/recorded session\.json\.createdAt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(.*createdAt.*\)/)).not.toBeInTheDocument();
  });

  it('shows a live elapsed snapshot for an open session', () => {
    vi.setSystemTime(new Date('2026-09-30T11:01:02Z'));
    render(<SessionDetail session={session} />);
    expect(screen.getByText(/Duration 1h 1m 2s/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('uses stored duration for closed sessions and does not schedule a timer', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    render(<SessionDetail session={{ ...session, complete: true, duration: '12 minutes' }} />);
    expect(screen.getByText(/Duration 12 minutes/)).toBeInTheDocument();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('cleans up the elapsed timer on unmount', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<SessionDetail session={session} />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it('renders plan steps as an ordered list in session order', () => {
    render(<SessionDetail session={{ ...session, steps: ['First step', 'Second step'] }} />);
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument();
    const plan = screen.getByRole('heading', { name: 'Plan' }).nextElementSibling;
    expect(plan.tagName).toBe('OL');
    expect(plan).toHaveClass('list-decimal');
    expect([...plan.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'First step',
      'Second step',
    ]);
  });

  it('orders entries by timestamp without numeric prefixes', () => {
    render(
      <SessionDetail
        session={{
          ...session,
          entries: [
            { time: '2026-09-30T10:02:00Z', actor: 'two', tag: 'done', message: 'second' },
            { time: '2026-09-30T10:01:00Z', actor: 'one', tag: 'progress', message: 'first' },
          ],
        }}
      />,
    );
    const entries = screen.getByRole('heading', { name: 'Log entries' }).nextElementSibling;
    expect(entries.querySelectorAll('li')[0]).toHaveTextContent('first');
    expect(entries.querySelectorAll('li')[1]).toHaveTextContent('second');
    expect(entries.querySelectorAll('li')[0]).not.toHaveTextContent(/^1 /);
  });

  it('keeps equal and invalid timestamps stable without mutating source entries', () => {
    const entries = [
      { time: 'invalid', actor: 'first', tag: 'progress', message: 'first' },
      { time: 'invalid', actor: 'second', tag: 'progress', message: 'second' },
    ];
    render(<SessionDetail session={{ ...session, entries }} />);
    const rendered = screen.getByRole('heading', { name: 'Log entries' }).nextElementSibling;
    expect(rendered.querySelectorAll('li')[0]).toHaveTextContent('first');
    expect(rendered.querySelectorAll('li')[1]).toHaveTextContent('second');
    expect(entries[0].message).toBe('first');
    expect(entries[1].message).toBe('second');
  });

  it('renders log entries as visible stacked cards with ordered metadata and readable messages', () => {
    const entry = {
      item: 7,
      time: '14:26:32',
      actor: 'orchestrator',
      tag: 'question',
      message: 'Discovery completed and stopped on an ambiguity.\\nNeed user decisions.',
    };
    render(<SessionDetail session={{ ...session, entries: [entry] }} />);

    const metadata = screen
      .getByRole('heading', { name: 'Log entries' })
      .nextElementSibling.querySelector('.metadata-grid');
    expect([...metadata.children].map((child) => child.textContent)).toEqual([
      '14:26:32',
      'orchestrator',
      '#7',
      'question',
    ]);
    expect(screen.getByText('#7')).toHaveClass('metadata-item');
    expect(screen.getByText('14:26:32')).toBeInTheDocument();
    expect(screen.getByText('orchestrator')).toHaveClass('rounded-full');
    expect(screen.getByText('question')).toHaveClass('rounded-full');
    expect(screen.getByText(/Discovery completed and stopped on an ambiguity/)).toHaveClass(
      'whitespace-pre-wrap',
      'break-words',
    );
  });

  it('renders valid explicit http and https sources as safe links', () => {
    const entry = {
      item: 8,
      time: '14:26:32',
      actor: 'orchestrator',
      tag: 'progress',
      message: 'See src: https://example.com/a and src:http://example.test/b',
    };
    render(<SessionDetail session={{ ...session, entries: [entry] }} />);

    expect(screen.getByText('Sources:')).toBeInTheDocument();
    for (const source of ['https://example.com/a', 'http://example.test/b']) {
      expect(screen.getByRole('link', { name: source })).toHaveAttribute('href', source);
      expect(screen.getByRole('link', { name: source })).toHaveAttribute(
        'rel',
        'noreferrer noopener',
      );
      expect(screen.getByRole('link', { name: source })).toHaveAttribute('target', '_blank');
    }
  });

  it('removes trailing punctuation from valid source links', () => {
    const entry = {
      time: '14:26:32',
      actor: 'orchestrator',
      tag: 'progress',
      message: 'See src: https://example.com/a.',
    };
    render(<SessionDetail session={{ ...session, entries: [entry] }} />);

    expect(screen.getByRole('link', { name: 'https://example.com/a' })).toHaveAttribute(
      'href',
      'https://example.com/a',
    );
  });

  it('keeps unsupported and malformed src values as escaped message text without source links', () => {
    const entry = {
      time: '14:26:32',
      actor: 'orchestrator',
      tag: 'progress',
      message:
        'src: https:// src: http:// src: javascript:alert(1) src: //example.com src: not-a-url <script>alert(1)</script>',
    };
    render(<SessionDetail session={{ ...session, entries: [entry] }} />);

    expect(screen.queryByText('Sources:')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(entry.message)).toBeInTheDocument();
  });

  it('shows peer identity and goal in a clickable card and reveals the full worklog', () => {
    const peerEntries = [
      {
        item: 3,
        time: '2026-09-30T10:03:00Z',
        actor: 'peer',
        tag: 'progress',
        message: 'peer entry',
      },
    ];
    render(
      <SessionDetail
        session={{
          ...session,
          peers: [
            {
              id: 'peer-a',
              actor: 'A',
              complete: false,
              createdAt: '2026-09-30T10:00:00Z',
              goal: 'Inspect the details',
              plan: ['First peer step', 'Second peer step'],
              entries: peerEntries,
            },
            { id: 'peer-b', actor: 'B', complete: true, entries: peerEntries },
          ],
        }}
      />,
    );
    const peerButtons = screen.getAllByRole('button');
    expect(peerButtons[0]).toHaveTextContent(/Inspect the detailsA · peer-a · /);
    expect(peerButtons[0]).not.toHaveTextContent(/Open|Closed/);
    expect(peerButtons[0]).toHaveClass('rounded-lg', 'border', 'hover:border-slate-500', 'min-w-0');
    expect(peerButtons[0].querySelector('strong')).toHaveClass('break-words', 'whitespace-normal');
    const openDot = peerButtons[0].querySelector('[aria-hidden="true"]');
    const closedDot = peerButtons[1].querySelector('[aria-hidden="true"]');
    expect(openDot).toHaveClass('bg-blue-500', 'motion-safe:animate-pulse');
    expect(closedDot).toHaveClass('bg-slate-400');
    expect(closedDot).not.toHaveClass('motion-safe:animate-pulse');
    expect(peerButtons[0]).toHaveAttribute('aria-expanded', 'false');
    expect(peerButtons[0]).toHaveAttribute('aria-controls', 'peer-entries-session1-peer-a');
    fireEvent.click(peerButtons[0]);
    expect(peerButtons[0]).toHaveAttribute('aria-expanded', 'true');
    const panel = document.querySelector('#peer-entries-session1-peer-a');
    expect(panel).toHaveTextContent(/Open - Started .* at .* - Duration/);
    expect(panel).toHaveTextContent('First peer step');
    expect(panel).toHaveTextContent('Second peer step');
    expect(panel.querySelector('.metadata-grid')).toHaveClass(
      'grid-cols-1',
      'sm:grid-cols-[auto_minmax(0,auto)_auto_minmax(0,1fr)]',
    );
    const peerMetadata = panel.querySelector('.metadata-grid');
    expect([...peerMetadata.children].map((child) => child.textContent)).toEqual([
      '2026-09-30T10:03:00Z',
      'peer',
      '#3',
      'progress',
    ]);
    expect(panel.querySelector('.metadata-item')).toHaveTextContent('#3');
    expect(panel).toHaveTextContent('peer entry');
    expect(panel.querySelectorAll('li')).toHaveLength(3);
    expect(peerButtons[1]).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows unavailable for legacy peer timing without exposing its source', () => {
    render(
      <SessionDetail
        session={{
          ...session,
          peers: [
            {
              id: 'peer-legacy',
              actor: 'A',
              complete: true,
              duration: 'unavailable',
              durationSource: 'legacy peer timing unavailable',
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('A · peer-legacy · unavailable');
    expect(screen.getByRole('button')).not.toHaveTextContent(/Open|Closed/);
    expect(screen.queryByText(/birthtime fallback/i)).not.toBeInTheDocument();
  });

  it('keeps peer panel IDs tied to peer identity when peers reorder', () => {
    const peers = [
      { id: 'peer-a', actor: 'A', complete: false, entries: [] },
      { id: 'peer-b', actor: 'B', complete: true, entries: [] },
    ];
    const { rerender } = render(<SessionDetail session={{ ...session, peers }} />);
    expect(screen.getAllByRole('button')[0]).toHaveAttribute(
      'aria-controls',
      'peer-entries-session1-peer-a',
    );
    rerender(<SessionDetail session={{ ...session, peers: [...peers].reverse() }} />);
    expect(screen.getAllByRole('button')[0]).toHaveAttribute(
      'aria-controls',
      'peer-entries-session1-peer-b',
    );
  });

  it('resets expanded peers when the selected session changes', () => {
    const peer = { id: 'peer-a', actor: 'A', complete: false, entries: [] };
    const { rerender } = render(<SessionDetail session={{ ...session, peers: [peer] }} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    rerender(
      <SessionDetail session={{ ...session, orchestrationId: 'session2', peers: [peer] }} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });
});
