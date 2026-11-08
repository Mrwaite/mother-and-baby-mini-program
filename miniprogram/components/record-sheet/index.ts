// 护理记录新增/编辑弹层（首页、时间线共用）。
// 页面通过 selectComponent('#record-sheet').open({ type, record }) 打开：
//   - 只传 type：新增。时间点类预填「现在 + 同类型上次的值」；计时类进入「开始计时」（已有进行中的计时则直接进入计时中）
//   - 传 record：编辑。进行中的计时进入计时中；其余进入表单
// 保存成功后振动、toast、关闭，触发 saved { action } 并广播 care:changed

import { DEFAULTS, RECORD_TYPE_MAP } from '../../config/record-types';
import { careApi } from '../../services/api';
import { ApiError } from '../../services/request';
import type { CareRecord, CreateCareRecordInput, MedicineName, UpdateCareRecordInput } from '../../shared/api';
import {
  DIAPER_KINDS,
  LABELS,
  MEDICINE_UNITS,
  MILK_TYPES,
  POO_COLORS,
  POO_TEXTURES,
  TEMP_SITES,
  activeSide,
  breastSideDurations,
  isFever,
  isTimerType,
} from '../../shared/care';
import type { BreastSegment, CarePayloadMap, CareType, DiaperKind, MedicineUnit, MilkType, Side, TempSite } from '../../shared/care';
import { DAY_MS, MINUTE_MS } from '../../shared/time';
import { store } from '../../store/index';
import { durationText, hm, whenText } from '../../utils/time';
import { uuid } from '../../utils/uuid';

type Mode = 'point' | 'idle' | 'running' | 'manual';
type Picker = '' | 'start' | 'end';

export interface OpenOptions {
  type: CareType;
  record?: CareRecord | null;
}

function optionsOf<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((v) => ({ value: v, label: labels[v] }));
}

const TIME_CHIPS = [{ value: 0, label: '现在' }].concat(DEFAULTS.timeAgoChips.map((n) => ({ value: n, label: `${n}分钟前` })));
const CUSTOM_TIME = -1;

/** 每次打开都重置的表单字段 */
function blankForm() {
  return {
    recordId: 0,
    clientId: '',
    saving: false,
    picker: '' as Picker,
    timeChip: 0,
    startAt: 0,
    endAt: 0,
    startText: '现在',
    endText: '',
    spanText: '',
    note: '',
    touched: false,
    /** 编辑计时类时，是否改动过亲喂分段或开始时间（没改就不重写分段） */
    segmentsDirty: false,

    milkType: 'formula' as MilkType,
    amountMl: DEFAULTS.bottleMl,

    diaperKind: 'pee' as DiaperKind,
    pooColor: '',
    pooTexture: '',

    pumpMode: 'total',
    pumpTotal: DEFAULTS.pumpMl,
    pumpLeft: DEFAULTS.pumpMl / 2,
    pumpRight: DEFAULTS.pumpMl / 2,
    pumpDuration: '',

    celsiusText: '',
    site: 'armpit' as TempSite,
    fever: false,

    medName: '',
    medDose: DEFAULTS.medicineDose,
    medUnit: 'ml' as MedicineUnit,
    medicineNames: [] as MedicineName[],
    medicineOptions: [] as { value: number; label: string }[],

    leftMin: 10,
    rightMin: 10,

    segments: [] as BreastSegment[],
    activeSide: '' as Side | '',
    activeStart: 0,
    leftBase: 0,
    rightBase: 0,
  };
}

/** 亲喂计时中：已结束分段的左右累计 + 当前一侧的开始时间 */
function sideState(segments: BreastSegment[]) {
  const closed = breastSideDurations(
    segments.filter((s) => s.endAt !== null),
    0,
  );
  const side = activeSide(segments);
  return {
    leftBase: closed.left,
    rightBase: closed.right,
    activeSide: (side ?? '') as Side | '',
    activeStart: side ? segments[segments.length - 1].startAt : 0,
  };
}

const vibrate = () => wx.vibrateShort({ type: 'light', fail: () => undefined });

const hint = (title: string) => wx.showToast({ title, icon: 'none' });

