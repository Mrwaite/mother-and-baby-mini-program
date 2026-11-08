// 轻量全局状态：当前用户、宝宝档案、服务端时间偏移，以及跨页面的数据变更事件

import type { Baby, User } from '../shared/api';

export type StoreEvent = 'care:changed' | 'growth:changed' | 'milestone:changed' | 'inventory:changed' | 'baby:changed';

type Listener = () => void;

interface State {
  user: User | null;
  baby: Baby | null;
  /** 服务端时间 − 本机时间（毫秒），计时显示用 */
  serverOffset: number;
}

const state: State = { user: null, baby: null, serverOffset: 0 };
const listeners = new Map<StoreEvent, Set<Listener>>();

let resolveReady: () => void = () => undefined;
/** /me 完成后 resolve；各页面先 await 再请求数据 */
let readyPromise = new Promise<void>((r) => (resolveReady = r));

export const store = {
  get user() {
    return state.user;
  },
  get baby() {
    return state.baby;
  },

  ready(): Promise<void> {
    return readyPromise;
  },

  /** 重新进入启动流程时调用（例如从无权限页重试） */
  resetReady() {
    readyPromise = new Promise<void>((r) => (resolveReady = r));
  },

  setSession(user: User, baby: Baby | null) {
    state.user = user;
    state.baby = baby;
    resolveReady();
  },

  setBaby(baby: Baby) {
    state.baby = baby;
    this.emit('baby:changed');
  },

  /** 用服务端时间校准（响应头 X-Server-Time 或返回体 serverTime） */
  syncServerTime(serverTime: number) {
    if (serverTime > 0) state.serverOffset = serverTime - Date.now();
  },

  /** 校准后的当前时间 */
  now(): number {
    return Date.now() + state.serverOffset;
  },

  on(event: StoreEvent, fn: Listener): () => void {
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  },

  emit(event: StoreEvent) {
    listeners.get(event)?.forEach((fn) => fn());
  },
};

/**
 * 页面级「需要刷新」标记：其他页面改了数据时标记，下次 onShow 时重新拉取。
 * 用法：const dirty = watchDirty(['care:changed']); onShow 里 if (dirty.take()) reload()
 */
export function watchDirty(events: StoreEvent[]) {
  let dirty = true;
  const offs = events.map((e) => store.on(e, () => (dirty = true)));
  return {
    take(): boolean {
      const d = dirty;
      dirty = false;
      return d;
    },
    mark() {
      dirty = true;
    },
    dispose() {
      offs.forEach((off) => off());
    },
  };
}
