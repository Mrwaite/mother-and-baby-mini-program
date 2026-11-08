// 宝宝档案：昵称、性别、生日、出生身长/体重/头围。onboarding=1 时为首次使用的引导

import { meApi } from '../../../services/api';
import type { BabyInput, Gender } from '../../../shared/api';
import { dateKeyOf } from '../../../shared/time';
import { store } from '../../../store/index';

const toText = (v: number | null) => (v === null ? '' : String(v));

function parseMeasure(text: string, min: number, max: number, label: string): { value: number | null; error?: string } {
  const t = text.trim();
  if (!t) return { value: null };
  const v = parseFloat(t);
  if (!Number.isFinite(v) || v < min || v > max) return { value: null, error: `${label}应在 ${min}–${max} 之间` };
  return { value: v };
}

Page({
  data: {
    onboarding: false,
    nickname: '',
    gender: 'female' as Gender,
    genderOptions: [
      { value: 'female', label: '女孩' },
      { value: 'male', label: '男孩' },
    ],
    birthDate: '',
    today: '',
    height: '',
    weight: '',
    head: '',
    saving: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const today = dateKeyOf(store.now());
    const baby = store.baby;
    this.setData({
      onboarding: query.onboarding === '1' && !baby,
      today,
      nickname: baby?.nickname ?? '',
      gender: baby?.gender ?? 'female',
      birthDate: baby?.birthDate ?? today,
      height: toText(baby?.birthHeightCm ?? null),
      weight: toText(baby?.birthWeightKg ?? null),
      head: toText(baby?.birthHeadCm ?? null),
    });
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ [String(e.currentTarget.dataset.field)]: e.detail.value });
  },

  onGender(e: WechatMiniprogram.CustomEvent<{ value: Gender }>) {
    this.setData({ gender: e.detail.value });
  },

  onDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ birthDate: String(e.detail.value) });
  },

  async onSave() {
    if (this.data.saving) return;
    const d = this.data;
    const nickname = d.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请填写宝宝昵称', icon: 'none' });
      return;
    }
    const h = parseMeasure(d.height, 30, 70, '出生身长');
    const w = parseMeasure(d.weight, 0.5, 7, '出生体重');
    const c = parseMeasure(d.head, 20, 45, '出生头围');
    const error = h.error || w.error || c.error;
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    const input: BabyInput = {
      nickname,
      gender: d.gender,
      birthDate: d.birthDate,
      birthHeightCm: h.value,
      birthWeightKg: w.value,
      birthHeadCm: c.value,
    };
    this.setData({ saving: true });
    try {
      const baby = await meApi.saveBaby(input);
      store.setBaby(baby);
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        if (getCurrentPages().length > 1) wx.navigateBack();
        else wx.switchTab({ url: '/pages/home/index' });
      }, 500);
    } catch {
      this.setData({ saving: false });
    }
  },
});
