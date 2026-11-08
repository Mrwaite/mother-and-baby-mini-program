// Tab 页公共逻辑：同步自定义 TabBar 的选中态和低库存角标

let lowStockCount = 0;
/** 按页面保存遮挡来源；多个弹层同时打开时，全部关闭后才恢复。 */
const blockers = new WeakMap<object, Set<object>>();

export function setTabBarBlocked(page: object, source: object, blocked: boolean) {
  let sources = blockers.get(page);
  if (!sources) {
    if (!blocked) return;
    sources = new Set<object>();
    blockers.set(page, sources);
  }
  if (blocked) sources.add(source);
  else sources.delete(source);
  const p = page as WechatMiniprogram.Page.TrivialInstance;
  const bar = typeof p.getTabBar === 'function' ? p.getTabBar() : null;
  if (bar) bar.setData({ visible: sources.size === 0 });
}

export function setLowStockCount(n: number) {
  lowStockCount = n;
}

export function syncTabBar(page: object, selected: number) {
  const p = page as WechatMiniprogram.Page.TrivialInstance;
  const bar = typeof p.getTabBar === 'function' ? p.getTabBar() : null;
  if (bar) bar.setData({ selected, lowStock: lowStockCount, visible: !blockers.get(page)?.size });
}
