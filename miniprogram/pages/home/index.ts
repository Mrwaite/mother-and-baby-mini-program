// 首页：问候 + 宝宝信息、进行中计时条、概览卡片、低库存提示、快速记录、今天的记录

import { RECORD_TYPES, RECORD_TYPE_MAP } from '../../config/record-types';
import { careApi } from '../../services/api';
import { ensureSession } from '../../services/session';
import type { CareRecord, DashboardResponse } from '../../shared/api';
import { LABELS, activeSide } from '../../shared/care';
import type { CareType } from '../../shared/care';
import { dateKeyOf, diffDays } from '../../shared/time';
import { store, watchDirty } from '../../store/index';
import { toCardVM } from '../../utils/format';
import type { RecordCardVM } from '../../utils/format';
import { setLowStockCount, syncTabBar } from '../../utils/tab-bar';
import { dateText, durationText, greeting } from '../../utils/time';

interface RunningVM {
  id: number;
  label: string;
  color: string;
  bg: string;
  side: string;
  startAt: number;
}

const records = new Map<number, CareRecord>();
const dirty = watchDirty(['care:changed', 'baby:changed', 'inventory:changed']);
let loadedAt = 0;

function sheet(page: WechatMiniprogram.Page.TrivialInstance) {
  return page.selectComponent('#record-sheet');
}

Page({
  data: {
    loaded: false,
    error: false,
    greeting: '',
    nickname: '',
    avatar: '👶',
    ageLine: '',
    running: [] as RunningVM[],
    lastFeedAt: 0,
    lastFeedLabel: '',
    lastDiaperAt: 0,
    /** 今日汇总（已格式化的文字） */
    feedLines: [] as string[],
    sleepText: '0分',
    diaperLine: '',
    lowStockText: '',
    quick: RECORD_TYPES.map((t) => ({ ...t, running: false })),
    recent: [] as RecordCardVM[],
  },

  onShow() {
    syncTabBar(this, 0);
    this.renderHeader();
    // 家人可能刚记录过：每次回到首页都刷新（30 秒内且本地无改动时跳过）
    const changed = dirty.take();
    // reLaunch 会重建页面实例，但模块缓存仍在；新实例必须先拉取数据。
    if (!this.data.loaded || changed || Date.now() - loadedAt > 30000) this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  renderHeader() {
    const baby = store.baby;
    const now = store.now();
    const today = dateKeyOf(now);
    this.setData({
      greeting: greeting(now),
      nickname: baby?.nickname ?? '',
      avatar: baby?.gender === 'female' ? '👧' : baby ? '👦' : '👶',
      ageLine: baby ? `出生第 ${diffDays(baby.birthDate, today) + 1} 天 · ${dateText(today)}` : dateText(today),
    });
  },

  async load() {
    if (!(await ensureSession())) {
      this.setData({ error: !store.user });
      return;
    }
    this.renderHeader();
    try {
      const d = await careApi.dashboard();
      store.syncServerTime(d.serverTime);
      loadedAt = Date.now();
      this.render(d);
    } catch {
      this.setData({ error: !this.data.loaded });
    }
  },

  render(d: DashboardResponse) {
    const now = store.now();
    records.clear();
    [...d.running, ...d.recent].forEach((r) => records.set(r.id, r));
    if (d.lastFeed) records.set(d.lastFeed.id, d.lastFeed);

    const running: RunningVM[] = d.running.map((r) => {
      const meta = RECORD_TYPE_MAP[r.type];
      const side = r.type === 'breastfeed' ? activeSide(r.payload.segments) : null;
      return { id: r.id, label: meta.label, color: meta.color, bg: meta.bg, side: side ? LABELS.side[side] : '', startAt: r.startAt };
    });
    const runningTypes = new Set<CareType>(d.running.map((r) => r.type));

    const low = d.lowStockItems[0];
    const lowStockText = low
      ? `${low.name}${low.spec ? ` ${low.spec}` : ''} 仅剩 ${low.quantity} ${low.unit}${d.lowStockCount > 1 ? ` 等 ${d.lowStockCount} 项` : ''}`
      : '';
    setLowStockCount(d.lowStockCount);
    syncTabBar(this, 0);

    const today = d.today;
    const feedLines = [
      `瓶喂 ${today.bottle.count} 次 · ${today.bottle.totalMl} mL`,
      `亲喂 ${today.breastfeed.count} 次${today.breastfeed.totalMs ? ` · ${durationText(today.breastfeed.totalMs)}` : ''}`,
    ];
    if (today.pump.count) feedLines.push(`吸奶 ${today.pump.totalMl} mL`);

    this.setData({
      loaded: true,
      error: false,
      running,
      lastFeedAt: d.lastFeed?.startAt ?? 0,
      lastFeedLabel: d.lastFeed ? RECORD_TYPE_MAP[d.lastFeed.type].label : '',
      lastDiaperAt: d.lastDiaper?.startAt ?? 0,
      feedLines,
      sleepText: durationText(today.sleep.totalMs),
      diaperLine: `尿布 ${today.diaper.count} 次${today.diaper.count ? `（尿 ${today.diaper.pee} · 便 ${today.diaper.poo}）` : ''}`,
      lowStockText,
      quick: RECORD_TYPES.map((t) => ({ ...t, running: runningTypes.has(t.type) })),
      recent: d.recent.map((r) => toCardVM(r, now)),
    });
  },

  onQuick(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as CareType;
    // 已有进行中的同类计时：直接打开计时中
    const running = [...records.values()].find((r) => r.type === type && r.endAt === null && RECORD_TYPE_MAP[type].timer);
    sheet(this).open({ type, record: running ?? null });
  },

  onOpenRecord(e: WechatMiniprogram.CustomEvent<{ id: number }>) {
    const r = records.get(e.detail.id);
    if (r) sheet(this).open({ type: r.type, record: r });
  },

  onOpenRunning(e: WechatMiniprogram.TouchEvent) {
    const r = records.get(Number(e.currentTarget.dataset.id));
    if (r) sheet(this).open({ type: r.type, record: r });
  },

  /** 计时条上的「结束」：直接结束并保存 */
  async onStopRunning(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    try {
      await careApi.update(id, { endAt: store.now() });
      wx.vibrateShort({ type: 'light', fail: () => undefined });
      wx.showToast({ title: '已结束', icon: 'success' });
      store.emit('care:changed');
      dirty.take();
      this.load();
    } catch (err) {
      wx.showToast({ title: (err as Error).message || '操作失败', icon: 'none' });
    }
  },

  onSaved() {
    dirty.take();
    this.load();
  },

  onRetry() {
    this.load();
  },

  goProfile() {
    wx.navigateTo({ url: '/pkg-profile/pages/profile/index' });
  },

  goTimeline() {
    wx.switchTab({ url: '/pages/timeline/index' });
  },

  goInventory() {
    wx.switchTab({ url: '/pages/inventory/index' });
  },
});
