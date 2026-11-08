// 耗材详情：当前库存、入库 / 出库 / 盘点（数量弹层）、流水列表（向下滚动分页）

import { inventoryApi } from '../../../services/api';
import { ApiError } from '../../../services/request';
import type { InventoryItem, InventoryLog } from '../../../shared/api';
import { INVENTORY_ACTION_LABELS, INVENTORY_CATEGORY_LABELS } from '../../../shared/inventory';
import type { InventoryAction } from '../../../shared/inventory';
import { store, watchDirty } from '../../../store/index';
import { dateKeyOf } from '../../../shared/time';
import { yuan } from '../../../utils/format';
import { tsOf, whenText } from '../../../utils/time';

interface LogVM {
  id: number;
  action: string;
  delta: string;
  positive: boolean;
  after: number;
  time: string;
  recorder: string;
  extra: string;
}

const PAGE_SIZE = 30;

function toLogVM(l: InventoryLog, now: number): LogVM {
  return {
    id: l.id,
    action: l.note === '初始库存' ? '初始库存' : INVENTORY_ACTION_LABELS[l.action],
    delta: l.delta > 0 ? `+${l.delta}` : String(l.delta),
    positive: l.delta >= 0,
    after: l.quantityAfter,
    time: whenText(l.occurredAt, now),
    recorder: l.createdByName,
    extra: [yuan(l.priceCents), l.channel, l.note !== '初始库存' && l.note].filter(Boolean).join(' · '),
  };
}

let dirty = watchDirty(['inventory:changed']);

Page({
  data: {
    id: 0,
    item: null as InventoryItem | null,
    categoryLabel: '',
    logs: [] as LogVM[],
    noMore: false,
    loadingLogs: false,

    sheetShow: false,
    action: 'in' as InventoryAction,
    actionTitle: '',
    qty: 1,
    priceText: '',
    channel: '',
    note: '',
    /** 发生日期：默认今天；补记往天时按当天 12:00 记 */
    occurredDate: '',
    today: '',
    submitting: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ id: Number(query.id) || 0 });
    dirty.dispose();
    dirty = watchDirty(['inventory:changed']);
  },

  onShow() {
    if (dirty.take()) this.load();
  },

  onUnload() {
    dirty.dispose();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadLogs(false);
  },

  async load() {
    try {
      const item = await inventoryApi.get(this.data.id);
      this.setData({ item, categoryLabel: INVENTORY_CATEGORY_LABELS[item.category] });
      await this.loadLogs(true);
    } catch {
      dirty.mark();
    }
  },

  async loadLogs(reset: boolean) {
    if (this.data.loadingLogs || (!reset && this.data.noMore)) return;
    const before = reset || !this.data.logs.length ? undefined : this.data.logs[this.data.logs.length - 1].id;
    this.setData({ loadingLogs: true });
    try {
      const list = await inventoryApi.logs(this.data.id, before, PAGE_SIZE);
      const now = store.now();
      const vms = list.map((l) => toLogVM(l, now));
      this.setData({ logs: reset ? vms : this.data.logs.concat(vms), noMore: list.length < PAGE_SIZE });
    } catch {
      // request 已提示
    } finally {
      this.setData({ loadingLogs: false });
    }
  },

  onEdit() {
    wx.navigateTo({ url: `/pkg-inventory/pages/item-edit/index?id=${this.data.id}` });
  },

  onAction(e: WechatMiniprogram.TouchEvent) {
    const action = e.currentTarget.dataset.action as InventoryAction;
    const item = this.data.item;
    if (!item) return;
    const today = dateKeyOf(store.now());
    this.setData({
      sheetShow: true,
      action,
      actionTitle: action === 'adjust' ? '盘点：实际还剩多少' : INVENTORY_ACTION_LABELS[action],
      qty: action === 'adjust' ? item.quantity : 1,
      priceText: '',
      channel: '',
      note: '',
      occurredDate: today,
      today,
    });
  },

  onDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ occurredDate: String(e.detail.value) });
  },

  onCloseSheet() {
    this.setData({ sheetShow: false });
  },

  onQty(e: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.setData({ qty: e.detail.value });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ [String(e.currentTarget.dataset.field)]: e.detail.value });
  },

  async onSubmit() {
    const d = this.data;
    if (d.submitting || !d.item) return;
    if (d.action !== 'adjust' && d.qty <= 0) {
      wx.showToast({ title: '数量要大于 0', icon: 'none' });
      return;
    }
    if (d.action === 'out' && d.qty > d.item.quantity) {
      wx.showToast({ title: `库存不足：当前只有 ${d.item.quantity}`, icon: 'none' });
      return;
    }
    let priceCents: number | null = null;
    if (d.action === 'in' && d.priceText.trim()) {
      const price = parseFloat(d.priceText);
      if (!Number.isFinite(price) || price < 0) {
        wx.showToast({ title: '金额格式不对', icon: 'none' });
        return;
      }
      priceCents = Math.round(price * 100);
    }
    this.setData({ submitting: true });
    try {
      const res = await inventoryApi.addLog(d.id, {
        action: d.action,
        quantity: d.qty,
        priceCents,
        channel: d.action === 'in' ? d.channel.trim() || null : null,
        occurredAt: d.occurredDate && d.occurredDate !== d.today ? tsOf(d.occurredDate, 12, 0) : store.now(),
        note: d.note.trim() || null,
      });
      wx.vibrateShort({ type: 'light', fail: () => undefined });
      wx.showToast({ title: '已记录', icon: 'success' });
      this.setData({
        sheetShow: false,
        item: res.item,
        logs: [toLogVM(res.log, store.now())].concat(this.data.logs),
      });
      store.emit('inventory:changed');
      dirty.take();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode !== 401 && err.statusCode !== 403) {
        wx.showToast({ title: err.message, icon: 'none' });
        // 家人可能刚出过库：刷新当前数量
        if (err.code === 'INSUFFICIENT_STOCK') this.load();
      }
    } finally {
      this.setData({ submitting: false });
    }
  },
});
