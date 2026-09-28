import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
const root = process.cwd();
for (const name of ['personal', 'professional']) {
  const config = JSON.parse(await readFile(`${root}/llm/eca/${name}.json`, 'utf8'));
  assert.equal(config.defaultAgent, 'orchestrator');
  assert.equal(config.agent.profile, undefined);
  assert.ok(config.mcpServers.worklog);
  assert.equal(config.mcpServers.worklog.args[0], '${env:HOME}/.config/eca/mcp/worklog/server.mjs');
}
const orchestrator = await readFile(`${root}/llm/agents/orchestrator.md`, 'utf8');
assert.match(orchestrator, /mode: primary/);
assert.match(orchestrator, /eca__spawn_agent/);
for (const name of ['critic', 'executor', 'ideator', 'investigator', 'maintainer', 'researcher', 'reviewer', 'tester']) {
  const profile = await readFile(`${root}/llm/agents/${name}.md`, 'utf8');
  assert.match(profile, /mode: subagent/);
  assert.match(profile, /spawnableBy: orchestrator/);
}
const server = await readFile(`${root}/llm/mcp/worklog/server.mjs`, 'utf8');
for (const tool of ['worklog_session_create', 'worklog_subagent_create', 'worklog_append', 'worklog_read', 'worklog_ask', 'worklog_answer', 'worklog_status', 'worklog_close']) assert.match(server, new RegExp(`registerTool\\('${tool}'`));
assert.match(server, /capabilityToken/);
assert.match(server, /unknown peer/);
assert.doesNotMatch(server, /shell_command|execFile|spawn\(/);
assert.match(server, /Buffer\.from\(await readFile\(pathFor\(orchestrationId, peerId\), 'utf8'\)\)/);
const install = await readFile(`${root}/install.sh`, 'utf8');
assert.match(install, /llm\/mcp\/worklog\/server\.mjs.*CONFIG_ECA\/mcp\/worklog\/server\.mjs/);
assert.doesNotMatch(install, /link \"\$REPO\/llm\/mcp\"/);
const readme = await readFile(`${root}/llm/README.md`, 'utf8');
assert.match(readme, /links `llm\/mcp\/worklog\/server\.mjs` to `\$HOME\/\.config\/eca\/mcp\/worklog\/server\.mjs`/);
console.log('static checks passed');
