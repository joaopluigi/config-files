import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogEntry } from './LogEntry.jsx';

describe('LogEntry', () => {
  const entry = {
    item: 7,
    time: '14:26:32',
    actor: 'tester',
    tag: 'progress',
    message: 'message',
  };

  it('keeps the existing blue tag pill when no presentation color is supplied', () => {
    render(<LogEntry entry={entry} />);
    expect(screen.getByText('progress')).toHaveClass('bg-blue-100', 'text-blue-700');
  });

  it('merges a supplied presentation color with the base tag pill styling', () => {
    render(<LogEntry entry={entry} color="bg-emerald-100 text-emerald-700" />);
    expect(screen.getByText('progress')).toHaveClass(
      'rounded-full',
      'px-2',
      'py-1',
      'text-xs',
      'font-medium',
      'bg-emerald-100',
      'text-emerald-700',
    );
    expect(screen.getByText('progress')).not.toHaveClass('bg-blue-100', 'text-blue-700');
  });

  it('preserves the visible item number and tag text', () => {
    render(<LogEntry entry={entry} color="bg-emerald-100 text-emerald-700" />);
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('progress')).toBeInTheDocument();
  });
});
