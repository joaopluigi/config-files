import { access, constants } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function classifyNavigation(baseUrl, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'deny';
  }
  if (parsed.origin === new URL(baseUrl).origin) return 'app';
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return 'external';
  if (parsed.protocol === 'file:' && !parsed.host) return 'local-file';
  return 'deny';
}

export async function openLocalFile(url, openPath, checkAccess = access) {
  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'file:' || parsed.host) return false;
    const path = fileURLToPath(parsed);
    await checkAccess(path, constants.R_OK);
    const openError = await openPath(path);
    return openError === '';
  } catch {
    return false;
  }
}
