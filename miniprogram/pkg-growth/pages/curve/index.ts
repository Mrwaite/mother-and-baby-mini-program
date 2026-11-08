// 生长曲线：Canvas 2D 自绘。WHO P3/P15/P50/P85/P97 五条参考线 + 宝宝的实测点（含出生数据）

import { growthApi } from '../../../services/api';
import type { Baby, GrowthRecord } from '../../../shared/api';
import { ageInMonths, dateKeyOf } from '../../../shared/time';
import { store } from '../../../store/index';
import { MAX_MONTHS, PERCENTILES, percentileBand, referenceAt } from '../../../utils/growth-percentile';
import type { GrowthMetric } from '../../../utils/growth-percentile';
import { ageText, dateText } from '../../../utils/time';

/** 用到的 Canvas 2D 接口（基础库类型里没有 DOM 的 CanvasRenderingContext2D） */
interface Ctx2D {
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
}

interface Point {
  months: number;
  value: number;
  date: string;
}

const METRIC_META: Record<GrowthMetric, { label: string; unit: string; key: 'heightCm' | 'weightKg' | 'headCm'; birthKey: 'birthHeightCm' | 'birthWeightKg' | 'birthHeadCm' }> = {
  height: { label: '身高', unit: 'cm', key: 'heightCm', birthKey: 'birthHeightCm' },
  weight: { label: '体重', unit: 'kg', key: 'weightKg', birthKey: 'birthWeightKg' },
  head: { label: '头围', unit: 'cm', key: 'headCm', birthKey: 'birthHeadCm' },
};

const COLOR_LINE = '#C9C2BB';
const COLOR_P50 = '#8A8580';
const COLOR_BAND = 'rgba(232, 131, 58, 0.08)';
const COLOR_POINT = '#D9443A';
const COLOR_TEXT = '#8A8580';

let records: GrowthRecord[] = [];

function pointsOf(metric: GrowthMetric, baby: Baby): Point[] {
  const meta = METRIC_META[metric];
  const points: Point[] = [];
  const birthValue = baby[meta.birthKey];
  if (birthValue !== null) points.push({ months: 0, value: birthValue, date: baby.birthDate });
  records.forEach((r) => {
    const v = r[meta.key];
    if (v !== null && r.measureDate >= baby.birthDate) {
      points.push({ months: ageInMonths(baby.birthDate, r.measureDate), value: v, date: r.measureDate });
    }
  });
  return points.sort((a, b) => a.months - b.months);
}

Page({
  data: {
    metric: 'height' as GrowthMetric,
    tabs: [
      { value: 'height', label: '身高' },
      { value: 'weight', label: '体重' },
      { value: 'head', label: '头围' },
    ],
    unit: 'cm',
    metricLabel: '身高',
    rows: [] as { key: number; date: string; age: string; value: string; band: string }[],
    empty: false,
  },

  async onLoad() {
    try {
      records = await growthApi.list();
    } catch {
      records = [];
    }
    this.render();
  },

  onTab(e: WechatMiniprogram.CustomEvent<{ value: GrowthMetric }>) {
    this.setData({ metric: e.detail.value });
    this.render();
  },

  render() {
    const baby = store.baby;
    if (!baby) return;
    const metric = this.data.metric;
    const meta = METRIC_META[metric];
    const points = pointsOf(metric, baby);
    this.setData({
      unit: meta.unit,
      metricLabel: meta.label,
      empty: points.length === 0,
      rows: points
        .slice()
        .reverse()
        .map((p, i) => ({
          key: i,
          date: p.months === 0 && p.date === baby.birthDate ? '出生' : dateText(p.date),
          age: ageText(baby.birthDate, p.date),
          value: `${p.value} ${meta.unit}`,
          band: percentileBand(baby.gender, metric, p.months, p.value) ?? '',
        })),
    });
    this.createSelectorQuery()
      .select('#curve')
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) return;
        const canvas = info.node as { width: number; height: number; getContext(type: '2d'): Ctx2D };
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = info.width * dpr;
        canvas.height = info.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        draw(ctx, info.width, info.height, baby, metric, points);
      });
  },
});

