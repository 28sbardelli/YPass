export async function runHttp({ target, path, rps, durationSeconds }) {
  const started = Date.now();
  const latencies = [];
  let success = 0;
  let failure = 0;
  const end = started + durationSeconds * 1000;
  const interval = 1000 / Math.max(rps, 1);

  while (Date.now() < end) {
    const requestStarted = Date.now();
    try {
      const response = await fetch(`${target}${path}`, { signal: AbortSignal.timeout(5000) });
      latencies.push(Date.now() - requestStarted);
      if (response.ok || response.status === 302 || response.status === 401) {
        success += 1;
      } else {
        failure += 1;
      }
    } catch {
      failure += 1;
      latencies.push(Date.now() - requestStarted);
    }
    const wait = interval - (Date.now() - requestStarted);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  return summarize(success, failure, latencies, durationSeconds);
}

export function summarize(success, failure, latencies, durationSeconds) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] || 0;
  return {
    success,
    failure,
    throughput: (success + failure) / Math.max(durationSeconds, 1),
    latencyMs: { p50: pct(50), p95: pct(95), max: sorted[sorted.length - 1] || 0 },
  };
}
