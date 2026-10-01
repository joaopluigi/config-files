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

  it('renders each semicolon-delimited source in first-seen order', () => {
    render(
      <LogEntry
        entry={{
          time: '12:00:00',
          actor: 'executor',
          item: 1,
          tag: 'find',
          message: 'found sources src: https://example.com/one;src: https://example.com/two',
        }}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://example.com/one');
    expect(links[1]).toHaveAttribute('href', 'https://example.com/two');
    expect(screen.getByText('found sources')).toBeInTheDocument();
    expect(screen.queryByText(/src:/)).not.toBeInTheDocument();
  });

  it('uses the next space as the no-semicolon source boundary', () => {
    render(
      <LogEntry
        entry={{ ...entry, message: 'body src: foo after the source' }}
        workingDirectory="/Users/tester/project"
      />,
    );

    expect(screen.getByRole('link', { name: 'foo' })).toHaveAttribute(
      'href',
      'file:///Users/tester/project/foo',
    );
    expect(screen.getByText('body after the source')).toBeInTheDocument();
  });

  it('parses a descriptive source label and semicolon-delimited relative paths', () => {
    render(
      <LogEntry
        entry={{
          ...entry,
          message:
            'src: investigator discovery report; app/package.json; app/vite.config.js; app/src/viewer/screens/WorklogViewerScreen.jsx; src/storage/repository.mjs.',
        }}
        workingDirectory="/Users/tester/project"
      />,
    );

    expect(screen.getByText('investigator discovery report').tagName).toBe('SPAN');
    expect(screen.getByRole('link', { name: 'app/package.json' })).toHaveAttribute(
      'href',
      'file:///Users/tester/project/app/package.json',
    );
    expect(screen.getByRole('link', { name: 'app/vite.config.js' })).toHaveAttribute(
      'href',
      'file:///Users/tester/project/app/vite.config.js',
    );
    expect(
      screen.getByRole('link', { name: 'app/src/viewer/screens/WorklogViewerScreen.jsx' }),
    ).toHaveAttribute(
      'href',
      'file:///Users/tester/project/app/src/viewer/screens/WorklogViewerScreen.jsx',
    );
    expect(screen.getByRole('link', { name: 'src/storage/repository.mjs' })).toHaveAttribute(
      'href',
      'file:///Users/tester/project/src/storage/repository.mjs',
    );
  });

  it('splits literal and actual newline source delimiters', () => {
    render(
      <LogEntry
        entry={{
          ...entry,
          message: 'src: ./one.js\\nsrc: ./two.js\nsrc: ./three.js',
        }}
        workingDirectory="/Users/tester/project"
      />,
    );

    expect(screen.getByRole('link', { name: './one.js' })).toHaveAttribute(
      'href',
      'file:///Users/tester/project/one.js',
    );
    expect(screen.getByRole('link', { name: './two.js' })).toHaveAttribute(
      'href',
      'file:///Users/tester/project/two.js',
    );
    expect(screen.getByRole('link', { name: './three.js' })).toHaveAttribute(
      'href',
      'file:///Users/tester/project/three.js',
    );
  });

  it('does not show a Sources section for an invalid standalone source candidate', () => {
    render(<LogEntry entry={{ ...entry, message: 'src: javascript:alert(1)' }} />);

    expect(screen.queryByText('Sources:')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('src: javascript:alert(1)')).toBeInTheDocument();
  });

  it('preserves an invalid-only semicolon source list as raw message text', () => {
    const message = 'src: javascript:alert(1); src: vbscript:msgbox(1)';
    render(<LogEntry entry={{ ...entry, message }} />);

    expect(screen.queryByText('Sources:')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
