const DEFAULT_ENDPOINT = '/mcp';
const DEFAULT_ACTOR = 'viewer';

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/token|secret|password/i.test(key))
      .map(([key, item]) => [key, redactSecrets(item)]),
  );
}

function parseToolResult(payload) {
  if (payload?.error) throw new Error(payload.error.message ?? 'MCP request failed');
  const content = payload?.result?.content;
  if (!Array.isArray(content)) throw new Error('MCP response did not contain tool content');
  const errorContent = payload.result.isError || content.find((item) => item.type === 'error');
  const text = content.find((item) => item.type === 'text')?.text;
  if (errorContent) throw new Error(typeof text === 'string' ? text : 'MCP tool failed');
  if (typeof text !== 'string') throw new Error('MCP response did not contain JSON text');
  try {
    return redactSecrets(JSON.parse(text));
  } catch {
    throw new Error('MCP tool returned invalid JSON');
  }
}

export function createViewerClient({
  endpoint = DEFAULT_ENDPOINT,
  token,
  fetchImpl = globalThis.fetch,
  actor = DEFAULT_ACTOR,
  sessionToken,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  let nextId = 0;
  async function callTool(name, args) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++nextId,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    if (!response.ok) throw new Error(`MCP request failed (${response.status})`);
    return parseToolResult(await response.json());
  }

  return {
    listSessions() {
      return callTool('worklog_session_status', { actor });
    },
    getSession(orchestrationId, capabilityToken = sessionToken) {
      if (typeof capabilityToken !== 'string' || capabilityToken.length === 0)
        return Promise.reject(new Error('session capability token is required'));
      return callTool('worklog_read', { orchestrationId, token: capabilityToken });
    },
  };
}
