import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llmRoot = fileURLToPath(new URL('..', import.meta.url));

async function readUniversalGuidance() {
  return readFile(join(llmRoot, 'rules', 'agent.md'), 'utf8');
}

test('universal guidance exposes meaningful options before choosing a path', async () => {
  const guidance = await readUniversalGuidance();

  assert.match(guidance, /always make meaningful alternatives visible/i);
  assert.match(guidance, /present their trade-offs/i);
  assert.match(guidance, /do not silently choose the easiest or smallest option/i);
});

test('universal guidance requests enough independent viewpoints to cover materially different assumptions', async () => {
  const guidance = await readUniversalGuidance();

  assert.match(guidance, /as many independent viewpoints as needed/i);
  for (const viewpoint of [
    'opportunity-seeking',
    'failure-seeking',
    'product/user',
    'engineering',
    'security',
    'operations',
    'maintenance',
    'critique',
  ]) {
    assert.match(guidance, new RegExp(viewpoint, 'i'), `missing viewpoint example: ${viewpoint}`);
  }
  assert.match(guidance, /materially different assumptions, incentives, expertise, and failure modes/i);
});

test('universal guidance preserves independent reports and bounded delegation until more viewpoints stop changing the decision', async () => {
  const guidance = await readUniversalGuidance();

  assert.match(guidance, /same problem and constraints/i);
  assert.match(guidance, /independent reports/i);
  assert.match(guidance, /preserve disagreements/i);
  assert.match(guidance, /bounded delegated units/i);
  assert.match(guidance, /stop when additional viewpoints are unlikely to change the options or trade-offs/i);
});
