// WHO 生长标准百分位：用 LMS 参数计算（月龄在相邻两个月之间线性插值）

import { WHO_FEMALE, WHO_MALE } from '../data/who';
import type { LmsRow, WhoTable } from '../data/who';
import type { Gender } from '../shared/api';

export type GrowthMetric = 'height' | 'weight' | 'head';

export const PERCENTILES = [3, 15, 50, 85, 97] as const;
/** 各百分位对应的 Z 值 */
const Z: Record<(typeof PERCENTILES)[number], number> = { 3: -1.880794, 15: -1.036433, 50: 0, 85: 1.036433, 97: 1.880794 };

export const MAX_MONTHS = 60;

export function tableOf(gender: Gender): WhoTable {
  return gender === 'male' ? WHO_MALE : WHO_FEMALE;
}

/** 某月龄（可带小数）的 LMS；超出 0–60 月返回 null */
export function lmsAt(gender: Gender, metric: GrowthMetric, months: number): LmsRow | null {
  if (months < 0 || months > MAX_MONTHS) return null;
  const rows = tableOf(gender)[metric];
  const i = Math.floor(months);
  const a = rows[i];
  const b = rows[Math.min(i + 1, MAX_MONTHS)];
  const t = months - i;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Z 值对应的测量值 */
export function valueAtZ([l, m, s]: LmsRow, z: number): number {
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

/** 测量值对应的 Z 值 */
export function zOf([l, m, s]: LmsRow, x: number): number {
  return l === 0 ? Math.log(x / m) / s : (Math.pow(x / m, l) - 1) / (l * s);
}

/** 某月龄的 P3/P15/P50/P85/P97 参考值 */
export function referenceAt(gender: Gender, metric: GrowthMetric, months: number): number[] | null {
  const lms = lmsAt(gender, metric, months);
  return lms ? PERCENTILES.map((p) => valueAtZ(lms, Z[p])) : null;
}

/** 测量值所在的百分位区间，如「P50–P85」「< P3」 */
export function percentileBand(gender: Gender, metric: GrowthMetric, months: number, value: number): string | null {
  const lms = lmsAt(gender, metric, months);
  if (!lms || value <= 0) return null;
  const z = zOf(lms, value);
  if (z < Z[3]) return '< P3';
  if (z > Z[97]) return '> P97';
  for (let i = 0; i < PERCENTILES.length - 1; i++) {
    const lo = PERCENTILES[i];
    const hi = PERCENTILES[i + 1];
    if (z <= Z[hi]) return `P${lo}–P${hi}`;
  }
  return null;
}
