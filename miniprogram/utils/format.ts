// 把接口数据转换成页面直接渲染的视图模型（WXML 里不能调用函数）

import { RECORD_TYPE_MAP } from '../config/record-types';
import type { CareRecord, DaySummary } from '../shared/api';
import { LABELS, breastSideDurations, isFever } from '../shared/care';
import { durationText, hm } from './time';

export interface RecordCardVM {
  id: number;
  type: CareRecord['type'];
  label: string;
  color: string;
  bg: string;
  icon: string;
  /** 关键数值标签，如 120 mL */
  value: string;
  /** 副标题 */
  sub: string;
  time: string;
  recorder: string;
  running: boolean;
  /** 需要高亮（发烧） */
  alert: boolean;
  startAt: number;
  endAt: number | null;
}

const join = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' · ');

export function describeRecord(r: CareRecord, now: number): { value: string; sub: string; alert: boolean } {
  const elapsed = (r.endAt ?? now) - r.startAt;
  switch (r.type) {
    case 'breastfeed': {
      const d = breastSideDurations(r.payload.segments, now);
      return {
        value: r.endAt === null ? '进行中' : durationText(elapsed),
        sub: join([d.left > 0 && `左 ${durationText(d.left)}`, d.right > 0 && `右 ${durationText(d.right)}`]),
        alert: false,
      };
    }
    case 'bottle':
      return { value: `${r.payload.amountMl} mL`, sub: LABELS.milkType[r.payload.milkType], alert: false };
    case 'diaper':
      return {
        value: LABELS.diaperKind[r.payload.kind],
        sub: join([r.payload.pooColor && LABELS.pooColor[r.payload.pooColor], r.payload.pooTexture && LABELS.pooTexture[r.payload.pooTexture]]),
        alert: r.payload.pooColor === 'red' || r.payload.pooColor === 'white' || r.payload.pooColor === 'black',
      };
    case 'sleep':
      return {
        value: r.endAt === null ? '进行中' : durationText(elapsed),
        sub: r.endAt === null ? `${hm(r.startAt)} 开始` : `${hm(r.startAt)}–${hm(r.endAt)}`,
        alert: false,
      };
    case 'pump':
      return {
        value: `${r.payload.totalMl} mL`,
        sub: join([
          r.payload.leftMl !== undefined && `左 ${r.payload.leftMl}`,
          r.payload.rightMl !== undefined && `右 ${r.payload.rightMl}`,
          r.payload.durationMin !== undefined && `${r.payload.durationMin}分钟`,
        ]),
        alert: false,
      };
    case 'temperature':
      return {
        value: `${r.payload.celsius.toFixed(1)}℃`,
        sub: r.payload.site ? LABELS.tempSite[r.payload.site] : '',
        alert: isFever(r.payload.celsius, r.payload.site),
      };
    case 'medicine':
      return { value: `${r.payload.dose} ${LABELS.medicineUnit[r.payload.unit]}`, sub: r.payload.name, alert: false };
    case 'bath':
      return { value: '', sub: '', alert: false };
  }
}

export function toCardVM(r: CareRecord, now: number): RecordCardVM {
  const meta = RECORD_TYPE_MAP[r.type];
  const d = describeRecord(r, now);
  return {
    id: r.id,
    type: r.type,
    label: meta.label,
    color: meta.color,
    bg: meta.bg,
    icon: meta.icon,
    value: d.value,
    sub: join([d.sub, r.note]),
    time: hm(r.startAt),
    recorder: r.createdByName,
    running: r.endAt === null && meta.timer,
    alert: d.alert,
    startAt: r.startAt,
    endAt: r.endAt,
  };
}

/** 一天汇总的简短文字，用于时间线分组标题 */
export function summaryText(s: DaySummary): string {
  return join([
    s.bottle.count > 0 && `瓶喂 ${s.bottle.totalMl}mL`,
    s.breastfeed.count > 0 && `亲喂 ${s.breastfeed.count}次`,
    s.diaper.count > 0 && `尿布 ${s.diaper.count}次`,
    s.sleep.totalMs > 0 && `睡眠 ${durationText(s.sleep.totalMs)}`,
    s.pump.count > 0 && `吸奶 ${s.pump.totalMl}mL`,
  ]);
}

/** 金额：分 → 元 */
export function yuan(cents: number | null): string {
  if (cents === null) return '';
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
