import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import test from 'node:test';

const schema = JSON.parse(await readFile('llm/skills/discovery/discovery-result.schema.json', 'utf8'));
const expectedCanonicalLanes = [
  'local project files and history',
  'related organization projects',
  'official documentation and standards',
  'issues, pull requests, and discussions',
  'public prior art and packages',
  'domain references'
];
const canonicalLanes = expectedCanonicalLanes;
const laneStatuses = schema.$defs.lane.properties.status.enum;
const priorArtDecisions = schema.properties.priorArt.items.properties.decision.enum;

assert.deepEqual(schema.properties.laneMatrix.required, expectedCanonicalLanes);

function validate(result) {
  const errors = [];
  const object = (value, label, definition) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${label} must be an object`);
      return false;
    }
    if (definition) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(definition.properties, key)) errors.push(`${label} has unknown field ${key}`);
      }
      for (const key of definition.required ?? []) {
        if (!Object.hasOwn(value, key)) errors.push(`missing ${label}.${key}`);
      }
    }
    return true;
  };
  const nonEmptyString = (value, label) => {
    if (typeof value !== 'string' || value.length === 0) errors.push(`${label} must be a non-empty string`);
  };
  const stringArray = (value, label, minItems = 0) => {
    if (!Array.isArray(value)) {
      errors.push(`${label} must be an array`);
      return;
    }
    if (value.length < minItems) errors.push(`${label} must not be empty`);
    value.forEach((entry, index) => nonEmptyString(entry, `${label}[${index}]`));
  };

  if (!object(result, 'result', schema)) return errors;
  for (const lane of canonicalLanes) {
    if (!Object.hasOwn(result.laneMatrix ?? {}, lane)) errors.push(`missing canonical lane ${lane}`);
  }
  if (object(result.laneMatrix, 'laneMatrix', schema.properties.laneMatrix)) {
    for (const lane of canonicalLanes) {
      const entry = result.laneMatrix[lane];
      if (!entry || !object(entry, `lane ${lane}`, schema.$defs.lane)) continue;
      if (!laneStatuses.includes(entry.status)) errors.push(`invalid lane status for ${lane}`);
      stringArray(entry.sources, `lane ${lane} sources`, 1);
      nonEmptyString(entry.reason, `lane ${lane} reason`);
    }
  }
  if (Array.isArray(result.sources)) {
    if (result.sources.length === 0) errors.push('sources must not be empty');
    for (const [index, source] of result.sources.entries()) {
      if (!object(source, `source ${index}`, schema.properties.sources.items)) continue;
      nonEmptyString(source.provenance, `source ${index} provenance`);
      nonEmptyString(source.type, `source ${index} type`);
      stringArray(source.claims, `source ${index} claims`, 1);
    }
  } else errors.push('sources must be an array');
  if (Array.isArray(result.priorArt)) {
    if (result.priorArt.length === 0) errors.push('priorArt must be a non-empty array');
    for (const [index, decision] of result.priorArt.entries()) {
      if (!object(decision, `prior-art ${index}`, schema.properties.priorArt.items)) continue;
      nonEmptyString(decision.candidate, `prior-art ${index} candidate`);
      nonEmptyString(decision.provenance, `prior-art ${index} provenance`);
      if (!priorArtDecisions.includes(decision.decision)) errors.push(`invalid prior-art decision at ${index}`);
      stringArray(decision.evidence, `prior-art ${index} evidence`, 1);
      nonEmptyString(decision.searchScope, `prior-art ${index} searchScope`);
      nonEmptyString(decision.reason, `prior-art ${index} reason`);
      stringArray(decision.gaps, `prior-art ${index} gaps`);
      stringArray(decision.uncertainty, `prior-art ${index} uncertainty`);
    }
  } else errors.push('priorArt must be a non-empty array');
  for (const key of ['contradictions', 'gaps', 'uncertainty']) stringArray(result[key], key);
  if (object(result.stopStatus, 'stopStatus', schema.properties.stopStatus)) {
    if (!schema.properties.stopStatus.properties.status.enum.includes(result.stopStatus.status)) errors.push('invalid stop status');
    nonEmptyString(result.stopStatus.reason, 'stop status reason');
  }
  return errors;
}

const laneMatrix = Object.fromEntries(canonicalLanes.map((lane) => [lane, {
  status: 'searched', sources: ['repo'], reason: `reviewed ${lane}`
}]));
const valid = {
  laneMatrix,
  sources: [{ provenance: 'repo:file.md', type: 'repository', claims: ['the contract is documented'] }],
  priorArt: [{ candidate: 'existing check', provenance: 'repo:test.mjs', decision: 'adapt', evidence: ['current test coverage'], searchScope: 'repository tests', reason: 'the existing check covers related behavior', gaps: [], uncertainty: [] }],
  contradictions: [], gaps: [], uncertainty: [],
  stopStatus: { status: 'stopped', reason: 'all canonical lanes covered' }
};

test('published schema preserves the discovery contract', () => {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['laneMatrix', 'sources', 'priorArt', 'contradictions', 'gaps', 'uncertainty', 'stopStatus']);

  const laneMatrixSchema = schema.properties.laneMatrix;
  assert.equal(laneMatrixSchema.additionalProperties, false);
  assert.deepEqual(laneMatrixSchema.required, expectedCanonicalLanes);

  const laneSchema = schema.$defs.lane;
  assert.deepEqual(laneSchema.required, ['status', 'sources', 'reason']);
  assert.deepEqual(laneSchema.properties.status.enum, ['searched', 'not applicable', 'inaccessible']);
  assert.equal(laneSchema.properties.sources.minItems, 1);
  assert.equal(laneSchema.properties.sources.items.minLength, 1);
  assert.equal(laneSchema.properties.reason.minLength, 1);
  assert.equal(laneSchema.additionalProperties, false);

  const sourceSchema = schema.properties.sources.items;
  assert.deepEqual(sourceSchema.required, ['provenance', 'type', 'claims']);
  assert.equal(sourceSchema.properties.provenance.minLength, 1);
  assert.equal(sourceSchema.properties.claims.minItems, 1);
  assert.equal(sourceSchema.properties.claims.items.minLength, 1);
  assert.equal(sourceSchema.additionalProperties, false);

  const priorArtSchema = schema.properties.priorArt;
  const priorArtItemSchema = priorArtSchema.items;
  assert.ok(priorArtSchema.minItems >= 1);
  assert.deepEqual(priorArtItemSchema.required, ['candidate', 'provenance', 'decision', 'evidence', 'searchScope', 'reason', 'gaps', 'uncertainty']);
  for (const field of ['candidate', 'provenance', 'searchScope', 'reason']) assert.equal(priorArtItemSchema.properties[field].minLength, 1);
  assert.equal(priorArtItemSchema.properties.evidence.minItems, 1);
  assert.equal(priorArtItemSchema.properties.evidence.items.minLength, 1);
  assert.equal(priorArtItemSchema.additionalProperties, false);

  const stopStatusSchema = schema.properties.stopStatus;
  assert.deepEqual(stopStatusSchema.required, ['status', 'reason']);
  assert.equal(stopStatusSchema.properties.reason.minLength, 1);
  assert.equal(stopStatusSchema.additionalProperties, false);
});

test('accepts a complete discovery result', () => assert.deepEqual(validate(valid), []));

test('rejects every missing canonical lane', () => {
  for (const lane of canonicalLanes) {
    const result = structuredClone(valid);
    delete result.laneMatrix[lane];
    assert.match(validate(result).join('\n'), new RegExp(`missing canonical lane ${lane}`));
  }
});

test('rejects invalid lane status and wrong lane types', () => {
  const result = structuredClone(valid);
  result.laneMatrix[canonicalLanes[0]].status = 'done';
  result.laneMatrix[canonicalLanes[1]].sources = 'repo';
  assert.match(validate(result).join('\n'), /invalid lane status/);
  assert.match(validate(result).join('\n'), /sources must be an array/);
});

test('rejects unknown fields at every published object boundary', () => {
  for (const mutate of [
    (result) => { result.extra = true; },
    (result) => { result.laneMatrix.extra = {}; },
    (result) => { result.laneMatrix[canonicalLanes[0]].extra = true; },
    (result) => { result.sources[0].extra = true; },
    (result) => { result.priorArt[0].extra = true; },
    (result) => { result.stopStatus.extra = true; }
  ]) {
    const result = structuredClone(valid);
    mutate(result);
    assert.match(validate(result).join('\n'), /unknown field/);
  }
});

test('rejects missing required fields, empty collections, and empty strings', () => {
  for (const mutate of [
    (result) => { delete result.laneMatrix[canonicalLanes[0]].reason; },
    (result) => { result.laneMatrix[canonicalLanes[0]].sources = []; },
    (result) => { result.sources = []; },
    (result) => { delete result.sources[0].provenance; },
    (result) => { result.sources[0].claims = []; },
    (result) => { result.priorArt[0].evidence = []; },
    (result) => { result.stopStatus.reason = ''; }
  ]) {
    const result = structuredClone(valid);
    mutate(result);
    assert.notDeepEqual(validate(result), []);
  }
});

test('rejects invalid enums and wrong collection types', () => {
  for (const mutate of [
    (result) => { result.priorArt[0].decision = 'consider'; },
    (result) => { result.stopStatus.status = 'paused'; },
    (result) => { result.priorArt[0].gaps = 'unknown'; },
    (result) => { result.sources[0].claims = 'claim'; }
  ]) {
    const result = structuredClone(valid);
    mutate(result);
    assert.notDeepEqual(validate(result), []);
  }
});

test('accepts an explicit none-found prior-art decision', () => {
  const result = structuredClone(valid);
  result.priorArt = [{ candidate: 'none found', provenance: 'search log', decision: 'none found', evidence: ['no matching implementation located'], searchScope: 'repository and public packages', reason: 'no candidate met the requirements', gaps: ['no private implementations searched'], uncertainty: ['search results may be incomplete'] }];
  assert.deepEqual(validate(result), []);
});

test('requires stop status', () => {
  const result = structuredClone(valid);
  delete result.stopStatus;
  assert.match(validate(result).join('\n'), /missing result.stopStatus/);
});
