// 自定义 TabBar：悬浮圆角胶囊，选中项带浅色底。每个 Tab 页 onShow 时调用 syncTabBar 同步选中态和角标

const TABS = [
  { pagePath: '/pages/home/index', text: '首页', icon: 'home' },
  { pagePath: '/pages/timeline/index', text: '时间线', icon: 'timeline' },
  { pagePath: '/pages/growth/index', text: '成长', icon: 'growth' },
  { pagePath: '/pages/inventory/index', text: '库存', icon: 'inventory' },
];

Component({
  options: { styleIsolation: 'apply-shared' },
  data: {
    selected: 0,
    /** 库存 Tab 的低库存角标 */
    lowStock: 0,
    tabs: TABS,
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index);
      if (index === this.data.selected) return;
      wx.switchTab({ url: TABS[index].pagePath });
    },
  },
});
