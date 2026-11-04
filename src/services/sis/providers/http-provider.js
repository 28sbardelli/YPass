import { ExternalServiceError } from '#errors';

export async function fetchJson({
  fetchImpl,
  url,
  headers,
  timeoutMs,
  minIntervalMs,
  lastRequestAt,
  sleep,
  providerName,
}) {
  const wait = minIntervalMs - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ExternalServiceError(`${providerName} authentication failed`);
      }
      throw new ExternalServiceError(
        `${providerName} request failed with status ${response.status}`,
      );
    }
    return { payload: await response.json(), requestedAt: Date.now() };
  } catch (error) {
    if (error instanceof ExternalServiceError) throw error;
    if (error?.name === 'AbortError') {
      throw new ExternalServiceError(`${providerName} request timed out`);
    }
    throw new ExternalServiceError(`${providerName} request failed`);
  } finally {
    clearTimeout(timeout);
  }
}

export function requireHttpProvider(fetchImpl, providerName) {
  if (typeof fetchImpl !== 'function') {
    throw new ExternalServiceError(`A fetch implementation is required for ${providerName}`);
  }
}

export function pageRecords(payload, keys, providerName) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  throw new ExternalServiceError(`${providerName} returned an invalid student response`);
}

export function hasNextPage(payload, records, pageSize) {
  if (Object.hasOwn(payload, 'nextPage')) return Boolean(payload.nextPage);
  if (Object.hasOwn(payload, 'hasNextPage')) return Boolean(payload.hasNextPage);
  if (payload?.next) return true;
  if (payload?.links?.next) return true;
  if (payload?.paging?.next) return true;
  return records.length === pageSize;
}