const { resolveStreamUrl } = await import('./src/stream-resolver.ts').catch(async () => {
  // ts direct import won't work with plain node; use tsx instead
  return null;
});
