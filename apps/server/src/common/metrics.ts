/**
 * 轻量级 Prometheus 指标注册表（零依赖）：
 * - 计数器：按 method/route/status 维度统计请求量、错误数
 * - 直方图：请求耗时按桶累计（+Inf 兜底），可算 P95/P99
 * 只保留有限基数：route 使用 Express 的路径模板（如 /api/v1/articles/:id），避免标签爆炸。
 */
const BUCKETS_SECONDS = [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5];

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  return Object.keys(labels).sort().map((key) => key + '="' + String(labels[key]).replace(/"/g, '\\"') + '"').join(',');
}

class Counter {
  readonly name: string;
  readonly help: string;
  private readonly values = new Map<string, number>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Labels, value = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  render(): string[] {
    const lines = ['# HELP ' + this.name + ' ' + this.help, '# TYPE ' + this.name + ' counter'];
    if (this.values.size === 0) lines.push(this.name + ' 0');
    for (const [labels, value] of this.values) lines.push(this.name + '{' + labels + '} ' + value);
    return lines;
  }
}

class Histogram {
  readonly name: string;
  readonly help: string;
  private readonly buckets: Array<{ le: number; key: string; count: number }> = [];
  private readonly series = new Map<string, { counts: number[]; sum: number; count: number }>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
    this.buckets = BUCKETS_SECONDS.map((le) => ({ le, key: String(le), count: 0 }));
  }

  observe(labels: Labels, seconds: number): void {
    const key = labelKey(labels);
    const entry = this.series.get(key) ?? { counts: BUCKETS_SECONDS.map(() => 0), sum: 0, count: 0 };
    BUCKETS_SECONDS.forEach((le, index) => {
      if (seconds <= le) entry.counts[index] = (entry.counts[index] ?? 0) + 1;
    });
    entry.sum += seconds;
    entry.count += 1;
    this.series.set(key, entry);
  }

  render(): string[] {
    const lines = ['# HELP ' + this.name + ' ' + this.help, '# TYPE ' + this.name + ' histogram'];
    for (const [labels, entry] of this.series) {
      BUCKETS_SECONDS.forEach((le, index) => {
        lines.push(this.name + '_bucket{' + labels + ',le="' + le + '"} ' + (entry.counts[index] ?? 0));
      });
      lines.push(this.name + '_bucket{' + labels + ',le="+Inf"} ' + entry.count);
      lines.push(this.name + '_sum{' + labels + '} ' + entry.sum.toFixed(6));
      lines.push(this.name + '_count{' + labels + '} ' + entry.count);
    }
    if (this.series.size === 0) {
      lines.push(this.name + '_bucket{le="+Inf"} 0');
      lines.push(this.name + '_sum 0');
      lines.push(this.name + '_count 0');
    }
    return lines;
  }
}

export const httpRequestsTotal = new Counter('http_requests_total', 'HTTP 请求总数（按 method/route/status）');
export const httpRequestErrors = new Counter('http_request_errors_total', 'HTTP 4xx/5xx 响应总数（按 method/route/status）');
export const httpRequestDuration = new Histogram('http_request_duration_seconds', 'HTTP 请求耗时分布（秒）');
export const businessEvents = new Counter('app_business_events_total', '业务事件计数（登录、审核、导入导出等）');

export function countBusinessEvent(event: string, labels: Labels = {}): void {
  businessEvents.inc({ event, ...labels });
}

/** 渲染成 Prometheus 文本格式（含进程/运行时指标） */
export function renderMetrics(): string {
  const memory = process.memoryUsage();
  const lines: string[] = [
    ...httpRequestsTotal.render(),
    ...httpRequestErrors.render(),
    ...httpRequestDuration.render(),
    ...businessEvents.render(),
    '# HELP process_uptime_seconds 进程运行时长（秒）',
    '# TYPE process_uptime_seconds gauge',
    'process_uptime_seconds ' + process.uptime().toFixed(3),
    '# HELP process_resident_memory_bytes 常驻内存（字节）',
    '# TYPE process_resident_memory_bytes gauge',
    'process_resident_memory_bytes ' + memory.rss,
    '# HELP nodejs_heap_used_bytes V8 堆使用量（字节）',
    '# TYPE nodejs_heap_used_bytes gauge',
    'nodejs_heap_used_bytes ' + memory.heapUsed,
    '# HELP app_db_pool_connections 数据库连接池连接数',
    '# TYPE app_db_pool_connections gauge',
    'app_db_pool_connections ' + poolSize()
  ];
  return lines.join('\n') + '\n';
}

let poolSizeProvider: () => number = () => 0;

/** 由 db/pool.ts 注入，避免 metrics 反向依赖数据库模块 */
export function registerPoolSizeProvider(provider: () => number): void {
  poolSizeProvider = provider;
}

function poolSize(): number {
  try {
    return poolSizeProvider();
  } catch {
    return 0;
  }
}
