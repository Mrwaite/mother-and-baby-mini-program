// 新增 / 编辑生长测量：日期 + 身高 / 体重 / 头围（至少填一项）+ 备注

import { growthApi } from '../../../services/api';
import type { GrowthRecord, GrowthRecordInput } from '../../../shared/api';
import { dateKeyOf } from '../../../shared/time';
import { store } from '../../../store/index';

const toText = (v: number | null) => (v === null ? '' : String(v));

function parseMeasure(text: string, min: number, max: number, label: string): { value: number | null; error?: string } {
  const t = text.trim();
  if (!t) return { value: null };
  const v = parseFloat(t);
  if (!Number.isFinite(v) || v < min || v > max) return { value: null, error: `${label}应在 ${min}–${max} 之间` };
  return { value: v };
}

Page({
  data: {
    id: 0,
    measureDate: '',
    today: '',
    birthDate: '',
    height: '',
    weight: '',
    head: '',
    note: '',
    saving: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const today = dateKeyOf(store.now());
    this.setData({ id: Number(query.id) || 0, measureDate: today, today, birthDate: store.baby?.birthDate ?? '' });
    if (this.data.id) {
      // 列表页通过 eventChannel 传入要编辑的记录（接口没有单条查询）
      const channel = this.getOpenerEventChannel() as WechatMiniprogram.EventChannel;
      channel.on('record', (r: GrowthRecord) => {
        this.setData({
          measureDate: r.measureDate,
          height: toText(r.heightCm),
          weight: toText(r.weightKg),
          head: toText(r.headCm),
          note: r.note ?? '',
        });
      });
    }
  },

  onDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ measureDate: String(e.detail.value) });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ [String(e.currentTarget.dataset.field)]: e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    const d = this.data;
    const h = parseMeasure(d.height, 30, 130, '身高');
    const w = parseMeasure(d.weight, 0.5, 40, '体重');
    const c = parseMeasure(d.head, 20, 60, '头围');
    const error = h.error || w.error || c.error;
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    if (h.value === null && w.value === null && c.value === null) {
      wx.showToast({ title: '身高、体重、头围至少填一项', icon: 'none' });
      return;
    }
    const input: GrowthRecordInput = {
      measureDate: d.measureDate,
      heightCm: h.value,
      weightKg: w.value,
      headCm: c.value,
      note: d.note.trim() || null,
    };
    this.setData({ saving: true });
    try {
      if (d.id) await growthApi.update(d.id, input);
      else await growthApi.create(input);
      store.emit('growth:changed');
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch {
      this.setData({ saving: false });
    }
  },

  onDelete() {
    wx.showModal({
      title: '删除这条测量记录？',
      confirmText: '删除',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await growthApi.remove(this.data.id);
          store.emit('growth:changed');
          wx.navigateBack();
        } catch {
          // request 已提示
        }
      },
    });
  },
});
