// Tab 页公共逻辑：同步自定义 TabBar 的选中态和低库存角标

let lowStockCount = 0;

export function setLowStockCount(n: number) {
  lowStockCount = n;
}

export function syncTabBar(page: object, selected: number) {
  const p = page as WechatMiniprogram.Page.TrivialInstance;
  const bar = typeof p.getTabBar === 'function' ? p.getTabBar() : null;
  if (bar) bar.setData({ selected, lowStock: lowStockCount });
}
