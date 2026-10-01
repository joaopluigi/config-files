import { describe, expect, it } from 'vitest';
import { parseWorkingDirectory } from './readModel.js';

describe('working directory parsing', () => {
  it('parses the working directory from the main log header', () => {
    expect(parseWorkingDirectory('working directory: /Users/example/project\n\n── log ──\n')).toBe(
      '/Users/example/project',
    );
  });

  it('leaves the working directory absent when the main log header is missing', () => {
    expect(parseWorkingDirectory('goal: no directory header\n\n── log ──\n')).toBeUndefined();
  });
});
