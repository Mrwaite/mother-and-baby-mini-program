// 数值步进器：− [输入框] +。digits 为小数位数（0 表示整数）

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    value: { type: Number, value: 0 },
    step: { type: Number, value: 1 },
    min: { type: Number, value: 0 },
    max: { type: Number, value: 9999 },
    digits: { type: Number, value: 0 },
    unit: { type: String, value: '' },
  },
  data: {
    text: '0',
  },
  observers: {
    'value, digits'(value: number, digits: number) {
      this.setData({ text: format(value, digits) });
    },
  },
  methods: {
    emit(v: number) {
      const { min, max, digits } = this.data;
      const factor = Math.pow(10, digits);
      const clamped = Math.min(max, Math.max(min, Math.round(v * factor) / factor));
      this.setData({ text: format(clamped, digits) });
      if (clamped !== this.data.value) this.triggerEvent('change', { value: clamped });
    },
    onMinus() {
      this.emit(this.data.value - this.data.step);
    },
    onPlus() {
      this.emit(this.data.value + this.data.step);
    },
    onInput(e: WechatMiniprogram.Input) {
      this.setData({ text: e.detail.value });
    },
    onBlur() {
      const v = parseFloat(this.data.text);
      this.emit(Number.isFinite(v) ? v : this.data.value);
    },
  },
});

function format(v: number, digits: number): string {
  return digits > 0 ? v.toFixed(digits) : String(Math.round(v));
}
