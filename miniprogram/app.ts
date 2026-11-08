import { initCloud } from './services/cloud';
import { bootstrap } from './services/session';

App({
  onLaunch() {
    initCloud();
    // 直接请求 /me：openid 由云托管网关注入，不需要 wx.login；失败时各页面会在 onShow 里重试
    bootstrap().catch(() => undefined);
  },
});
