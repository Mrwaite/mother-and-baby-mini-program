// 日期时间选择器（内嵌 picker-view）：三列 日期 / 时 / 分，按北京时间。
// 日期列为最近 days 天，今天在最后；选择结果晚于现在时按现在处理

import { store } from '../../store/index';
import { DAY_MS, addDays, dateKeyOf } from '../../shared/time';
import { dateText, partsOf, tsOf } from '../../utils/time';

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const HOURS = Array.from({ length: 24 }, (_, i) => `${pad2(i)}时`);
const MINUTES = Array.from({ length: 60 }, (_, i) => `${pad2(i)}分`);

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    value: { type: Number, value: 0 },
    days: { type: Number, value: 30 },
  },
  data: {
    dateKeys: [] as string[],
    dateLabels: [] as string[],
    hours: HOURS,
    minutes: MINUTES,
    indexes: [0, 0, 0],
  },
  observers: {
    'value, days'() {
      this.build();
    },
  },
  methods: {
    build() {
      const now = store.now();
      const today = dateKeyOf(now);
      const value = this.data.value || now;
      const valueKey = dateKeyOf(value);
      const keys: string[] = [];
      // 选中值超出范围时，把范围往前扩到那一天
      const span = Math.max(this.data.days, Math.ceil((now - value) / DAY_MS) + 1);
      for (let i = span - 1; i >= 0; i--) keys.push(addDays(today, -i));
      const labels = keys.map((k, i) => (i === keys.length - 1 ? '今天' : i === keys.length - 2 ? '昨天' : dateText(k)));
      const p = partsOf(value);
      const dayIndex = Math.max(0, keys.indexOf(valueKey));
      this.setData({ dateKeys: keys, dateLabels: labels, indexes: [dayIndex, p.hour, p.minute] });
    },
    onChange(e: WechatMiniprogram.PickerViewChange) {
      const [d, h, m] = e.detail.value;
      const key = this.data.dateKeys[d];
      if (!key) return;
      const ts = Math.min(tsOf(key, h, m), store.now());
      this.triggerEvent('change', { value: ts });
    },
  },
});
