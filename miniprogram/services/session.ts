// 启动与身份校验：请求 /me，成功后写入 store；401/403 由 request 统一跳到无权限页

import { store } from '../store/index';
import { meApi } from './api';
import { ApiError } from './request';

let pending: Promise<void> | null = null;

const BABY_EDIT_ROUTE = 'pkg-profile/pages/baby-edit/index';

export function bootstrap(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const me = await meApi.me();
      store.syncServerTime(me.serverTime);
      store.setSession(me.user, me.baby);
    } catch (err) {
      // 401/403 已经跳转；其他错误（网络、数据库唤醒失败）允许页面下拉重试
      if (!(err instanceof ApiError) || (err.statusCode !== 401 && err.statusCode !== 403)) {
        console.error('[bootstrap] failed', err);
      }
      throw err;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/**
 * Tab 页统一入口：等待 /me 完成；还没有宝宝档案时引导填写。
 * 返回 false 表示当前不能继续加载数据。
 */
export async function ensureSession(): Promise<boolean> {
  if (!store.user) {
    try {
      await bootstrap();
    } catch {
      return false;
    }
  }
  if (!store.baby) {
    const pages = getCurrentPages();
    const top = pages[pages.length - 1];
    if (!top || top.route !== BABY_EDIT_ROUTE) wx.navigateTo({ url: `/${BABY_EDIT_ROUTE}?onboarding=1` });
    return false;
  }
  return true;
}
