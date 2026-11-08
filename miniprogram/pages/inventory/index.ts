// 库存：低库存区 + 按分类分组的耗材卡片（数量、相对阈值的进度条）；可切换查看已归档

import { inventoryApi } from '../../services/api';
import { ensureSession } from '../../services/session';
import type { InventoryItem } from '../../shared/api';
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS } from '../../shared/inventory';
import { watchDirty } from '../../store/index';
import { setLowStockCount, syncTabBar } from '../../utils/tab-bar';

interface ItemVM {
  id: number;
  name: string;
  spec: string;
  quantity: number;
  unit: string;
  threshold: number;
  low: boolean;
  percent: number;
}

interface GroupVM {
  category: string;
  label: string;
  items: ItemVM[];
}

const dirty = watchDirty(['inventory:changed']);

function toVM(i: InventoryItem): ItemVM {
  // 进度条满格 = 阈值的 3 倍；阈值为 0 时有货就满格
  const full = i.lowThreshold > 0 ? i.lowThreshold * 3 : Math.max(i.quantity, 1);
  return {
    id: i.id,
    name: i.name,
    spec: i.spec ?? '',
    quantity: i.quantity,
    unit: i.unit,
    threshold: i.lowThreshold,
    low: i.low,
    percent: Math.min(100, Math.round((i.quantity / full) * 100)),
  };
}

Page({
  data: {
    loaded: false,
    archived: false,
    lowItems: [] as ItemVM[],
    groups: [] as GroupVM[],
    archivedItems: [] as ItemVM[],
  },

  async onShow() {
    syncTabBar(this, 3);
    if (!(await ensureSession())) return;
    if (dirty.take()) this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      if (this.data.archived) {
        const list = await inventoryApi.list(true);
        this.setData({ loaded: true, archivedItems: list.map(toVM) });
        return;
      }
      const list = await inventoryApi.list(false);
      const vms = list.map(toVM);
      const groups = INVENTORY_CATEGORIES.map((c) => ({
        category: c,
        label: INVENTORY_CATEGORY_LABELS[c],
        items: list.filter((i) => i.category === c).map(toVM),
      })).filter((g) => g.items.length > 0);
      const lowItems = vms.filter((v) => v.low);
      setLowStockCount(lowItems.length);
      syncTabBar(this, 3);
      this.setData({ loaded: true, lowItems, groups });
    } catch {
      dirty.mark();
    }
  },

  onToggleArchived(e: WechatMiniprogram.SwitchChange) {
    this.setData({ archived: e.detail.value, loaded: false });
    this.load();
  },

  onOpen(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: `/pkg-inventory/pages/item-detail/index?id=${e.currentTarget.dataset.id}` });
  },

  onAdd() {
    wx.navigateTo({ url: '/pkg-inventory/pages/item-edit/index' });
  },
});
