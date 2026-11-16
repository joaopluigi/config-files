import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const llmRoot = fileURLToPath(new URL('..', import.meta.url));
const orchestratorPath = join(llmRoot, 'agents', 'orchestrator.md');

async function readOrchestratorGuidance() {
  return readFile(orchestratorPath, 'utf8');
}

function parseGuidanceBody(guidance) {
  const match = guidance.match(/^---[ \t]*\r?\n[\s\S]*?^---[ \t]*(?:\r?\n|$)([\s\S]*)/m);
  assert.ok(match, 'missing front-matter delimiter pair');
  return match[1];
}

test('orchestrator guidance is one concise body paragraph with the essential decision-support contract', async () => {
  const guidance = await readOrchestratorGuidance();
  const body = parseGuidanceBody(guidance);
  const paragraphs = body.trim().split(/\n\s*\n/).filter(Boolean);

  assert.equal(paragraphs.length, 1);
  assert.doesNotMatch(body, /^#{1,6}\s/m);
  for (const phrase of [
    'finite, explicit decision-support analysis',
    'material constraints, trade-offs, risk, incomplete evidence, or uncertainty',
    'ordinary delegation',
    'evidence gathering, option generation, implementation, testing, and review',
    'materially different assumptions, incentives, expertise, or failure modes',
    'same problem, constraints, and evidence boundary',
    'in parallel after prerequisites',
    'attributed reports, provenance, agreement and disagreement, and uncertainty',
    'do not average unsupported judgments or treat consensus as proof',
    'options and trade-offs visible',
    'delegation, worklog, and isolation rules',
    'does not authorize consequential action',
  ]) {
    assert.match(body, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `missing contract phrase: ${phrase}`);
  }
});

test('orchestrator guidance avoids domain-specific valuation and sourcing rules', async () => {
  const guidance = await readOrchestratorGuidance();

  for (const forbiddenPattern of [
    /candidate[-\s]+specific/i,
    /\b(?:numeric|numerical)[-\s]+valuation\b/i,
    /\bstand[-\s]?alone[-\s]+valuation\b/i,
    /\bsingle[-\s]+source\b/i,
    /\bfixed[-\s]+(?:agent[-\s]+)?(?:count|number)\b/i,
    /\bfixed[-\s]+number[-\s]+of[-\s]+agents?\b/i,
  ]) {
    assert.doesNotMatch(guidance, forbiddenPattern, `unexpected domain-specific wording: ${forbiddenPattern}`);
  }
});
