// 记录卡片（首页、时间线共用）：图标、类型名、关键数值标签、副标题、记录人和箭头。点击触发 open { id }

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    /** RecordCardVM（utils/format.ts） */
    item: { type: Object, value: {} },
    /** 右侧显示时间（首页）；时间线由左侧时间轴显示时间 */
    showTime: { type: Boolean, value: false },
  },
  methods: {
    onTap() {
      this.triggerEvent('open', { id: (this.data.item as { id: number }).id });
    },
  },
});
