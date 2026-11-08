// 接口函数：按业务划分，页面只调用这里，不直接拼路径

import type {
  Baby,
  BabyInput,
  CareRecord,
  CreateCareRecordInput,
  DashboardResponse,
  DaySummary,
  GrowthRecord,
  GrowthRecordInput,
  InventoryItem,
  InventoryItemInput,
  InventoryItemUpdate,
  InventoryLog,
  InventoryLogInput,
  InventoryLogResult,
  MeResponse,
  MedicineName,
  Milestone,
  MilestoneInput,
  Photo,
  UpdateCareRecordInput,
} from '../shared/api';
import type { CareType } from '../shared/care';
import { api } from './request';

export const meApi = {
  me: () => api.get<MeResponse>('/me'),
  saveBaby: (input: BabyInput) => api.put<Baby>('/baby', input),
};

export const careApi = {
  dashboard: () => api.get<DashboardResponse>('/dashboard'),
  list: (from: number, to: number, type?: CareType) => api.get<CareRecord[]>('/care-records', { from, to, type }),
  summary: (date: string) => api.get<DaySummary>('/care-records/summary', { date }),
  last: (type: CareType) => api.get<{ record: CareRecord | null }>('/care-records/last', { type }, true),
  medicineNames: () => api.get<MedicineName[]>('/care-records/medicine-names', undefined, true),
  /** 409 TIMER_RUNNING 由调用方处理，所以不弹默认 toast */
  create: (input: CreateCareRecordInput) => api.post<CareRecord>('/care-records', input, true),
  update: (id: number, input: UpdateCareRecordInput) => api.put<CareRecord>(`/care-records/${id}`, input, true),
  remove: (id: number) => api.del(`/care-records/${id}`),
};

export const growthApi = {
  list: () => api.get<GrowthRecord[]>('/growth-records'),
  create: (input: GrowthRecordInput) => api.post<GrowthRecord>('/growth-records', input),
  update: (id: number, input: Partial<GrowthRecordInput>) => api.put<GrowthRecord>(`/growth-records/${id}`, input),
  remove: (id: number) => api.del(`/growth-records/${id}`),
};

export const milestoneApi = {
  list: () => api.get<Milestone[]>('/milestones'),
  get: (id: number) => api.get<Milestone>(`/milestones/${id}`),
  create: (input: MilestoneInput) => api.post<Milestone>('/milestones', input),
  update: (id: number, input: Partial<MilestoneInput>) => api.put<Milestone>(`/milestones/${id}`, input),
  remove: (id: number) => api.del(`/milestones/${id}`),
  registerFile: (fileId: string) => api.post<Photo>('/files', { fileId }),
};

export const inventoryApi = {
  list: (archived = false) => api.get<InventoryItem[]>('/inventory/items', { archived }),
  get: (id: number) => api.get<InventoryItem>(`/inventory/items/${id}`),
  create: (input: InventoryItemInput) => api.post<InventoryItem>('/inventory/items', input),
  update: (id: number, input: InventoryItemUpdate) => api.put<InventoryItem>(`/inventory/items/${id}`, input),
  logs: (id: number, before?: number, limit = 50) => api.get<InventoryLog[]>(`/inventory/items/${id}/logs`, { before, limit }),
  addLog: (id: number, input: InventoryLogInput) => api.post<InventoryLogResult>(`/inventory/items/${id}/logs`, input, true),
};
