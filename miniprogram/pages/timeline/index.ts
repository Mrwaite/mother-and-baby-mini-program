// 时间线：类型筛选、按天分组（标题吸顶）、相邻记录间隔/重叠、向下滚动每次加载 3 天、跳到指定日期

import { RECORD_TYPES } from '../../config/record-types';
import { careApi } from '../../services/api';
import { ensureSession } from '../../services/session';
import type { CareRecord, DaySummary } from '../../shared/api';
import type { CareType } from '../../shared/care';
import { DAY_MS, MINUTE_MS, addDays, dateKeyOf, dayStartFromKey, diffDays } from '../../shared/time';
import { store, watchDirty } from '../../store/index';
import { summaryText, toCardVM } from '../../utils/format';
import type { RecordCardVM } from '../../utils/format';
import { navMetrics } from '../../utils/layout';
import { syncTabBar } from '../../utils/tab-bar';
import { dayLabel, durationText } from '../../utils/time';

interface ItemVM extends RecordCardVM {
  /** 与下一条（更早的）记录之间：间隔 10分 / 重叠 46分 */
  gapText: string;
  overlap: boolean;
}

interface GroupVM {
  key: string;
  label: string;
  count: number;
  summary: string;
  items: ItemVM[];
}

const PAGE_DAYS = 3;
/** 列表接口单次最多查 31 天 */
const MAX_RANGE_DAYS = 31;

const records = new Map<number, CareRecord>();
const dirty = watchDirty(['care:changed']);
let newestKey = '';
let oldestKey = '';
let loadedAt = 0;
let loadSeq = 0;

function buildItems(list: CareRecord[], now: number): ItemVM[] {
  // list 按开始时间倒序
  return list.map((r, i) => {
    const vm: ItemVM = { ...toCardVM(r, now), gapText: '', overlap: false };
    const prev = list[i + 1];
    if (prev) {
      const prevEnd = prev.endAt ?? (prev.type === 'breastfeed' || prev.type === 'sleep' ? now : prev.startAt);
      const diff = r.startAt - prevEnd;
      if (diff < 0) {
        vm.overlap = true;
        vm.gapText = `重叠 ${durationText(-diff)}`;
      } else if (diff >= MINUTE_MS) {
        vm.gapText = `间隔 ${durationText(diff)}`;
      }
    }
    return vm;
  });
}

Page({
  data: {
    stickyTop: 0,
    filter: '' as CareType | '',
    filterOptions: [{ value: '', label: '全部' }].concat(RECORD_TYPES.map((t) => ({ value: t.type, label: t.label }))),
    groups: [] as GroupVM[],
    loading: false,
    loaded: false,
    noMore: false,
    todayKey: '',
    birthDate: '',
    jumped: false,
  },

  onLoad() {
    this.setData({ stickyTop: navMetrics().total });
  },

  async onShow() {
    syncTabBar(this, 1);
    if (!(await ensureSession())) return;
    const todayKey = dateKeyOf(store.now());
    const crossedDay = todayKey !== this.data.todayKey;
    this.setData({ todayKey, birthDate: store.baby?.birthDate ?? '' });
    if (!this.data.loaded || crossedDay) this.reset(todayKey);
    else if (dirty.take() || Date.now() - loadedAt > 60000) this.reload();
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  /** 从某天开始重新加载（含当天往前 3 天）。进行中的请求结果作废 */
  async reset(key: string) {
    dirty.take();
    loadSeq++;
    newestKey = key;
    oldestKey = addDays(key, 1);
    records.clear();
    this.setData({ groups: [], loading: false, noMore: false, loaded: false, jumped: key !== dateKeyOf(store.now()) });
    await this.loadMore();
  },

  /** 刷新已加载的范围（超过 31 天则回到起点） */
  async reload() {
    dirty.take();
    if (!newestKey || diffDays(oldestKey, newestKey) + 1 > MAX_RANGE_DAYS) {
      await this.reset(newestKey || dateKeyOf(store.now()));
      return;
    }
    const groups = await this.fetch(oldestKey, newestKey);
    if (groups) this.setData({ groups });
  },

  async loadMore() {
    if (this.data.loading || this.data.noMore || !newestKey) return;
    const birth = this.data.birthDate;
    const to = addDays(oldestKey, -1);
    let from = addDays(to, -(PAGE_DAYS - 1));
    if (birth && from < birth) from = birth;
    if (birth && to < birth) {
      this.setData({ noMore: true });
      return;
    }
    const groups = await this.fetch(from, to);
    if (!groups) return;
    oldestKey = from;
    this.setData({
      groups: this.data.groups.concat(groups),
      noMore: !!birth && from <= birth,
    });
  },

  /** 拉取 [from, to] 这几天的记录和每天汇总，返回分组（新的在前） */
  async fetch(from: string, to: string): Promise<GroupVM[] | null> {
    const seq = ++loadSeq;
    this.setData({ loading: true });
    try {
      const keys: string[] = [];
      for (let k = to; k >= from; k = addDays(k, -1)) keys.push(k);
      const [list, summaries] = await Promise.all([
        careApi.list(dayStartFromKey(from), dayStartFromKey(to) + DAY_MS, this.data.filter || undefined),
        Promise.all(keys.map((k) => careApi.summary(k))),
      ]);
      if (seq !== loadSeq) return null;
      loadedAt = Date.now();
      const now = store.now();
      list.forEach((r) => records.set(r.id, r));
      const byDay = new Map<string, CareRecord[]>();
      list.forEach((r) => {
        const k = dateKeyOf(r.startAt);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k)!.push(r);
      });
      return keys.map((key, i) => {
        const day = byDay.get(key) ?? [];
        const s: DaySummary = summaries[i];
        return { key, label: dayLabel(key, now), count: day.length, summary: summaryText(s), items: buildItems(day, now) };
      });
    } catch {
      return null;
    } finally {
      if (seq === loadSeq) this.setData({ loading: false, loaded: true });
    }
  },

  onFilter(e: WechatMiniprogram.CustomEvent<{ value: CareType | '' }>) {
    this.setData({ filter: e.detail.value });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this.reset(newestKey || dateKeyOf(store.now()));
  },

  onJump(e: WechatMiniprogram.PickerChange) {
    const key = String(e.detail.value);
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this.reset(key);
  },

  onBackToday() {
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this.reset(dateKeyOf(store.now()));
  },

  onOpenRecord(e: WechatMiniprogram.CustomEvent<{ id: number }>) {
    const r = records.get(e.detail.id);
    if (r) this.selectComponent('#record-sheet').open({ type: r.type, record: r });
  },

  onSaved() {
    this.reload();
  },
});
