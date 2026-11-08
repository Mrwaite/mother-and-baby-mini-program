// 新增 / 编辑里程碑：日期、标题、描述、最多 9 张照片。
// 照片选中后立即上传到对象存储（最多 3 张并发），再向服务端登记拿到照片 id；全部完成后才能保存

import { milestoneApi } from '../../../services/api';
import { runLimited, uploadImage } from '../../../services/cloud';
import { MAX_MILESTONE_PHOTOS } from '../../../shared/api';
import type { MilestoneInput } from '../../../shared/api';
import { dateKeyOf } from '../../../shared/time';
import { store } from '../../../store/index';

type PhotoStatus = 'uploading' | 'done' | 'failed';

interface PhotoVM {
  key: string;
  /** 服务端照片 id（登记后才有） */
  id: string;
  /** 展示用地址：已上传为 cloud:// 文件 ID，上传中为本地临时路径 */
  src: string;
  localPath: string;
  size: number;
  status: PhotoStatus;
  progress: number;
}

const aborts = new Map<string, () => void>();
let keySeq = 0;

/** 常见里程碑，点击填入标题 */
const PRESETS = ['抬头', '翻身', '独坐', '爬', '站', '走', '长第一颗牙', '第一次叫妈妈', '第一次叫爸爸', '第一次笑出声'];

Page({
  data: {
    id: 0,
    date: '',
    today: '',
    birthDate: '',
    title: '',
    description: '',
    photos: [] as PhotoVM[],
    max: MAX_MILESTONE_PHOTOS,
    presets: PRESETS.map((p) => ({ value: p, label: p })),
    saving: false,
    loading: false,
  },

  async onLoad(query: Record<string, string | undefined>) {
    const today = dateKeyOf(store.now());
    const id = Number(query.id) || 0;
    this.setData({ id, date: today, today, birthDate: store.baby?.birthDate ?? '' });
    if (!id) return;
    this.setData({ loading: true });
    try {
      const m = await milestoneApi.get(id);
      this.setData({
        date: m.date,
        title: m.title,
        description: m.description ?? '',
        photos: m.photos.map((p) => ({
          key: `p${++keySeq}`,
          id: p.id,
          src: p.fileId,
          localPath: '',
          size: 0,
          status: 'done' as PhotoStatus,
          progress: 100,
        })),
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onUnload() {
    aborts.forEach((abort) => abort());
    aborts.clear();
  },

  onDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ date: String(e.detail.value) });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ [String(e.currentTarget.dataset.field)]: e.detail.value });
  },

  onPreset(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (e.detail.value) this.setData({ title: e.detail.value });
  },

  onChoose() {
    const remain = MAX_MILESTONE_PHOTOS - this.data.photos.length;
    if (remain <= 0) return;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const added: PhotoVM[] = res.tempFiles.slice(0, remain).map((f) => ({
          key: `p${++keySeq}`,
          id: '',
          src: f.tempFilePath,
          localPath: f.tempFilePath,
          size: f.size,
          status: 'uploading' as PhotoStatus,
          progress: 0,
        }));
        this.setData({ photos: this.data.photos.concat(added) });
        runLimited(
          added.map((p) => () => this.upload(p.key)),
          3,
        );
      },
    });
  },

  /** 上传并登记一张照片；失败时标记为 failed，点击可重试 */
  async upload(key: string): Promise<void> {
    const photo = this.data.photos.find((p) => p.key === key);
    if (!photo) return;
    this.patchPhoto(key, { status: 'uploading', progress: 0 });
    const task = uploadImage(photo.localPath, photo.size, (progress) => this.patchPhoto(key, { progress }));
    aborts.set(key, task.abort);
    try {
      const fileId = await task.promise;
      const registered = await milestoneApi.registerFile(fileId);
      this.patchPhoto(key, { id: registered.id, status: 'done', progress: 100 });
    } catch (err) {
      if (this.data.photos.some((p) => p.key === key)) {
        this.patchPhoto(key, { status: 'failed' });
        console.error('[milestone] upload failed', err);
      }
    } finally {
      aborts.delete(key);
    }
  },

  patchPhoto(key: string, patch: Partial<PhotoVM>) {
    const index = this.data.photos.findIndex((p) => p.key === key);
    if (index < 0) return;
    const updates: Record<string, unknown> = {};
    Object.keys(patch).forEach((k) => (updates[`photos[${index}].${k}`] = patch[k as keyof PhotoVM]));
    this.setData(updates);
  },

  onTapPhoto(e: WechatMiniprogram.TouchEvent) {
    const key = String(e.currentTarget.dataset.key);
    const photo = this.data.photos.find((p) => p.key === key);
    if (!photo) return;
    if (photo.status === 'failed') {
      this.upload(key);
      return;
    }
    const urls = this.data.photos.map((p) => p.src);
    wx.previewImage({ urls, current: photo.src });
  },

  onRemovePhoto(e: WechatMiniprogram.TouchEvent) {
    const key = String(e.currentTarget.dataset.key);
    aborts.get(key)?.();
    aborts.delete(key);
    this.setData({ photos: this.data.photos.filter((p) => p.key !== key) });
  },

  async onSave() {
    if (this.data.saving) return;
    const d = this.data;
    const title = d.title.trim();
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' });
      return;
    }
    if (d.photos.some((p) => p.status === 'uploading')) {
      wx.showToast({ title: '照片还在上传，请稍候', icon: 'none' });
      return;
    }
    if (d.photos.some((p) => p.status === 'failed')) {
      wx.showToast({ title: '有照片上传失败，点击重试或删除', icon: 'none' });
      return;
    }
    const input: MilestoneInput = {
      date: d.date,
      title,
      description: d.description.trim() || null,
      photoIds: d.photos.map((p) => p.id),
    };
    this.setData({ saving: true });
    try {
      if (d.id) await milestoneApi.update(d.id, input);
      else await milestoneApi.create(input);
      store.emit('milestone:changed');
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch {
      this.setData({ saving: false });
    }
  },

  onDelete() {
    wx.showModal({
      title: '删除这个里程碑？',
      confirmText: '删除',
      confirmColor: '#E5484D',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await milestoneApi.remove(this.data.id);
          store.emit('milestone:changed');
          wx.navigateBack();
        } catch {
          // request 已提示
        }
      },
    });
  },
});
