/**
 * HEAVIX Metrics Helper — simple Prometheus text format generator.
 * T5-W2: Observability metrics.
 */

export function getMetricsText(metrics: Record<string, number>): string {
  let output = '';
  for (const [key, value] of Object.entries(metrics)) {
    output += `# TYPE ${key} gauge\n`;
    output += `${key} ${value}\n`;
  }
  return output;
}

export const startTime = Date.now();

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}
