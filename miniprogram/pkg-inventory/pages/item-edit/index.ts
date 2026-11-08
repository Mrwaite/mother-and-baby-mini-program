// 新增 / 编辑耗材：名称、分类、规格、单位、提醒阈值、初始库存（仅新增）、备注；编辑时可归档 / 取消归档

import { inventoryApi } from '../../../services/api';
import type { InventoryItemInput } from '../../../shared/api';
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS, INVENTORY_UNITS } from '../../../shared/inventory';
import type { InventoryCategory } from '../../../shared/inventory';
import { store } from '../../../store/index';

/** 各分类的默认单位 */
const DEFAULT_UNIT: Record<InventoryCategory, string> = {
  diaper: '片',
  formula: '罐',
  wipes: '包',
  toiletries: '瓶',
  other: '个',
};

Page({
  data: {
    id: 0,
    loading: false,
    saving: false,
    name: '',
    category: 'diaper' as InventoryCategory,
    categoryOptions: INVENTORY_CATEGORIES.map((c) => ({ value: c, label: INVENTORY_CATEGORY_LABELS[c] })),
    spec: '',
    unit: '片',
    unitOptions: INVENTORY_UNITS.map((u) => ({ value: u, label: u })),
    lowThreshold: 10,
    quantity: 0,
    note: '',
    archived: false,
  },

  async onLoad(query: Record<string, string | undefined>) {
    const id = Number(query.id) || 0;
    this.setData({ id });
    if (!id) return;
    this.setData({ loading: true });
    try {
      const item = await inventoryApi.get(id);
      this.setData({
        name: item.name,
        category: item.category,
        spec: item.spec ?? '',
        unit: item.unit,
        lowThreshold: item.lowThreshold,
        note: item.note ?? '',
        archived: item.archived,
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ [String(e.currentTarget.dataset.field)]: e.detail.value });
  },

  onField(e: WechatMiniprogram.CustomEvent<{ value: unknown }>) {
    this.setData({ [String(e.currentTarget.dataset.field)]: e.detail.value });
  },

  onCategory(e: WechatMiniprogram.CustomEvent<{ value: InventoryCategory }>) {
    const category = e.detail.value;
    // 新增时，单位还是上一个分类的默认值就跟着切换
    const followUnit = !this.data.id && this.data.unit === DEFAULT_UNIT[this.data.category];
    this.setData({ category, ...(followUnit && { unit: DEFAULT_UNIT[category] }) });
  },

  async onSave() {
    if (this.data.saving) return;
    const d = this.data;
    const name = d.name.trim();
    const unit = d.unit.trim();
    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }
    if (!unit) {
      wx.showToast({ title: '请填写单位', icon: 'none' });
      return;
    }
    const input: InventoryItemInput = {
      name,
      category: d.category,
      spec: d.spec.trim() || null,
      unit,
      lowThreshold: d.lowThreshold,
      note: d.note.trim() || null,
    };
    this.setData({ saving: true });
    try {
      if (d.id) await inventoryApi.update(d.id, input);
      else await inventoryApi.create({ ...input, quantity: d.quantity });
      store.emit('inventory:changed');
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch {
      this.setData({ saving: false });
    }
  },

  onToggleArchive() {
    const archived = !this.data.archived;
    wx.showModal({
      title: archived ? '归档这个耗材？' : '取消归档？',
      content: archived ? '归档后不再出现在库存列表和低库存提醒中，可在「已归档」里找回。' : '',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await inventoryApi.update(this.data.id, { archived });
          store.emit('inventory:changed');
          wx.navigateBack();
        } catch {
          // request 已提示
        }
      },
    });
  },
});
