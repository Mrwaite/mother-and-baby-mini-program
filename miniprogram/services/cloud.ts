// wx.cloud 初始化和图片上传（云托管对象存储）

import { CLOUD_ENV } from '../config/env';
import { MAX_PHOTO_BYTES, MILESTONE_PHOTO_DIR } from '../shared/api';
import { dateKeyOf } from '../shared/time';
import { uuid } from '../utils/uuid';

let inited = false;

/** app.onLaunch 时调用一次；callContainer、uploadFile、cloud:// 图片都依赖它 */
export function initCloud() {
  if (inited || !wx.cloud) return;
  wx.cloud.init({ env: CLOUD_ENV, traceUser: false });
  inited = true;
}

export interface UploadTask {
  promise: Promise<string>;
  abort(): void;
}

/** 上传一张图片，返回 cloud:// 文件 ID。路径 milestones/<yyyy-mm>/<uuid>.<ext> */
export function uploadImage(filePath: string, size: number, onProgress?: (percent: number) => void): UploadTask {
  let task: { abort(): void } | null = null;
  const promise = new Promise<string>((resolve, reject) => {
    if (size > MAX_PHOTO_BYTES) {
      reject(new Error('图片不能超过 10MB'));
      return;
    }
    const ext = (/\.(\w+)$/.exec(filePath)?.[1] ?? 'jpg').toLowerCase();
    const cloudPath = `${MILESTONE_PHOTO_DIR}${dateKeyOf(Date.now()).slice(0, 7)}/${uuid()}.${ext}`;
    const t = wx.cloud.uploadFile({
      cloudPath,
      filePath,
      config: { env: CLOUD_ENV },
      success: (res) => resolve(res.fileID),
      fail: (err) => reject(new Error(err.errMsg || '上传失败')),
    }) as unknown as WechatMiniprogram.UploadTask | undefined;
    if (t) {
      task = t;
      if (onProgress) t.onProgressUpdate((p) => onProgress(p.progress));
    }
  });
  return { promise, abort: () => task?.abort() };
}

/** 并发执行，最多 limit 个同时进行 */
export async function runLimited<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}
