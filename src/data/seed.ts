// 记录层：默认时段与首次使用的示例数据（只负责造数据，不含业务判断）

import type { AppData, DispatchOrder, Horse, SlotDef } from "../types";

export const DEFAULT_SLOTS: SlotDef[] = [
  { id: "slot-am-single", kind: "single", label: "上午单人", time: "08:30–10:00", active: true },
  { id: "slot-am-double", kind: "double", label: "上午双人", time: "10:30–12:00", active: true },
  { id: "slot-pm-double", kind: "double", label: "下午双人", time: "13:30–15:00", active: true },
  { id: "slot-pm-single", kind: "single", label: "下午单人", time: "15:30–17:00", active: true },
];

/** 浏览器本地存储键 */
export const STORAGE_KEY = "farrier-dispatch:v1";

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 首次打开时的示例档案：覆盖普通、需引导、踢人高风险、拒绝抬蹄高风险四种情况 */
function seedHorses(today: string): Horse[] {
  const t = new Date(today + "T00:00:00").toISOString();
  return [
    {
      id: "h-demo-01",
      code: "A-12",
      barnName: "栗风",
      hoofBehavior: "calm",
      behaviorNote: "四蹄都愿意抬，常规修蹄即可",
      needPartner: false,
      kickCount: 0,
      risk: "normal",
      coopStreak: 0,
      createdAt: t,
    },
    {
      id: "h-demo-02",
      code: "B-07",
      barnName: "铁锤",
      hoofBehavior: "hold",
      behaviorNote: "左后蹄敏感，上门前马号看不出来，到马房才确认",
      needPartner: true,
      kickCount: 1,
      risk: "high",
      coopStreak: 0,
      createdAt: t,
    },
    {
      id: "h-demo-03",
      code: "C-21",
      barnName: "青霜",
      hoofBehavior: "coax",
      behaviorNote: "前蹄要先喂料引导，耐心一点可以完成",
      needPartner: false,
      kickCount: 0,
      risk: "normal",
      coopStreak: 0,
      createdAt: t,
    },
    {
      id: "h-demo-04",
      code: "D-03",
      barnName: "黑炭",
      hoofBehavior: "refuse",
      behaviorNote: "陌生蹄铁师不肯抬蹄，必须双人时段",
      needPartner: true,
      kickCount: 0,
      risk: "high",
      // 已连续一次 4 分以上，再来一次达标即自动降级
      coopStreak: 1,
      createdAt: t,
    },
  ];
}

function seedOrders(today: string): DispatchOrder[] {
  const base = new Date(today + "T08:00:00").toISOString();
  return [
    {
      id: "o-demo-01",
      horseId: "h-demo-01",
      date: today,
      note: "常规检查 + 换新蹄铁",
      status: "scheduled",
      slotId: "slot-am-single",
      createdAt: base,
      events: [
        { at: base, type: "create", detail: "开派工单" },
        { at: base, type: "assign", detail: "安排到上午单人（08:30–10:00）" },
      ],
    },
    {
      id: "o-demo-02",
      horseId: "h-demo-02",
      date: today,
      note: "后蹄铁松动，搭档小王按住",
      status: "scheduled",
      slotId: "slot-am-double",
      partnerName: "小王",
      createdAt: base,
      events: [
        { at: base, type: "create", detail: "开派工单" },
        { at: base, type: "assign", detail: "安排到上午双人（10:30–12:00），搭档：小王" },
      ],
    },
    {
      id: "o-demo-03",
      horseId: "h-demo-04",
      date: today,
      note: "继续双人操作，达标一次即可降级观察",
      status: "pending",
      createdAt: base,
      events: [{ at: base, type: "create", detail: "开派工单（待排）" }],
    },
  ];
}

export function seedData(): AppData {
  const today = todayStr();
  return {
    schemaVersion: 1,
    horses: seedHorses(today),
    orders: seedOrders(today),
    slots: DEFAULT_SLOTS.map((s) => ({ ...s })),
  };
}
