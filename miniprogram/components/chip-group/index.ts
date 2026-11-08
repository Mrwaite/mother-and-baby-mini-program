// chip 单选：options 为 [{ value, label }]；allowEmpty 时再次点击已选项会取消选择（value 变为 ''）

export interface ChipOption {
  value: string | number;
  label: string;
}

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    options: { type: Array, value: [] as ChipOption[] },
    value: { type: String, optionalTypes: [Number], value: '' },
    allowEmpty: { type: Boolean, value: false },
    /** 横向滚动（筛选栏），否则自动换行 */
    scroll: { type: Boolean, value: false },
    /** 选中态主题色，默认主色 */
    color: { type: String, value: '' },
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const opt = (this.data.options as ChipOption[])[Number(e.currentTarget.dataset.index)];
      if (!opt) return;
      const selected = opt.value === this.data.value;
      if (selected && !this.data.allowEmpty) return;
      this.triggerEvent('change', { value: selected ? '' : opt.value });
    },
  },
});
