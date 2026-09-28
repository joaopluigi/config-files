import { readFile, readdir } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';

const root = process.cwd();
const read = file => readFile(join(root, file), 'utf8');
const lines = text => text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);

async function filesUnder(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const markdown = (await filesUnder('llm')).filter(file => file.endsWith('.md'));
const counts = await Promise.all(markdown.map(async file => [file, lines(await read(file))]));
const violations = counts.filter(([, count]) => count > 100);
assert.deepEqual(violations, [], `Markdown files over 100 lines: ${violations.map(([file, count]) => `${file}=${count}`).join(', ')}`);

for (const name of ['personal', 'professional']) {
  const config = JSON.parse(await read(`llm/eca/${name}.json`));
  assert.equal(config.defaultAgent, 'orchestrator');
  assert.equal(config.agent.profile, undefined);
  assert.ok(config.mcpServers.worklog);
  assert.equal(config.mcpServers.worklog.args[0], '${env:HOME}/.config/eca/mcp/worklog/server.mjs');
  assert.equal(config.toolCall.approval.byDefault, 'allow');
  assert.deepEqual(config.toolCall.approval.ask.shell_command.argsMatchers.command, ['.*\\brm\\b.*', '.*\\bmv\\b.*']);
}

const orchestrator = await read('llm/agents/orchestrator.md');
assert.match(orchestrator, /mode: primary/);
assert.match(orchestrator, /spawnableBy: user/);
assert.match(orchestrator, /eca__spawn_agent/);
const allowlist = [
  'eca__spawn_agent',
  'worklog__worklog_session_create',
  'worklog__worklog_subagent_create',
  'worklog__worklog_append',
  'worklog__worklog_read',
  'worklog__worklog_ask',
  'worklog__worklog_answer',
  'worklog__worklog_status',
  'worklog__worklog_close'
];
for (const tool of allowlist) assert.match(orchestrator, new RegExp(`- ${tool}`));
assert.deepEqual([...orchestrator.matchAll(/^  - (.+)$/gm)].map(match => match[1]), allowlist);
for (const marker of [/objective/, /included scope/, /excluded scope/, /inputs and sources/, /expected result/, /evidence required/, /validation/, /stop condition/, /one small, clearly defined, independently verifiable scope/, /independent scopes concurrently/, /dependency barriers/, /never recursively delegate/, /consolidate each worker's result/]) assert.match(orchestrator, marker);

for (const name of ['critic', 'executor', 'ideator', 'investigator', 'maintainer', 'researcher', 'reviewer', 'tester']) {
  const profile = await read(`llm/agents/${name}.md`);
  assert.match(profile, /mode: subagent/);
  assert.match(profile, /spawnableBy: orchestrator/);
}

const server = await read('llm/mcp/worklog/server.mjs');
for (const tool of ['worklog_session_create', 'worklog_subagent_create', 'worklog_append', 'worklog_read', 'worklog_ask', 'worklog_answer', 'worklog_status', 'worklog_close']) assert.match(server, new RegExp(`registerTool\\('${tool}'`));
assert.match(server, /capabilityToken/);
assert.match(server, /unknown peer/);
assert.doesNotMatch(server, /shell_command|execFile|spawn\(/);
assert.doesNotMatch(server, /skills[\\/]/);
assert.match(server, /Buffer\.from\(await readFile\(pathFor\(orchestrationId, peerId\), 'utf8'\)\)/);

const instructionAndTestFiles = [...await filesUnder('llm'), ...await filesUnder('tests')];
const legacyReference = ['worklog', 'sh'].join('.');
const legacyHits = [];
for (const file of instructionAndTestFiles) {
  if ((await read(file)).includes(legacyReference)) legacyHits.push(file);
}
assert.deepEqual(legacyHits, [], `legacy worklog references remain: ${legacyHits.join(', ')}`);

const install = await read('install.sh');
assert.match(install, /llm\/mcp\/worklog\/server\.mjs.*CONFIG_ECA\/mcp\/worklog\/server\.mjs/);
assert.doesNotMatch(install, /link \"\$REPO\/llm\/mcp\"/);

console.log(`static checks passed (${markdown.length} Markdown files; max ${Math.max(...counts.map(([, count]) => count))} lines)`);
