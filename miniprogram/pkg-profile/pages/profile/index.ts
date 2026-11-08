// 我的：宝宝档案、当前用户、openid（可复制）、版本号

import { APP_VERSION, envVersion, useCloud } from '../../../config/env';
import { store, watchDirty } from '../../../store/index';
import { dateKeyOf } from '../../../shared/time';
import { ageText, dateText } from '../../../utils/time';

const ENV_LABEL = { develop: '开发版', trial: '体验版', release: '正式版' };

let dirty = watchDirty(['baby:changed']);

Page({
  data: {
    hasBaby: false,
    avatar: '👶',
    nickname: '',
    genderText: '',
    birthText: '',
    ageText: '',
    birthInfo: '',
    displayName: '',
    openid: '',
    version: APP_VERSION,
    envText: '',
  },

  onLoad() {
    dirty.dispose();
    dirty = watchDirty(['baby:changed']);
    this.setData({ envText: `${ENV_LABEL[envVersion()]}${useCloud() ? '' : ' · 本地服务'}` });
  },

  onShow() {
    if (dirty.take()) this.render();
  },

  onUnload() {
    dirty.dispose();
  },

  render() {
    const baby = store.baby;
    const user = store.user;
    const birthInfo = baby
      ? [
          baby.birthHeightCm !== null && `身长 ${baby.birthHeightCm}cm`,
          baby.birthWeightKg !== null && `体重 ${baby.birthWeightKg}kg`,
          baby.birthHeadCm !== null && `头围 ${baby.birthHeadCm}cm`,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
    this.setData({
      hasBaby: !!baby,
      avatar: baby?.gender === 'female' ? '👧' : baby ? '👦' : '👶',
      nickname: baby?.nickname ?? '',
      genderText: baby ? (baby.gender === 'female' ? '女孩' : '男孩') : '',
      birthText: baby ? dateText(baby.birthDate) : '',
      ageText: baby ? ageText(baby.birthDate, dateKeyOf(store.now())) : '',
      birthInfo,
      displayName: user?.displayName ?? '',
      openid: user?.openid ?? '',
    });
  },

  onEditBaby() {
    wx.navigateTo({ url: '/pkg-profile/pages/baby-edit/index' });
  },

  onCopyOpenid() {
    if (this.data.openid) wx.setClipboardData({ data: this.data.openid });
  },
});
