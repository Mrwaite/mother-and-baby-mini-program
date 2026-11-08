// 计时显示：text = base + (running ? 校准后的现在 − start : 0)。
// 页面隐藏时停止刷新，显示时继续；format: clock（12:34）/ duration（1小时5分）/ ago（25分钟前）

import { store } from '../../store/index';
import { agoText, clockText, durationText } from '../../utils/time';

const timers = new WeakMap<object, number>();

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    start: { type: Number, value: 0 },
    base: { type: Number, value: 0 },
    running: { type: Boolean, value: true },
    format: { type: String, value: 'clock' },
  },
  data: {
    text: '',
  },
  observers: {
    'start, base, running, format'() {
      this.restart();
    },
  },
  lifetimes: {
    detached() {
      this.stop();
    },
  },
  pageLifetimes: {
    show() {
      this.restart();
    },
    hide() {
      this.stop();
    },
  },
  methods: {
    render() {
      const { start, base, running, format } = this.data;
      const now = store.now();
      let text: string;
      if (format === 'ago') text = start ? agoText(start, now) : '';
      else {
        const ms = base + (running && start ? now - start : 0);
        text = format === 'duration' ? durationText(ms) : clockText(ms);
      }
      if (text !== this.data.text) this.setData({ text });
    },
    restart() {
      this.stop();
      this.render();
      if (!this.data.running || !this.data.start) return;
      const id = setInterval(() => this.render(), this.data.format === 'clock' ? 1000 : 10000) as unknown as number;
      timers.set(this, id);
    },
    stop() {
      const id = timers.get(this);
      if (id) clearInterval(id);
      timers.delete(this);
    },
  },
});
