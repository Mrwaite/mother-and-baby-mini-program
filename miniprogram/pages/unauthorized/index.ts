// 无权限页：不在白名单（403）或拿不到微信身份（401）。展示自己的 openid，方便发给管理员加白名单

import { bootstrap } from '../../services/session';
import { store } from '../../store/index';

Page({
  data: {
    openid: '',
    retrying: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ openid: query.openid ? decodeURIComponent(query.openid) : '' });
  },

  onCopy() {
    if (!this.data.openid) return;
    wx.setClipboardData({ data: this.data.openid });
  },

  /** 管理员加好白名单后重试；仍无权限时 request 会再次跳回本页 */
  async onRetry() {
    if (this.data.retrying) return;
    this.setData({ retrying: true });
    store.resetReady();
    try {
      await bootstrap();
      wx.reLaunch({ url: '/pages/home/index' });
    } catch {
      // 401/403 已重新跳转本页；其他错误由 request 提示
    } finally {
      this.setData({ retrying: false });
    }
  },
});
