// 判断层：纯函数，不碰 localStorage、不碰 DOM。
// 所有业务规则（高风险判定、派工限制、降风险）集中在这里。

import type {
  DispatchOrder,
  HoofBehavior,
  RiskLevel,
  SlotDef,
  Horse,
} from "../types";

export const HOOF_BEHAVIOR_LABEL: Record<HoofBehavior, string> = {
  calm: "愿意抬蹄",
  coax: "需引导",
  hold: "需搭档按住",
  refuse: "不肯抬蹄",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  normal: "普通",
  high: "高风险",
};

/** 连续配合达标所需次数：连续两次达到 4 分后自动降为普通 */
export const DOWNGRADE_STREAK = 2;
/** 配合达标分数线 */
export const PASS_SCORE = 4;

/**
 * 根据档案特征判断风险等级。
 * 踢过人、抬蹄需要搭档按住、或不肯抬蹄 → 高风险。
 */
export function suggestRisk(h: Pick<Horse, "kickCount" | "needPartner" | "hoofBehavior">): RiskLevel {
  return h.kickCount > 0 || h.needPartner || h.hoofBehavior === "refuse"
    ? "high"
    : "normal";
}

/** 判定某匹马当前为何属于高风险（用于页面提示原因） */
export function riskReasons(h: Pick<Horse, "kickCount" | "needPartner" | "hoofBehavior">): string[] {
  const reasons: string[] = [];
  if (h.kickCount > 0) reasons.push(`累计踢人 ${h.kickCount} 次`);
  if (h.needPartner) reasons.push("需搭档按住");
  if (h.hoofBehavior === "refuse") reasons.push("不肯抬蹄");
  if (h.hoofBehavior === "hold") reasons.push("抬蹄需按压控制");
  return reasons;
}

/** 同马当天是否还有未完成派工单（待排或已排都算占用） */
export function findOpenOrder(
  orders: DispatchOrder[],
  horseId: string,
  date: string,
): DispatchOrder | undefined {
  return orders.find(
    (o) =>
      o.horseId === horseId &&
      o.date === date &&
      o.status !== "done",
  );
}

export interface CreateCheck {
  ok: boolean;
  reason?: string;
}

/** 开派工单前的规则检查：同一匹马当天只留一张未完成派工单 */
export function checkCanCreate(
  orders: DispatchOrder[],
  horse: Horse | undefined,
  date: string,
): CreateCheck {
  if (!horse) return { ok: false, reason: "请先选择马匹" };
  if (!date) return { ok: false, reason: "请选择派工日期" };
  const open = findOpenOrder(orders, horse.id, date);
  if (open) {
    const where = open.status === "scheduled" ? `已排在 ${open.slotId ?? "某"}时段` : "待排中";
    return {
      ok: false,
      reason: `${horse.code} 当天已有未完成派工单（${where}），完成、取消或改到其他日期后再开。`,
    };
  }
  return { ok: true };
}

export interface AssignCheck {
  ok: boolean;
  reason?: string;
}

/**
 * 排入时段前的规则检查：
 * - 高风险马只能排双人时段；
 * - 双人时段必须填写搭档；
 * - 该时段当天不能已有派工单；
 * - 只能安排待排单。
 */
export function checkCanAssign(
  order: DispatchOrder | undefined,
  horse: Horse | undefined,
  slot: SlotDef | undefined,
  dayOrders: DispatchOrder[],
  partnerName: string,
): AssignCheck {
  if (!order) return { ok: false, reason: "派工单不存在" };
  if (order.status !== "pending") return { ok: false, reason: "只有待排派工单可以安排时段" };
  if (!horse) return { ok: false, reason: "马匹档案缺失" };
  if (!slot || !slot.active) return { ok: false, reason: "请选择有效时段" };
  if (horse.risk === "high" && slot.kind !== "double") {
    return { ok: false, reason: "高风险马只能安排双人时段" };
  }
  if (slot.kind === "double" && !partnerName.trim()) {
    return { ok: false, reason: "双人时段必须填写搭档姓名" };
  }
  const clash = dayOrders.find(
    (o) => o.status === "scheduled" && o.slotId === slot.id && o.id !== order.id,
  );
  if (clash) return { ok: false, reason: "该时段当天已有派工单，请换一个时段" };
  return { ok: true };
}

/** 是否允许取消已排时段（取消后回到待排，原安排失效） */
export function canCancelAssignment(o: DispatchOrder): boolean {
  return o.status === "scheduled";
}

/** 是否允许删除待排单（未排入时段的单子可直接作废） */
export function canDeletePending(o: DispatchOrder): boolean {
  return o.status === "pending";
}

/** 是否允许登记本次修蹄结果（配合评分） */
export function canComplete(o: DispatchOrder): boolean {
  return o.status === "scheduled";
}

export interface CompleteResult {
  /** 更新后的连续配合次数 */
  coopStreak: number;
  /** 是否触发自动降级 */
  downgraded: boolean;
  /** 更新后的累计踢人次数 */
  kickCount: number;
}

/**
 * 一次安全修蹄记一次配合：
 * - 评分 ≥4：连续次数 +1；连续两次达到 4 分（高风险马）自动降为普通，计数清零。
 * - 评分 <4：连续次数清零。
 * - 本次踢人：累计踢人 +1、连续次数清零。
 */
export function applyCooperation(
  horse: Pick<Horse, "coopStreak" | "risk" | "kickCount">,
  score: number,
  kicked: boolean,
): CompleteResult {
  const kickCount = horse.kickCount + (kicked ? 1 : 0);

  if (kicked || score < PASS_SCORE) {
    return { coopStreak: 0, downgraded: false, kickCount };
  }

  const streak = horse.coopStreak + 1;
  if (horse.risk === "high" && streak >= DOWNGRADE_STREAK) {
    return { coopStreak: 0, downgraded: true, kickCount };
  }
  return { coopStreak: Math.min(streak, DOWNGRADE_STREAK), downgraded: false, kickCount };
}

/**
 * 改动风险等级后，原已排安排失效：
 * 该马未完成的已排单全部退回待排（清掉时段与搭档）。
 */
export function ordersToInvalidateOnRiskChange(
  orders: DispatchOrder[],
  horseId: string,
): DispatchOrder[] {
  return orders.filter(
    (o) => o.horseId === horseId && o.status === "scheduled",
  );
}

/** 最新一次修蹄评分 */
export function latestScore(orders: DispatchOrder[]): number | undefined {
  for (let i = orders.length - 1; i >= 0; i--) {
    if (orders[i].status === "done" && typeof orders[i].score === "number") {
      return orders[i].score;
    }
  }
  return undefined;
}

/** 已完成修蹄次数（配合记录条数） */
export function completedCount(orders: DispatchOrder[]): number {
  return orders.filter((o) => o.status === "done").length;
}

/** 距离自动降级还差几次达标配合 */
export function streakProgress(h: Horse): { current: number; needed: number } {
  return {
    current: h.risk === "high" ? h.coopStreak : 0,
    needed: DOWNGRADE_STREAK,
  };
}
