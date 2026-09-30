import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionList } from './SessionList.jsx';

const sessions = [
  {
    orchestrationId: 'open-id',
    actor: 'executor',
    goal: 'Primary goal',
    complete: false,
    createdAt: '2026-09-30T10:00:00Z',
    duration: 'unavailable (log timestamps are time-only)',
  },
  {
    orchestrationId: 'closed-id',
    actor: 'reviewer',
    goal: 'Secondary goal',
    complete: true,
    createdAt: '2026-09-30T10:00:00Z',
    duration: '12 minutes',
  },
];

describe('SessionList', () => {
  it('renders initial live duration and preserves card details', () => {
    vi.setSystemTime(new Date('2026-09-30T11:01:02Z'));
    const onSelect = vi.fn();

    render(<SessionList sessions={sessions} selectedId="open-id" onSelect={onSelect} />);

    const openCard = screen.getByRole('button', { name: /Primary goal/ });
    expect(openCard).toHaveAttribute('aria-pressed', 'true');
    expect(openCard).toHaveTextContent('executor');
    expect(openCard).toHaveTextContent('Open session');
    expect(openCard).toHaveTextContent('open-id');
    expect(openCard).toHaveTextContent('1h 1m 2s');
    const metadataRow = openCard.querySelector('.mt-1.flex');
    expect(metadataRow).toHaveTextContent('1h 1m 2s');

    openCard.click();
    expect(onSelect).toHaveBeenCalledWith('open-id');
    vi.useRealTimers();
  });

  it('updates live duration on the list interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T11:01:02Z'));
    render(<SessionList sessions={[sessions[0]]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('1h 1m 2s');

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button')).toHaveTextContent('1h 1m 3s');
    vi.useRealTimers();
  });

  it('keeps stored duration for closed, invalid, and missing dates', () => {
    const fallbackSessions = [
      sessions[1],
      {
        ...sessions[0],
        orchestrationId: 'invalid-id',
        createdAt: 'invalid',
        duration: '7 minutes',
      },
      {
        ...sessions[0],
        orchestrationId: 'missing-id',
        createdAt: undefined,
        duration: '8 minutes',
      },
    ];
    render(<SessionList sessions={fallbackSessions} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Secondary goal/ })).toHaveTextContent('12 minutes');
    expect(
      screen.getByRole('button', { name: /Primary goalOpen sessionexecutor.*invalid-id/ }),
    ).toHaveTextContent('7 minutes');
    expect(
      screen.getByRole('button', { name: /Primary goalOpen sessionexecutor.*missing-id/ }),
    ).toHaveTextContent('8 minutes');
  });

  it('does not schedule a timer for closed-only or invalid open lists', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    render(
      <SessionList
        sessions={[sessions[1], { ...sessions[0], createdAt: 'invalid' }]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it('cleans up the list interval on unmount', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(
      <SessionList sessions={[sessions[0]]} selectedId={null} onSelect={vi.fn()} />,
    );
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });

  it('uses an animated blue dot for open and a static gray dot for closed', () => {
    render(<SessionList sessions={sessions} selectedId={null} onSelect={vi.fn()} />);

    const openCard = screen.getByRole('button', { name: /Primary goal/ });
    const closedCard = screen.getByRole('button', { name: /Secondary goal/ });
    const openDot = openCard.querySelector('[aria-hidden="true"]');
    const closedDot = closedCard.querySelector('[aria-hidden="true"]');

    expect(openDot).toHaveClass('bg-blue-500', 'motion-safe:animate-pulse');
    expect(closedDot).toHaveClass('bg-slate-400');
    expect(closedDot).not.toHaveClass('motion-safe:animate-pulse');
    expect(closedCard).toHaveTextContent('reviewer');
    expect(closedCard).toHaveTextContent('Closed session');
    expect(closedCard).toHaveTextContent('closed-id');
    expect(closedCard).toHaveTextContent('12 minutes');
  });

  it('does not enter-animate cards rendered initially, but animates a newly inserted card', () => {
    const { rerender } = render(
      <SessionList sessions={[sessions[0], sessions[1]]} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Primary goal/ }).parentElement).not.toHaveClass(
      'worklog-card-enter',
    );

    const inserted = {
      ...sessions[0],
      orchestrationId: 'inserted-id',
      goal: 'Inserted goal',
    };
    rerender(
      <SessionList
        sessions={[sessions[0], inserted, sessions[1]]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Inserted goal/ }).parentElement).toHaveClass(
      'worklog-card-enter',
    );
  });

  it('preserves keyed card identity and moves displaced cards when sessions reorder', () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const isClosed = this.textContent.includes('Secondary goal');
      const isReordered = screen
        .queryAllByRole('button')[0]
        ?.textContent.includes('Secondary goal');
      return { top: isClosed === isReordered ? 0 : 100 };
    });
    const { rerender } = render(
      <SessionList sessions={sessions} selectedId={null} onSelect={vi.fn()} />,
    );
    const openCard = screen.getByRole('button', { name: /Primary goal/ });
    const closedCard = screen.getByRole('button', { name: /Secondary goal/ });

    rerender(
      <SessionList sessions={[sessions[1], sessions[0]]} selectedId={null} onSelect={vi.fn()} />,
    );

    expect(screen.getAllByRole('button')[0]).toBe(closedCard);
    expect(screen.getAllByRole('button')[1]).toBe(openCard);
    expect(openCard.parentElement).toHaveStyle({ transform: 'translateY(-100px)' });
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it('skips reorder motion when reduced motion is preferred', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = () => ({ matches: true });
    const { rerender } = render(
      <SessionList sessions={sessions} selectedId={null} onSelect={vi.fn()} />,
    );
    rerender(
      <SessionList sessions={[sessions[1], sessions[0]]} selectedId={null} onSelect={vi.fn()} />,
    );

    expect(screen.getAllByRole('button')[0].parentElement).not.toHaveClass('worklog-card-reorder');
    window.matchMedia = originalMatchMedia;
  });
});
