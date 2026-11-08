// 分段控件：options 为 [{ value, label }]

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    options: { type: Array, value: [] as { value: string; label: string }[] },
    value: { type: String, value: '' },
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const value = String(e.currentTarget.dataset.value);
      if (value !== this.data.value) this.triggerEvent('change', { value });
    },
  },
});
