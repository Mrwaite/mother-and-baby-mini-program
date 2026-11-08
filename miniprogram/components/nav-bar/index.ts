// 自定义导航栏：避让状态栏和右上角胶囊按钮。
// 有 back 时显示返回按钮和居中标题；否则只占位，内容由页面在下方自己排（大标题头部）

import { navMetrics } from '../../utils/layout';

Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    /** 背景色，默认和页面背景一致（内容滚动到下面时不会透出来） */
    background: { type: String, value: 'var(--color-bg)' },
  },
  data: {
    statusBarHeight: 20,
    navHeight: 44,
    capsuleRight: 96,
  },
  lifetimes: {
    attached() {
      const m = navMetrics();
      this.setData({ statusBarHeight: m.statusBarHeight, navHeight: m.navHeight, capsuleRight: m.capsuleRight });
    },
  },
  methods: {
    onBack() {
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/home/index' });
    },
  },
});
