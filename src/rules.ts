// 判断层：派工规则与风险判定。全部为纯函数，不读写存储、不渲染页面。

import type { DispatchOrder, Horse, RiskLevel } from "./store";

export const KICK_HIGH_RISK_THRESHOLD = 3; // 踢人次数达到即建议登记为高风险
export const PASS_SCORE = 4; // 配合评分达标线
export const PASS_STREAK = 2; // 连续达标次数，达到即自动降为普通

export const TIME_SLOTS: string[] = ["08:30", "10:00", "13:30", "15:00", "16:30"];

export const HABIT_OPTIONS: string[] = [
  "抬蹄顺利，无需看护",
  "需先安抚才肯抬蹄",
  "单蹄抗拒，需搭档按住",
  "频繁踢人，需双人看护",
];

export function suggestRisk(kickCount: number): RiskLevel {
  return kickCount >= KICK_HIGH_RISK_THRESHOLD ? "high" : "normal";
}

export function needsTwoPerson(horse: Horse): boolean {
  return horse.risk === "high";
}

export function riskLabel(risk: RiskLevel): string {
  return risk === "high" ? "高风险" : "普通";
}

export function statusLabel(status: DispatchOrder["status"]): string {
  return status === "pending" ? "待排" : status === "scheduled" ? "已排" : "已完成";
}

// 规则：同一匹马当天只留一张未完成派工单（待排 / 已排都算未完成）
export function findUnfinishedOrder(
  orders: DispatchOrder[],
  horseId: string,
  date: string
): DispatchOrder | undefined {
  return orders.find(
    (o) => o.horseId === horseId && o.date === date && o.status !== "done"
  );
}

// 规则：高风险马只能排双人时段
export function validateSchedule(horse: Horse, slot: string, crew: number): string | null {
  if (!slot) return "请选择时段";
  if (crew !== 1 && crew !== 2) return "请选择人手";
  if (needsTwoPerson(horse) && crew !== 2) {
    return `「${horse.code}」是高风险马，只能排双人时段`;
  }
  return null;
}

// 规则：一次安全修蹄记一次配合；连续两次达到 4 分自动降为普通
export function applyCooperationScore(
  horse: Horse,
  score: number
): { horse: Horse; downgraded: boolean } {
  const passStreak = score >= PASS_SCORE ? horse.passStreak + 1 : 0;
  const downgraded = horse.risk === "high" && passStreak >= PASS_STREAK;
  return {
    horse: {
      ...horse,
      scores: [...horse.scores, score],
      passStreak: downgraded ? 0 : passStreak,
      risk: downgraded ? "normal" : horse.risk,
    },
    downgraded,
  };
}

// 规则：改动风险或取消派工，原安排失效，工单回到待排
export function invalidateOrder(order: DispatchOrder, reason: string): DispatchOrder {
  if (order.status !== "scheduled" || !order.slot || !order.crew) return order;
  return {
    ...order,
    status: "pending",
    slot: null,
    crew: null,
    voids: [
      ...order.voids,
      { slot: order.slot, crew: order.crew, reason, at: new Date().toISOString() },
    ],
  };
}

export function lastScore(horse: Horse): string {
  return horse.scores.length ? `${horse.scores[horse.scores.length - 1]} 分` : "—";
}

export function averageScore(horse: Horse): string {
  if (!horse.scores.length) return "—";
  const sum = horse.scores.reduce((a, b) => a + b, 0);
  return (sum / horse.scores.length).toFixed(1);
}
