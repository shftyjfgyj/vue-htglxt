export interface DiffLine {
  type: 'same' | 'add' | 'del';
  leftNo: number | null;
  rightNo: number | null;
  text: string;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  truncated: boolean;
}

const MAX_LINES = 600;

/** 行级 LCS diff（够用于文章版本对比；超长文本截断以保护性能） */
export function diffLines(leftText: string, rightText: string): DiffResult {
  const leftAll = leftText.split(/\r?\n/);
  const rightAll = rightText.split(/\r?\n/);
  const truncated = leftAll.length > MAX_LINES || rightAll.length > MAX_LINES;
  const a = truncated ? leftAll.slice(0, MAX_LINES) : leftAll;
  const b = truncated ? rightAll.slice(0, MAX_LINES) : rightAll;

  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i += 1) dp.push(new Uint32Array(m + 1));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: 'same', leftNo: i + 1, rightNo: j + 1, text: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push({ type: 'del', leftNo: i + 1, rightNo: null, text: a[i]! });
      removed += 1;
      i += 1;
    } else {
      lines.push({ type: 'add', leftNo: null, rightNo: j + 1, text: b[j]! });
      added += 1;
      j += 1;
    }
  }
  while (i < n) {
    lines.push({ type: 'del', leftNo: i + 1, rightNo: null, text: a[i]! });
    removed += 1;
    i += 1;
  }
  while (j < m) {
    lines.push({ type: 'add', leftNo: null, rightNo: j + 1, text: b[j]! });
    added += 1;
    j += 1;
  }

  return { lines, added, removed, truncated };
}
