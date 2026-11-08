// 统一请求封装：云托管用 wx.cloud.callContainer，本地开发用 wx.request（手动带 X-WX-OPENID）

import { API_PREFIX } from '../shared/api';
import type { ApiErrorBody, ErrorCode } from '../shared/api';
import { CLOUD_ENV, CLOUD_SERVICE, DEV_API_BASE, DEV_OPENID, useCloud } from '../config/env';
import { store } from '../store/index';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  path: string;
  /** GET 时作为查询参数，其余作为 JSON 请求体 */
  data?: Record<string, unknown>;
  /** 出错时不弹 toast（调用方自己处理） */
  silent?: boolean;
}

/** 接口返回的业务错误 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
  }
}

interface RawResponse {
  statusCode: number;
  data: unknown;
  header: Record<string, string>;
}

function buildQuery(data?: Record<string, unknown>): string {
  if (!data) return '';
  const parts = Object.keys(data)
    .filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== '')
    // 中文参数先编码，避免 callContainer 乱码
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(data[k]))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function send(method: Method, path: string, data?: Record<string, unknown>): Promise<RawResponse> {
  const url = API_PREFIX + path + (method === 'GET' ? buildQuery(data) : '');
  const body = method === 'GET' ? undefined : data;
  return new Promise((resolve, reject) => {
    if (useCloud()) {
      wx.cloud.callContainer({
        config: { env: CLOUD_ENV },
        path: url,
        method,
        data: body,
        header: { 'X-WX-SERVICE': CLOUD_SERVICE, 'content-type': 'application/json' },
        timeout: 15000,
        success: (res) => resolve({ statusCode: res.statusCode, data: res.data, header: res.header }),
        fail: (err) => {
          console.error('[callContainer] fail', path, err);
          reject(new ApiError(0, 'NETWORK_ERROR', '网络不稳定，请重试'));
        },
      });
    } else {
      wx.request({
        url: DEV_API_BASE + url,
        method,
        data: body,
        header: { 'X-WX-OPENID': DEV_OPENID, 'content-type': 'application/json' },
        timeout: 15000,
        success: (res) =>
          resolve({ statusCode: res.statusCode, data: res.data, header: res.header as Record<string, string> }),
        fail: (err) => {
          console.error('[request] fail', path, err);
          reject(new ApiError(0, 'NETWORK_ERROR', '网络不稳定，请重试'));
        },
      });
    }
  });
}

function headerOf(header: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(header || {}).find((k) => k.toLowerCase() === name);
  return key ? header[key] : undefined;
}

let redirectingToUnauthorized = false;

function goUnauthorized(openid?: string) {
  if (redirectingToUnauthorized) return;
  redirectingToUnauthorized = true;
  wx.reLaunch({
    url: `/pages/unauthorized/index${openid ? `?openid=${encodeURIComponent(openid)}` : ''}`,
    complete: () => (redirectingToUnauthorized = false),
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function request<T>(opts: RequestOptions): Promise<T> {
  const method = opts.method ?? 'GET';
  let res: RawResponse;
  try {
    res = await send(method, opts.path, opts.data);
    // 数据库正在从自动暂停中唤醒：提示后 2 秒自动重试 1 次（写操作带 clientId 或天然幂等，重试安全）
    if (res.statusCode === 503) {
      wx.showLoading({ title: '正在唤醒…', mask: true });
      try {
        await wait(2000);
        res = await send(method, opts.path, opts.data);
      } finally {
        wx.hideLoading();
      }
    }
  } catch (err) {
    if (!opts.silent) wx.showToast({ title: (err as Error).message, icon: 'none' });
    throw err;
  }

  const serverTime = Number(headerOf(res.header, 'x-server-time'));
  if (serverTime) store.syncServerTime(serverTime);

  if (res.statusCode >= 200 && res.statusCode < 300) return res.data as T;

  const body = (typeof res.data === 'object' && res.data ? res.data : {}) as ApiErrorBody;
  const code = body.error?.code ?? 'INTERNAL_ERROR';
  const message = body.error?.message ?? `请求失败（${res.statusCode}）`;
  if (res.statusCode === 401 || res.statusCode === 403) {
    goUnauthorized(body.openid);
  } else if (!opts.silent) {
    wx.showToast({ title: message, icon: 'none' });
  }
  throw new ApiError(res.statusCode, code, message, body);
}

export const api = {
  get: <T>(path: string, data?: Record<string, unknown>, silent?: boolean) => request<T>({ method: 'GET', path, data, silent }),
  post: <T>(path: string, data?: object, silent?: boolean) =>
    request<T>({ method: 'POST', path, data: data as Record<string, unknown>, silent }),
  put: <T>(path: string, data?: object, silent?: boolean) =>
    request<T>({ method: 'PUT', path, data: data as Record<string, unknown>, silent }),
  del: <T = void>(path: string, silent?: boolean) => request<T>({ method: 'DELETE', path, silent }),
};