function toastError(err: unknown) {
  if (err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403)) return;
  hint((err as Error).message || '保存失败');
}

Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  data: {
    show: false,
    title: '',
    type: 'bottle' as CareType,
    color: '',
    bg: '',
    mode: 'point' as Mode,
    timeChips: TIME_CHIPS,
    milkOptions: optionsOf(MILK_TYPES, LABELS.milkType),
    diaperOptions: optionsOf(DIAPER_KINDS, LABELS.diaperKind),
    colorOptions: optionsOf(POO_COLORS, LABELS.pooColor),
    textureOptions: optionsOf(POO_TEXTURES, LABELS.pooTexture),
    siteOptions: optionsOf(TEMP_SITES, LABELS.tempSite),
    unitOptions: optionsOf(MEDICINE_UNITS, LABELS.medicineUnit),
    pumpModeOptions: [
      { value: 'total', label: '总量' },
      { value: 'sides', label: '分左右' },
    ],
    bottleChips: DEFAULTS.bottleChips.map((v) => ({ value: v, label: `${v}` })),
    pumpChips: DEFAULTS.pumpChips.map((v) => ({ value: v, label: `${v}` })),
    ...blankForm(),
  },
  methods: {
    open(opts: OpenOptions) {
      const type = opts.record?.type ?? opts.type;
      const meta = RECORD_TYPE_MAP[type];
      const record = opts.record ?? null;
      const form = { ...blankForm(), clientId: uuid() };
      let mode: Mode;
      let title = meta.label;

      if (!record) {
        mode = isTimerType(type) ? 'idle' : 'point';
      } else if (isTimerType(type) && record.endAt === null) {
        mode = 'running';
        title = `${meta.label}中`;
      } else {
        mode = isTimerType(type) ? 'manual' : 'point';
        title = `编辑${meta.label}`;
      }

      if (record) Object.assign(form, this.formFromRecord(record));

      this.setData({ show: true, type, title, color: meta.color, bg: meta.bg, mode, ...form });
      this.refreshTimeText();

      if (!record && mode === 'point') this.prefill(type, form.clientId);
    },

    close() {
      this.setData({ show: false, picker: '' });
      this.triggerEvent('close');
    },

    onClose() {
      this.close();
    },

    /** 编辑已有记录时回填表单 */
    formFromRecord(r: CareRecord): Partial<ReturnType<typeof blankForm>> {
      const base = { recordId: r.id, timeChip: CUSTOM_TIME, startAt: r.startAt, endAt: r.endAt ?? 0, note: r.note ?? '' };
      switch (r.type) {
        case 'bottle':
          return { ...base, milkType: r.payload.milkType, amountMl: r.payload.amountMl };
        case 'diaper':
          return { ...base, diaperKind: r.payload.kind, pooColor: r.payload.pooColor ?? '', pooTexture: r.payload.pooTexture ?? '' };
        case 'pump': {
          const sides = r.payload.leftMl !== undefined || r.payload.rightMl !== undefined;
          return {
            ...base,
            pumpMode: sides ? 'sides' : 'total',
            pumpTotal: r.payload.totalMl,
            pumpLeft: r.payload.leftMl ?? 0,
            pumpRight: r.payload.rightMl ?? 0,
            pumpDuration: r.payload.durationMin !== undefined ? String(r.payload.durationMin) : '',
          };
        }
        case 'temperature':
          return {
            ...base,
            celsiusText: r.payload.celsius.toFixed(1),
            site: r.payload.site ?? 'armpit',
            fever: isFever(r.payload.celsius, r.payload.site),
          };
        case 'medicine':
          return { ...base, medName: r.payload.name, medDose: r.payload.dose, medUnit: r.payload.unit };
        case 'breastfeed': {
          const segments = r.payload.segments;
          const d = breastSideDurations(segments, store.now());
          return {
            ...base,
            segments,
            ...sideState(segments),
            leftMin: Math.round(d.left / MINUTE_MS),
            rightMin: Math.round(d.right / MINUTE_MS),
          };
        }
        default:
          return base;
      }
    },

    /** 新增时预填同类型上次的值；用户已经改过表单就不覆盖 */
    async prefill(type: CareType, clientId: string) {
      try {
        const [last, names] = await Promise.all([
          careApi.last(type),
          type === 'medicine' ? careApi.medicineNames() : Promise.resolve([] as MedicineName[]),
        ]);
        if (this.data.clientId !== clientId) return;
        if (type === 'medicine') {
          this.setData({
            medicineNames: names,
            medicineOptions: names.map((n, i) => ({ value: i, label: n.name })),
          });
        }
        const r = last.record;
        if (!r || this.data.touched) return;
        switch (r.type) {
          case 'bottle':
            this.setData({ milkType: r.payload.milkType, amountMl: r.payload.amountMl });
            break;
          case 'diaper':
            this.setData({ diaperKind: r.payload.kind });
            break;
          case 'pump': {
            const sides = r.payload.leftMl !== undefined || r.payload.rightMl !== undefined;
            this.setData({
              pumpMode: sides ? 'sides' : 'total',
              pumpTotal: r.payload.totalMl,
              pumpLeft: r.payload.leftMl ?? 0,
              pumpRight: r.payload.rightMl ?? 0,
            });
            break;
          }
          case 'temperature':
            // 体温必须实测，只带出测量部位
            this.setData({ site: r.payload.site ?? 'armpit' });
            break;
          case 'medicine':
            this.setData({ medName: r.payload.name, medDose: r.payload.dose, medUnit: r.payload.unit });
            break;
        }
      } catch {
        // 预填失败不影响记录
      }
    },

    // ---------- 时间 ----------

    /** 当前选择对应的开始时间 */
    resolveStart(): number {
      const { timeChip, startAt } = this.data;
      if (timeChip === CUSTOM_TIME) return startAt;
      return store.now() - timeChip * MINUTE_MS;
    },

    refreshTimeText() {
      const now = store.now();
      const { timeChip, mode, type, startAt, endAt, leftMin, rightMin } = this.data;
      const startText =
        timeChip === CUSTOM_TIME ? whenText(startAt, now) : timeChip === 0 ? '现在' : `${timeChip}分钟前`;
      let endText = '';
      let spanText = '';
      if (mode === 'manual' && type === 'sleep') {
        endText = whenText(endAt, now);
        spanText = endAt > startAt ? `共 ${durationText(endAt - startAt)}` : '';
      } else if (mode === 'manual' && type === 'breastfeed') {
        const end = this.resolveStart() + (leftMin + rightMin) * MINUTE_MS;
        spanText = `共 ${leftMin + rightMin} 分钟 · 结束于 ${hm(end)}`;
      }
      this.setData({ startText, endText, spanText });
    },

    onTimeChip(e: WechatMiniprogram.CustomEvent<{ value: number }>) {
      this.setData({ timeChip: Number(e.detail.value), picker: '', touched: true, segmentsDirty: true });
      this.refreshTimeText();
    },

    onToggleStartPicker() {
      if (this.data.picker === 'start') {
        this.setData({ picker: '' });
        return;
      }
      // 切到自定义时间：以当前选择为初始值
      this.setData({ startAt: this.resolveStart(), timeChip: CUSTOM_TIME, picker: 'start' });
      this.refreshTimeText();
    },

    onToggleEndPicker() {
      this.setData({ picker: this.data.picker === 'end' ? '' : 'end', endAt: this.data.endAt || store.now() });
    },

    onPickStart(e: WechatMiniprogram.CustomEvent<{ value: number }>) {
      this.setData({ startAt: e.detail.value, timeChip: CUSTOM_TIME, touched: true, segmentsDirty: true });
      this.refreshTimeText();
    },

    onPickEnd(e: WechatMiniprogram.CustomEvent<{ value: number }>) {
      this.setData({ endAt: e.detail.value, touched: true });
      this.refreshTimeText();
    },

    // ---------- 表单字段 ----------

    /** 通用字段更新：组件上写 data-field="字段名" */
    onField(e: WechatMiniprogram.CustomEvent<{ value: unknown }>) {
      const field = String(e.currentTarget.dataset.field);
      const value = e.detail.value;
      const patch: Record<string, unknown> = { [field]: value, touched: true };
      if (field === 'leftMin' || field === 'rightMin') patch.segmentsDirty = true;
      this.setData(patch);
      if (field === 'leftMin' || field === 'rightMin') this.refreshTimeText();
    },

    /** 常用值 chip 是数字 */
    onNumberChip(e: WechatMiniprogram.CustomEvent<{ value: number | string }>) {
      if (e.detail.value === '') return;
      this.setData({ [String(e.currentTarget.dataset.field)]: Number(e.detail.value), touched: true });
    },

    onInput(e: WechatMiniprogram.Input) {
      const field = String(e.currentTarget.dataset.field);
      const patch: Record<string, unknown> = { [field]: e.detail.value, touched: true };
      if (field === 'celsiusText') {
        const v = parseFloat(e.detail.value);
        patch.fever = Number.isFinite(v) && isFever(v, this.data.site);
      }
      this.setData(patch);
    },

    onSite(e: WechatMiniprogram.CustomEvent<{ value: TempSite }>) {
      const v = parseFloat(this.data.celsiusText);
      this.setData({ site: e.detail.value, touched: true, fever: Number.isFinite(v) && isFever(v, e.detail.value) });
    },

    onMedicineChip(e: WechatMiniprogram.CustomEvent<{ value: number | string }>) {
      const m = this.data.medicineNames[Number(e.detail.value)];
      if (m) this.setData({ medName: m.name, medDose: m.dose, medUnit: m.unit, touched: true });
    },

    // ---------- 保存 ----------

    buildPayload(): { payload?: CarePayloadMap[CareType]; error?: string } {
      const d = this.data;
      switch (d.type) {
        case 'bottle':
          if (!(d.amountMl > 0)) return { error: '请填写奶量' };
          return { payload: { milkType: d.milkType, amountMl: d.amountMl } };
        case 'diaper': {
          const p: CarePayloadMap['diaper'] = { kind: d.diaperKind };
          if (d.diaperKind !== 'pee') {
            if (d.pooColor) p.pooColor = d.pooColor as CarePayloadMap['diaper']['pooColor'];
            if (d.pooTexture) p.pooTexture = d.pooTexture as CarePayloadMap['diaper']['pooTexture'];
          }
          return { payload: p };
        }
        case 'pump': {
          const p: CarePayloadMap['pump'] =
            d.pumpMode === 'sides'
              ? { totalMl: d.pumpLeft + d.pumpRight, leftMl: d.pumpLeft, rightMl: d.pumpRight }
              : { totalMl: d.pumpTotal };
          if (!(p.totalMl > 0)) return { error: '请填写吸奶量' };
          const minutes = parseInt(d.pumpDuration, 10);
          if (Number.isFinite(minutes) && minutes > 0) p.durationMin = Math.min(minutes, 300);
          return { payload: p };
        }
        case 'temperature': {
          const celsius = parseFloat(d.celsiusText);
          if (!Number.isFinite(celsius)) return { error: '请填写体温' };
          if (celsius < 34 || celsius > 43) return { error: '体温应在 34–43℃ 之间' };
          return { payload: { celsius: Math.round(celsius * 10) / 10, site: d.site } };
        }
        case 'medicine': {
          const name = d.medName.trim();
          if (!name) return { error: '请填写药品名称' };
          if (!(d.medDose > 0)) return { error: '请填写剂量' };
          return { payload: { name, dose: d.medDose, unit: d.medUnit } };
        }
        case 'breastfeed': {
          // 手动补录：先左后右，连续排列
          const start = this.resolveStart();
          const segments: BreastSegment[] = [];
          let t = start;
          if (d.leftMin > 0) {
            segments.push({ side: 'left', startAt: t, endAt: t + d.leftMin * MINUTE_MS });
            t += d.leftMin * MINUTE_MS;
          }
          if (d.rightMin > 0) segments.push({ side: 'right', startAt: t, endAt: t + d.rightMin * MINUTE_MS });
          if (!segments.length) return { error: '请填写喂奶时长' };
          return { payload: { segments } };
        }
        default:
          return { payload: {} };
      }
    },

    /** 时间点类保存，以及计时类的手动补录 */
    async onSave() {
      if (this.data.saving) return;
      const d = this.data;
      const built = this.buildPayload();
      if (built.error) {
        hint(built.error);
        return;
      }
      const startAt = this.resolveStart();
      let endAt: number | null = null;
      if (d.mode === 'manual') {
        if (d.type === 'sleep') {
          endAt = d.endAt;
          if (endAt <= startAt) {
            hint('结束时间要晚于开始时间');
            return;
          }
          if (endAt - startAt > DAY_MS) {
            hint('时长不能超过 24 小时');
            return;
          }
        } else {
          endAt = startAt + (d.leftMin + d.rightMin) * MINUTE_MS;
          if (endAt > store.now() + 5 * MINUTE_MS) {
            hint('结束时间晚于现在，请调整开始时间');
            return;
          }
        }
      }
      const note = d.note.trim() || null;

      this.setData({ saving: true });
      try {
        if (d.recordId) {
          const input: UpdateCareRecordInput = { startAt, note };
          if (d.mode === 'manual') input.endAt = endAt;
          // 亲喂编辑：没动过时长和开始时间就保留原分段
          if (d.type !== 'breastfeed' || d.segmentsDirty) input.payload = built.payload;
          await careApi.update(d.recordId, input);
        } else {
          await careApi.create({ clientId: d.clientId, type: d.type, startAt, endAt, payload: built.payload, note } as CreateCareRecordInput);
        }
        this.done(d.recordId ? 'update' : 'create', '已保存');
      } catch (err) {
        toastError(err);
      } finally {
        this.setData({ saving: false });
      }
    },

    /** 开始计时（亲喂带 data-side） */
    async onStart(e: WechatMiniprogram.TouchEvent) {
      if (this.data.saving) return;
      const side = (e.currentTarget.dataset.side as Side | undefined) ?? 'left';
      const startAt = Math.min(this.resolveStart(), store.now());
      const payload = this.data.type === 'breastfeed' ? { segments: [{ side, startAt, endAt: null }] } : {};
      this.setData({ saving: true });
      try {
        await careApi.create({ clientId: this.data.clientId, type: this.data.type, startAt, endAt: null, payload } as CreateCareRecordInput);
        this.done('create', '开始计时');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'TIMER_RUNNING' && err.body?.record) {
          // 家人已经开始了同类计时：切到那条计时
          wx.showToast({ title: '已有进行中的计时', icon: 'none' });
          this.open({ type: this.data.type, record: err.body.record });
          store.emit('care:changed');
        } else {
          toastError(err);
        }
      } finally {
        this.setData({ saving: false });
      }
    },

    /** 亲喂计时中切换左右 */
    async onSwitchSide() {
      if (this.data.saving || !this.data.recordId) return;
      const now = store.now();
      const segments = this.data.segments.map((s) => ({ ...s }));
      const last = segments[segments.length - 1];
      let next: Side = 'left';
      if (last) {
        next = last.side === 'left' ? 'right' : 'left';
        if (last.endAt === null) last.endAt = Math.max(now, last.startAt);
      }
      segments.push({ side: next, startAt: last ? Math.max(now, last.startAt) : now, endAt: null });
      this.setData({ saving: true });
      try {
        const r = await careApi.update(this.data.recordId, { payload: { segments } });
        if (r.type === 'breastfeed') this.setData({ segments: r.payload.segments, ...sideState(r.payload.segments) });
        vibrate();
        store.emit('care:changed');
        this.triggerEvent('saved', { action: 'update' });
      } catch (err) {
        toastError(err);
      } finally {
        this.setData({ saving: false });
      }
    },

    /** 结束计时并保存。改过开始时间时一并提交 */
    async onStop() {
      if (this.data.saving || !this.data.recordId) return;
      const d = this.data;
      const now = store.now();
      const input: UpdateCareRecordInput = { endAt: now, note: d.note.trim() || null };
      if (d.segmentsDirty) {
        const startAt = this.resolveStart();
        input.startAt = startAt;
        if (d.type === 'breastfeed' && d.segments.length) {
          const segments = d.segments.map((s) => ({ ...s }));
          segments[0].startAt = Math.min(startAt, segments[0].endAt ?? now);
          input.payload = { segments };
        }
      }
      this.setData({ saving: true });
      try {
        await careApi.update(d.recordId, input);
        this.done('update', '已保存');
      } catch (err) {
        toastError(err);
      } finally {
        this.setData({ saving: false });
      }
    },

    onManual() {
      const now = store.now();
      // 补录默认：睡眠 1 小时前到现在；亲喂 20 分钟前开始
      const startAt = this.data.type === 'sleep' ? now - 60 * MINUTE_MS : now - 20 * MINUTE_MS;
      this.setData({ mode: 'manual', title: `补录${RECORD_TYPE_MAP[this.data.type].label}`, timeChip: CUSTOM_TIME, startAt, endAt: now, picker: '' });
      this.refreshTimeText();
    },

    onBackToTimer() {
      this.setData({ mode: 'idle', title: RECORD_TYPE_MAP[this.data.type].label, timeChip: 0, picker: '' });
      this.refreshTimeText();
    },

    onDelete() {
      const id = this.data.recordId;
      if (!id) return;
      wx.showModal({
        title: this.data.mode === 'running' ? '放弃这次计时？' : '删除这条记录？',
        confirmText: '删除',
        confirmColor: '#E5484D',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await careApi.remove(id);
            this.done('delete', '已删除');
          } catch {
            // request 已提示
          }
        },
      });
    },

    done(action: 'create' | 'update' | 'delete', toast: string) {
      vibrate();
      wx.showToast({ title: toast, icon: 'success' });
      this.setData({ show: false, picker: '' });
      store.emit('care:changed');
      this.triggerEvent('saved', { action });
    },

    noop() {},
  },
});
