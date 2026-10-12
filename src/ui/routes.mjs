export const DESTINATIONS = Object.freeze([
  'overview', 'generators', 'work-queue', 'accounts', 'refresher', 'settings'
]);

export function resolveDestination(hash) {
  const candidate = typeof hash === 'string' && hash.startsWith('#')
    ? hash.slice(1) : '';
  return DESTINATIONS.includes(candidate) ? candidate : 'overview';
}

export function invalidDestination(hash) {
  return Boolean(hash && hash !== '#' && !DESTINATIONS.includes(hash.slice(1)));
}
