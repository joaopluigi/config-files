import { createViewerClient } from './mcp/client.js';
import { WorklogViewerScreen } from './viewer/screens/WorklogViewerScreen.jsx';
import './styles.css';

const viewerClient = createViewerClient({
  endpoint: import.meta.env.VITE_MCP_ENDPOINT ?? '/mcp',
  token: import.meta.env.VITE_MCP_TOKEN,
});

export function App() {
  return <WorklogViewerScreen client={viewerClient} />;
}
