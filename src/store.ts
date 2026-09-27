// 记录层：数据类型与浏览器 localStorage 持久化。
// 只做"存取"，不做任何派工判断（判断见 rules.ts，页面见 App.tsx）。

export type RiskLevel = "high" | "normal";
export type OrderStatus = "pending" | "scheduled" | "done";

export interface Horse {
  id: string;
  code: string; // 马号
  habit: string; // 抬蹄习惯
  kickCount: number; // 累计踢人次数
  risk: RiskLevel; // 风险等级
  scores: number[]; // 配合评分历史：一次安全修蹄记一次
  passStreak: number; // 当前连续 >=4 分的次数
  createdAt: string;
}

export interface VoidRecord {
  slot: string; // 被失效的时段
  crew: number; // 被失效的人手安排
  reason: string; // 失效原因：取消派工 / 风险等级调整
  at: string;
}

export interface DispatchOrder {
  id: string;
  horseId: string;
  date: string; // 派工日期 YYYY-MM-DD
  note: string;
  status: OrderStatus; // pending 待排 / scheduled 已排 / done 已完成
  slot: string | null; // 已排时段
  crew: 1 | 2 | null; // 已排人手：1 单人 / 2 双人
  score: number | null; // 本次配合评分（完成后录入）
  kicks: number; // 本次修蹄踢人次数
  voids: VoidRecord[]; // 历次失效安排
  createdAt: string;
  doneAt: string | null;
}

export interface BoardState {
  horses: Horse[];
  orders: DispatchOrder[];
}

const STORAGE_KEY = "farrier-dispatch-board-v1";

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shiftDay(date: string, offset: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function loadState(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BoardState;
      if (parsed && Array.isArray(parsed.horses) && Array.isArray(parsed.orders)) {
        return parsed;
      }
    }
  } catch {
    // 本地数据损坏时回退到初始数据
  }
  return seedState();
}

export function saveState(state: BoardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储被禁用时不阻断页面使用
  }
}

// 首次打开的演示数据：一匹高风险、一匹普通、一匹再达标一次即可自动降级
function seedState(): BoardState {
  const today = todayStr();
  const yesterday = shiftDay(today, -1);
  const now = new Date().toISOString();
  return {
    horses: [
      {
        id: "h-018",
        code: "M-018",
        habit: "右后蹄抗拒，需搭档按住",
        kickCount: 4,
        risk: "high",
        scores: [2, 3],
        passStreak: 0,
        createdAt: now,
      },
      {
        id: "h-027",
        code: "M-027",
        habit: "抬蹄顺利，偶见甩尾",
        kickCount: 0,
        risk: "normal",
        scores: [5],
        passStreak: 1,
        createdAt: now,
      },
      {
        id: "h-031",
        code: "M-031",
        habit: "左前蹄敏感，需先安抚",
        kickCount: 2,
        risk: "high",
        scores: [3, 4],
        passStreak: 1,
        createdAt: now,
      },
    ],
    orders: [
      {
        id: "o-seed-1",
        horseId: "h-027",
        date: yesterday,
        note: "定期修蹄",
        status: "done",
        slot: "10:00",
        crew: 1,
        score: 5,
        kicks: 0,
        voids: [],
        createdAt: now,
        doneAt: now,
      },
      {
        id: "o-seed-2",
        horseId: "h-031",
        date: yesterday,
        note: "更换蹄铁",
        status: "done",
        slot: "15:00",
        crew: 2,
        score: 4,
        kicks: 0,
        voids: [],
        createdAt: now,
        doneAt: now,
      },
      {
        id: "o-seed-3",
        horseId: "h-018",
        date: today,
        note: "客户反映最近更易踢人，上门前未知",
        status: "pending",
        slot: null,
        crew: null,
        score: null,
        kicks: 0,
        voids: [],
        createdAt: now,
        doneAt: null,
      },
    ],
  };
}
