// Unit tests must never reach the paid API: any fetch to api.twelvedata.com that is not an explicit test double fails loudly.
const real = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/(^|\/\/)api\.twelvedata\.com/.test(url)) throw new Error('tests must not call api.twelvedata.com');
  return real(input, init);
}) as typeof fetch;
