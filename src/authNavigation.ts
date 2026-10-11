export function getAuthReturnPath(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) return null;
  const from = (state as { from?: unknown }).from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/signin'
    ? from
    : null;
}
