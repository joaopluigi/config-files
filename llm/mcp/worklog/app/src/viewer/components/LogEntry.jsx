function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function deriveHome(workingDirectory) {
  const normalized = normalizePath(workingDirectory ?? '');
  const match = normalized.match(/^(?:\/Users|\/home)\/([^/]+)(?:\/|$)/i);
  if (match) return normalized.slice(0, match.index + match[0].length - 1);
  const windowsMatch = normalized.match(/^([a-z]:)\/Users\/([^/]+)(?:\/|$)/i);
  if (windowsMatch) return `${windowsMatch[1]}/Users/${windowsMatch[2]}`;
  return null;
}

function fileUrl(value, workingDirectory) {
  const normalized = normalizePath(value);
  if (
    /^[a-z][a-z\d+.-]*:/i.test(normalized) &&
    !/^[a-z]:\//i.test(normalized) &&
    !/^file:/i.test(normalized)
  )
    return null;
  if (/^\/\//.test(normalized)) {
    if (!value.startsWith('\\\\')) return null;
    const [host, ...parts] = normalized.slice(2).split('/');
    if (!host || parts.some((part) => part === '..')) return null;
    return `file://${host}/${parts.map(encodeURIComponent).join('/')}`;
  }
  if (/^file:/i.test(normalized)) {
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'file:') return null;
      const rawPath = normalized.replace(/^file:\/\/[^/]*/i, '').split(/[?#]/, 1)[0];
      const decodedPath = decodeURIComponent(rawPath);
      if (decodedPath.split('/').includes('..')) return null;
      return url.href;
    } catch {
      return null;
    }
  }
  if (normalized.split('/').includes('..')) return null;
  const homeRelative = normalized === '~' || normalized.startsWith('~/');
  const home = homeRelative ? deriveHome(workingDirectory) : null;
  if (homeRelative && !home) return null;
  if (!homeRelative && !workingDirectory && !normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized))
    return null;
  const base = homeRelative
    ? `${home}${normalized.slice(1)}`
    : normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)
      ? normalized
      : `${normalizePath(workingDirectory)}/${normalized}`;
  const drive = base.match(/^([a-z]):\/(.*)$/i);
  const root = drive ? `/${drive[1].toUpperCase()}:/` : base.startsWith('/') ? '/' : null;
  const parts = (drive ? drive[2] : base.slice(1)).split('/');
  const output = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!output.length) return null;
      output.pop();
    } else output.push(part);
  }
  if (!root || !output.length) return null;
  const path = `${root}${output.map(encodeURIComponent).join('/')}`;
  return `file://${path}`;
}

function sourceUrls(message, workingDirectory) {
  const sources = [];
  const pattern = /(?:^|[\s;—]|\\n)src:\s*([^\s;—]+?)(?=\\n|[\s;—]|$)/g;
  for (const match of message.matchAll(pattern)) {
    const raw = match[1].replace(/[.,!?;:]+$/, '');
    let href = null;
    try {
      const url = new URL(raw);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname) href = url.href;
    } catch {
      href = fileUrl(raw, workingDirectory);
    }
    if (!href) href = fileUrl(raw, workingDirectory);
    if (href) sources.push({ label: raw, href });
  }
  return sources;
}

export function LogEntry({ entry, color, workingDirectory }) {
  const sources = sourceUrls(entry.message, workingDirectory);
  return (
    <li className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="metadata-grid grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,auto)_auto_minmax(0,1fr)] sm:items-center">
        <code className="font-mono text-sm text-slate-600">{entry.time}</code>
        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
          {entry.actor}
        </span>
        <span className="metadata-item rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">
          #{entry.item}
        </span>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            color ?? 'bg-blue-100 text-blue-700'
          }`}
        >
          {entry.tag}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
        {entry.message}
      </p>
      {sources.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
          <span className="font-medium text-slate-700">Sources:</span>{' '}
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {sources.map(({ label, href }) => (
              <a
                className="break-all text-blue-700 underline"
                href={href}
                key={`${label}-${href}`}
                rel="noreferrer noopener"
                target="_blank"
              >
                {label}
              </a>
            ))}
          </span>
        </div>
      )}
    </li>
  );
}
