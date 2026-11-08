// 半屏底部弹层容器：顶部拖动条、左上「关闭」、居中标题。内容由 slot 提供。
// 自定义 TabBar 层级高于页面内容，弹层打开时先隐藏 TabBar（非 Tab 页调用会失败，忽略即可）

const noop = () => undefined;

Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
  },
  observers: {
    show(show: boolean) {
      if (show) wx.hideTabBar({ animation: false, fail: noop });
      else wx.showTabBar({ animation: false, fail: noop });
    },
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    noop() {},
  },
});
