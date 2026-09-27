// 记录层：localStorage 读写 + 发布订阅。不依赖 React、不含业务规则。

import { STORAGE_KEY, seedData } from "./seed";
import type { AppData } from "../types";

type Listener = () => void;

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.horses) && Array.isArray(parsed.orders)) {
        return {
          schemaVersion: 1,
          horses: parsed.horses,
          orders: parsed.orders,
          slots: Array.isArray(parsed.slots) && parsed.slots.length > 0 ? parsed.slots : seedData().slots,
        };
      }
    }
  } catch {
    // 存储损坏时回落到示例数据
  }
  const seeded = seedData();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // 隐私模式等场景下仅保留内存数据
  }
  return seeded;
}

let state: AppData = load();
const listeners = new Set<Listener>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略写入失败
  }
}

export function getState(): AppData {
  return state;
}

export function setState(updater: (draft: AppData) => AppData): void {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 整体替换数据（导入 JSON / 恢复示例） */
export function replaceData(next: AppData): void {
  state = {
    schemaVersion: 1,
    horses: next.horses ?? [],
    orders: next.orders ?? [],
    slots: next.slots && next.slots.length > 0 ? next.slots : seedData().slots,
  };
  persist();
  listeners.forEach((l) => l());
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
