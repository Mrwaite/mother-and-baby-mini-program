// 时间格式化（按北京时间显示，与服务端「天」的口径一致）

import { DAY_MS, HOUR_MS, MINUTE_MS, TZ_OFFSET_MS, ageOf, dateKeyOf, dayStartFromKey } from '../shared/time';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** 北京时间的年月日时分 */
export function partsOf(ts: number) {
  const d = new Date(ts + TZ_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** HH:mm */
export function hm(ts: number): string {
  const p = partsOf(ts);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** M月D日 周X */
export function dateText(key: string): string {
  const p = partsOf(dayStartFromKey(key));
  return `${p.month}月${p.day}日 周${WEEKDAYS[p.weekday]}`;
}

/** 今天 / 昨天 / M月D日 周X */
export function dayLabel(key: string, now: number): string {
  const today = dateKeyOf(now);
  if (key === today) return '今天';
  if (key === dateKeyOf(now - DAY_MS)) return '昨天';
  return dateText(key);
}

/** 时间点的简短描述：今天只显示时分，其他日子带日期 */
export function whenText(ts: number, now: number): string {
  const key = dateKeyOf(ts);
  if (key === dateKeyOf(now)) return hm(ts);
  const p = partsOf(ts);
  if (key === dateKeyOf(now - DAY_MS)) return `昨天 ${hm(ts)}`;
  return `${p.month}月${p.day}日 ${hm(ts)}`;
}

/** 时长：45分 / 1小时5分 */
export function durationText(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE_MS));
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

/** 计时显示：12:34 / 1:02:03 */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** 距现在：刚刚 / 25分钟前 / 2小时15分前 / 3天前 */
export function agoText(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < MINUTE_MS) return '刚刚';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}分钟前`;
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS);
    const m = Math.floor((diff % HOUR_MS) / MINUTE_MS);
    return m ? `${h}小时${m}分前` : `${h}小时前`;
  }
  return `${Math.floor(diff / DAY_MS)}天前`;
}

export function greeting(now: number): string {
  const h = partsOf(now).hour;
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/** 月龄：12天 / 3个月12天 / 1岁2个月 */
export function ageText(birthDate: string, onDate: string): string {
  const a = ageOf(birthDate, onDate);
  if (a.totalDays < 0) return '未出生';
  if (a.months === 0) return `${a.days}天`;
  if (a.months < 12) return a.days ? `${a.months}个月${a.days}天` : `${a.months}个月`;
  const y = Math.floor(a.months / 12);
  const m = a.months % 12;
  return m ? `${y}岁${m}个月` : `${y}岁`;
}

/** 北京时间某天某时某分的时间戳 */
export function tsOf(key: string, hour: number, minute: number): number {
  return dayStartFromKey(key) + hour * HOUR_MS + minute * MINUTE_MS;
}
