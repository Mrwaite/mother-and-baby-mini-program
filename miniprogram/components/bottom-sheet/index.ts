// 半屏底部弹层容器：顶部拖动条、左上「关闭」、居中标题。内容由 slot 提供。
// 自定义 TabBar 层级高于页面内容；通过所属页面的可见状态隐藏，不使用原生 hideTabBar。

import { setTabBarBlocked } from '../../utils/tab-bar';

// 绑定弹层所属页面，关闭或卸载时不能误操作新页面的 TabBar。
const owners = new WeakMap<object, { page: WechatMiniprogram.Page.TrivialInstance; active: boolean }>();

function bindOwner(sheet: object) {
  if (owners.has(sheet)) return;
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  if (page) owners.set(sheet, { page, active: true });
}

function syncVisibility(sheet: object, show: boolean) {
  const owner = owners.get(sheet);
  if (owner) setTabBarBlocked(owner.page, sheet, show && owner.active);
}

Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
  },
  observers: {
    show(show: boolean) {
      syncVisibility(this, show);
    },
  },
  lifetimes: {
    attached() {
      bindOwner(this);
      syncVisibility(this, this.data.show);
    },
    ready() {
      bindOwner(this);
      syncVisibility(this, this.data.show);
    },
    detached() {
      syncVisibility(this, false);
      owners.delete(this);
    },
  },
  pageLifetimes: {
    show() {
      bindOwner(this);
      const owner = owners.get(this);
      if (owner) owner.active = true;
      syncVisibility(this, this.data.show);
    },
    hide() {
      const owner = owners.get(this);
      if (owner) owner.active = false;
      syncVisibility(this, false);
    },
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    noop() {},
  },
});
