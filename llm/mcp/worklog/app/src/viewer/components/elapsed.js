export function elapsed(createdAt, now = Date.now()) {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) return 'unavailable';
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

export function elapsedBetween(createdAt, completedAt, now = Date.now()) {
  const end = completedAt === undefined ? now : Date.parse(completedAt);
  if (!Number.isFinite(end)) return 'unavailable';
  return elapsed(createdAt, end);
}

export function hasValidCreatedAt(createdAt) {
  return Number.isFinite(Date.parse(createdAt));
}
