// 记录类型元数据：名称、颜色、图标、是否计时、常用值。各页面统一从这里读取

import type { CareType } from '../shared/care';

export interface RecordTypeMeta {
  type: CareType;
  label: string;
  /** 主题色 */
  color: string;
  /** 浅底色 */
  bg: string;
  icon: string;
  timer: boolean;
}

export const RECORD_TYPES: RecordTypeMeta[] = [
  { type: 'breastfeed', label: '亲喂', color: '#E0533F', bg: '#FBE3DF', icon: '/assets/icons/breastfeed.svg', timer: true },
  { type: 'bottle', label: '瓶喂', color: '#F08A2E', bg: '#FDEBD9', icon: '/assets/icons/bottle.svg', timer: false },
  { type: 'diaper', label: '换尿布', color: '#2CB5A0', bg: '#DDF4EF', icon: '/assets/icons/diaper.svg', timer: false },
  { type: 'sleep', label: '睡眠', color: '#6B5BE0', bg: '#ECE9FB', icon: '/assets/icons/sleep.svg', timer: true },
  { type: 'pump', label: '吸奶', color: '#EF4A5A', bg: '#FDE1E3', icon: '/assets/icons/pump.svg', timer: false },
  { type: 'temperature', label: '体温', color: '#E5A21A', bg: '#FCF1D6', icon: '/assets/icons/temperature.svg', timer: false },
  { type: 'medicine', label: '用药', color: '#E8414F', bg: '#FCE1E3', icon: '/assets/icons/medicine.svg', timer: false },
  { type: 'bath', label: '洗澡', color: '#3A8EE6', bg: '#DFEDFB', icon: '/assets/icons/bath.svg', timer: false },
];

export const RECORD_TYPE_MAP = RECORD_TYPES.reduce(
  (m, t) => {
    m[t.type] = t;
    return m;
  },
  {} as Record<CareType, RecordTypeMeta>,
);

/** 各类型的默认值和常用值（第一次记录、没有「上次的值」时使用） */
export const DEFAULTS = {
  bottleMl: 90,
  bottleChips: [60, 90, 120, 150],
  pumpMl: 100,
  pumpChips: [60, 90, 120, 150],
  celsius: 36.8,
  medicineDose: 1,
  /** 记录时间快捷选项（分钟前） */
  timeAgoChips: [5, 15, 30],
};