function draw(ctx: Ctx2D, width: number, height: number, baby: Baby, metric: GrowthMetric, points: Point[]) {
  ctx.clearRect(0, 0, width, height);
  const pad = { left: 40, right: 36, top: 16, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // 横轴：0 到「当前月龄 + 2」，至少 6 个月，取偶数
  const nowMonths = ageInMonths(baby.birthDate, dateKeyOf(store.now()));
  const lastPoint = points.length ? points[points.length - 1].months : 0;
  let maxX = Math.ceil(Math.max(nowMonths, lastPoint) + 2);
  maxX = Math.min(MAX_MONTHS, Math.max(6, maxX + (maxX % 2)));

  // 参考线采样（每 0.25 个月一个点）
  const samples: { m: number; refs: number[] }[] = [];
  for (let m = 0; m <= maxX + 1e-9; m += 0.25) {
    const refs = referenceAt(baby.gender, metric, m);
    if (refs) samples.push({ m, refs });
  }
  let minY = Infinity;
  let maxY = -Infinity;
  samples.forEach((s) => {
    minY = Math.min(minY, s.refs[0]);
    maxY = Math.max(maxY, s.refs[s.refs.length - 1]);
  });
  points.forEach((p) => {
    if (p.months <= maxX) {
      minY = Math.min(minY, p.value);
      maxY = Math.max(maxY, p.value);
    }
  });
  const span = maxY - minY || 1;
  minY -= span * 0.05;
  maxY += span * 0.05;

  const x = (m: number) => pad.left + (m / maxX) * plotW;
  const y = (v: number) => pad.top + (1 - (v - minY) / (maxY - minY)) * plotH;

  // 网格与刻度
  ctx.font = '10px sans-serif';
  ctx.fillStyle = COLOR_TEXT;
  ctx.strokeStyle = '#F0EBE6';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  const yStep = niceStep((maxY - minY) / 5);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(minY / yStep) * yStep; v <= maxY; v += yStep) {
    ctx.beginPath();
    ctx.moveTo(pad.left, y(v));
    ctx.lineTo(width - pad.right, y(v));
    ctx.stroke();
    ctx.fillText(String(Number(v.toFixed(1))), pad.left - 6, y(v));
  }
  const xStep = maxX <= 12 ? 1 : maxX <= 24 ? 3 : 6;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let m = 0; m <= maxX; m += xStep) {
    ctx.fillText(m === 0 ? '出生' : `${m}月`, x(m), height - pad.bottom + 8);
  }

  // P3–P97 浅色带
  if (samples.length) {
    ctx.fillStyle = COLOR_BAND;
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(x(s.m), y(s.refs[0])) : ctx.moveTo(x(s.m), y(s.refs[0]))));
    for (let i = samples.length - 1; i >= 0; i--) ctx.lineTo(x(samples[i].m), y(samples[i].refs[4]));
    ctx.closePath();
    ctx.fill();
  }

  // 五条参考线，右侧标注百分位
  PERCENTILES.forEach((p, idx) => {
    ctx.strokeStyle = p === 50 ? COLOR_P50 : COLOR_LINE;
    ctx.lineWidth = p === 50 ? 1.5 : 1;
    ctx.setLineDash(p === 3 || p === 97 ? [4, 3] : []);
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(x(s.m), y(s.refs[idx])) : ctx.moveTo(x(s.m), y(s.refs[idx]))));
    ctx.stroke();
    const last = samples[samples.length - 1];
    if (last) {
      ctx.fillStyle = COLOR_TEXT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`P${p}`, width - pad.right + 4, y(last.refs[idx]));
    }
  });

  // 宝宝的实测点
  const visible = points.filter((pt) => pt.months <= maxX);
  ctx.setLineDash([]);
  ctx.strokeStyle = COLOR_POINT;
  ctx.lineWidth = 2;
  if (visible.length > 1) {
    ctx.beginPath();
    visible.forEach((pt, i) => (i ? ctx.lineTo(x(pt.months), y(pt.value)) : ctx.moveTo(x(pt.months), y(pt.value))));
    ctx.stroke();
  }
  visible.forEach((pt) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x(pt.months), y(pt.value), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

/** 刻度步长取 1 / 2 / 5 × 10^n */
function niceStep(raw: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}
