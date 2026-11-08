// 成长：分段切换「生长测量 / 里程碑」。测量显示最新值和 WHO 百分位区间，里程碑为竖向时间轴 + 九宫格照片

import { growthApi, milestoneApi } from '../../services/api';
import { ensureSession } from '../../services/session';
import type { Gender, GrowthRecord, Milestone } from '../../shared/api';
import { ageInMonths, dateKeyOf } from '../../shared/time';
import { store, watchDirty } from '../../store/index';
import { percentileBand } from '../../utils/growth-percentile';
import type { GrowthMetric } from '../../utils/growth-percentile';
import { syncTabBar } from '../../utils/tab-bar';
import { ageText, dateText } from '../../utils/time';

interface MetricVM {
  metric: GrowthMetric;
  label: string;
  value: string;
  unit: string;
  band: string;
  date: string;
}

interface MeasureVM {
  id: number;
  date: string;
  age: string;
  /** 各项指标及测量时所处的百分位区间 */
  values: { label: string; value: string; band: string }[];
  note: string;
}

interface MilestoneVM {
  id: number;
  date: string;
  age: string;
  title: string;
  description: string;
  photos: string[];
}

const METRICS: { metric: GrowthMetric; label: string; unit: string; key: 'heightCm' | 'weightKg' | 'headCm'; digits: number }[] = [
  { metric: 'height', label: '身高', unit: 'cm', key: 'heightCm', digits: 1 },
  { metric: 'weight', label: '体重', unit: 'kg', key: 'weightKg', digits: 2 },
  { metric: 'head', label: '头围', unit: 'cm', key: 'headCm', digits: 1 },
];

const growthDirty = watchDirty(['growth:changed', 'baby:changed']);
const milestoneDirty = watchDirty(['milestone:changed', 'baby:changed']);
let growthCache: GrowthRecord[] = [];

const fmt = (v: number, digits: number) => String(Number(v.toFixed(digits)));

Page({
  data: {
    tab: 'measure',
    tabs: [
      { value: 'measure', label: '生长测量' },
      { value: 'milestone', label: '里程碑' },
    ],
    ageLine: '',
    loadedMeasure: false,
    loadedMilestone: false,
    latest: [] as MetricVM[],
    measures: [] as MeasureVM[],
    milestones: [] as MilestoneVM[],
  },

  async onShow() {
    syncTabBar(this, 2);
    if (!(await ensureSession())) return;
    const baby = store.baby!;
    this.setData({ ageLine: `${baby.nickname} · ${ageText(baby.birthDate, dateKeyOf(store.now()))}` });
    this.loadCurrent();
  },

  onPullDownRefresh() {
    if (this.data.tab === 'measure') growthDirty.mark();
    else milestoneDirty.mark();
    this.loadCurrent().finally(() => wx.stopPullDownRefresh());
  },

  onTab(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ tab: e.detail.value });
    this.loadCurrent();
  },

  async loadCurrent() {
    if (this.data.tab === 'measure') {
      const changed = growthDirty.take();
      if (!this.data.loadedMeasure || changed) await this.loadMeasures();
    } else {
      const changed = milestoneDirty.take();
      if (!this.data.loadedMilestone || changed) await this.loadMilestones();
    }
  },

  async loadMeasures() {
    try {
      const list = await growthApi.list();
      growthCache = list;
      const baby = store.baby!;
      this.setData({
        loadedMeasure: true,
        latest: latestMetrics(list, baby.gender, baby.birthDate),
        measures: list.map((r) => {
          const months = ageInMonths(baby.birthDate, r.measureDate);
          return {
            id: r.id,
            date: dateText(r.measureDate),
            age: ageText(baby.birthDate, r.measureDate),
            values: METRICS.filter((m) => r[m.key] !== null).map((m) => {
              const v = r[m.key]!;
              return { label: m.label, value: `${fmt(v, m.digits)}${m.unit}`, band: percentileBand(baby.gender, m.metric, months, v) ?? '' };
            }),
            note: r.note ?? '',
          };
        }),
      });
    } catch {
      growthDirty.mark();
    }
  },

  async loadMilestones() {
    try {
      const list = await milestoneApi.list();
      const baby = store.baby!;
      this.setData({
        loadedMilestone: true,
        milestones: list.map((m: Milestone) => ({
          id: m.id,
          date: dateText(m.date),
          age: ageText(baby.birthDate, m.date),
          title: m.title,
          description: m.description ?? '',
          photos: m.photos.map((p) => p.fileId),
        })),
      });
    } catch {
      milestoneDirty.mark();
    }
  },

  onAdd() {
    if (this.data.tab === 'measure') wx.navigateTo({ url: '/pkg-growth/pages/measure-edit/index' });
    else wx.navigateTo({ url: '/pkg-growth/pages/milestone-edit/index' });
  },

  onEditMeasure(e: WechatMiniprogram.TouchEvent) {
    const record = growthCache.find((r) => r.id === Number(e.currentTarget.dataset.id));
    if (!record) return;
    wx.navigateTo({
      url: `/pkg-growth/pages/measure-edit/index?id=${record.id}`,
      success: (res) => res.eventChannel.emit('record', record),
    });
  },

  onEditMilestone(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: `/pkg-growth/pages/milestone-edit/index?id=${e.currentTarget.dataset.id}` });
  },

  onPreview(e: WechatMiniprogram.TouchEvent) {
    const { mid, index } = e.currentTarget.dataset as { mid: number; index: number };
    const m = this.data.milestones.find((x) => x.id === Number(mid));
    if (m) wx.previewImage({ urls: m.photos, current: m.photos[Number(index)] });
  },

  goCurve() {
    wx.navigateTo({ url: '/pkg-growth/pages/curve/index' });
  },
});

/** 每项指标取最近一次有值的测量，并算出百分位区间 */
function latestMetrics(list: GrowthRecord[], gender: Gender, birthDate: string): MetricVM[] {
  return METRICS.map((m) => {
    const r = list.find((x) => x[m.key] !== null);
    if (!r) return { metric: m.metric, label: m.label, value: '—', unit: '', band: '', date: '' };
    const value = r[m.key]!;
    return {
      metric: m.metric,
      label: m.label,
      value: fmt(value, m.digits),
      unit: m.unit,
      band: percentileBand(gender, m.metric, ageInMonths(birthDate, r.measureDate), value) ?? '',
      date: dateText(r.measureDate),
    };
  });
}
