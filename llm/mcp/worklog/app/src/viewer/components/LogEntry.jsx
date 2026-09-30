function sourceUrls(message) {
  return [...message.matchAll(/(?:^|\s)src:\s*(\S+)/g)]
    .map((match) => match[1].replace(/[.,!?;:]+$/, ''))
    .filter((value) => {
      try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname;
      } catch {
        return false;
      }
    });
}

export function LogEntry({ entry }) {
  const sources = sourceUrls(entry.message);
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
        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
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
            {sources.map((source) => (
              <a
                className="break-all text-blue-700 underline"
                href={source}
                key={source}
                rel="noreferrer noopener"
                target="_blank"
              >
                {source}
              </a>
            ))}
          </span>
        </div>
      )}
    </li>
  );
}
