export function printReport(name, stats) {
  console.log(
    `[${name}] success=${stats.success} failure=${stats.failure} rps=${stats.throughput.toFixed(1)} p50=${stats.latencyMs.p50}ms p95=${stats.latencyMs.p95}ms`,
  );
}
