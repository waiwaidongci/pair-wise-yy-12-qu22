// 业务操作层：把判断层规则套到记录层数据上。页面只调用这里的动作。

import { getState, setState, uid } from "../data/store";
import { nowIso } from "../data/seed";
import {
  applyCooperation,
  checkCanAssign,
  checkCanCreate,
  ordersToInvalidateOnRiskChange,
  suggestRisk,
} from "../domain/rules";
import type {
  DispatchOrder,
  HoofBehavior,
  Horse,
  RiskLevel,
  SlotDef,
} from "../types";

export interface ActionResult {
  ok: boolean;
  reason?: string;
  /** 本次操作连带失效的原已排安排数量 */
  invalidated?: number;
  downgraded?: boolean;
}

function addEvent(o: DispatchOrder, type: DispatchOrder["events"][number]["type"], detail: string): DispatchOrder["events"] {
  return [...o.events, { at: nowIso(), type, detail }];
}

function slotLabel(slots: SlotDef[], slotId: string | undefined): string {
  const s = slots.find((x) => x.id === slotId);
  return s ? `${s.label}（${s.time}）` : (slotId ?? "时段");
}

export interface HorseInput {
  id?: string;
  code: string;
  barnName?: string;
  hoofBehavior: HoofBehavior;
  behaviorNote: string;
  needPartner: boolean;
  kickCount: number;
  risk?: RiskLevel;
}

/** 新建或修改马匹档案；风险等级变化会让原已排安排失效并退回待排 */
export function saveHorse(input: HorseInput): ActionResult {
  const code = input.code.trim();
  if (!code) return { ok: false, reason: "马号不能为空" };
  if (input.kickCount < 0 || !Number.isInteger(input.kickCount)) {
    return { ok: false, reason: "踢人次数必须是不小于 0 的整数" };
  }

  const data = getState();
  const dup = data.horses.some((h) => h.code === code && h.id !== input.id);
  if (dup) return { ok: false, reason: `马号 ${code} 已存在` };

  const existing = input.id ? data.horses.find((h) => h.id === input.id) : undefined;
  if (input.id && !existing) return { ok: false, reason: "马匹档案不存在" };

  const risk: RiskLevel =
    input.risk ?? suggestRisk({
      kickCount: input.kickCount,
      needPartner: input.needPartner,
      hoofBehavior: input.hoofBehavior,
    });

  let invalidated = 0;

  setState((draft) => {
    let horses: Horse[];
    if (existing) {
      const riskChanged = existing.risk !== risk;
      horses = draft.horses.map((h) =>
        h.id === existing.id
          ? {
              ...h,
              code,
              barnName: input.barnName?.trim() || undefined,
              hoofBehavior: input.hoofBehavior,
              behaviorNote: input.behaviorNote.trim(),
              needPartner: input.needPartner,
              kickCount: input.kickCount,
              risk,
            }
          : h,
      );

      // 改动风险：原安排失效，退回待排
      if (riskChanged) {
        const victimIds = new Set(
          ordersToInvalidateOnRiskChange(draft.orders, existing.id).map((o) => o.id),
        );
        invalidated = victimIds.size;
        draft.orders = draft.orders.map((o) =>
          victimIds.has(o.id)
            ? {
                ...o,
                status: "pending",
                slotId: undefined,
                partnerName: undefined,
                events: addEvent(
                  o,
                  "invalidate",
                  `风险等级由${existing.risk === "high" ? "高风险" : "普通"}改为${risk === "high" ? "高风险" : "普通"}，原安排失效，重新待排`,
                ),
              }
            : o,
        );
      }
    } else {
      const horse: Horse = {
        id: uid("h"),
        code,
        barnName: input.barnName?.trim() || undefined,
        hoofBehavior: input.hoofBehavior,
        behaviorNote: input.behaviorNote.trim(),
        needPartner: input.needPartner,
        kickCount: input.kickCount,
        risk,
        coopStreak: 0,
        createdAt: nowIso(),
      };
      horses = [...draft.horses, horse];
    }
    return { ...draft, horses };
  });

  return { ok: true, invalidated };
}

/** 开派工单：同一匹马当天只留一张未完成派工单 */
export function createOrder(horseId: string, date: string, note: string): ActionResult {
  const data = getState();
  const horse = data.horses.find((h) => h.id === horseId);
  const check = checkCanCreate(data.orders, horse, date);
  if (!check.ok || !horse) return { ok: false, reason: check.reason };

  const order: DispatchOrder = {
    id: uid("o"),
    horseId,
    date,
    note: note.trim(),
    status: "pending",
    createdAt: nowIso(),
    events: [
      {
        at: nowIso(),
        type: "create",
        detail: `开派工单（${horse.code} · ${date}，待排）`,
      },
    ],
  };
  setState((draft) => ({ ...draft, orders: [...draft.orders, order] }));
  return { ok: true };
}

/** 排入时段：高风险马只能排双人时段 */
export function assignOrder(orderId: string, slotId: string, partnerName: string): ActionResult {
  const data = getState();
  const order = data.orders.find((o) => o.id === orderId);
  const horse = order ? data.horses.find((h) => h.id === order.horseId) : undefined;
  const slot = data.slots.find((s) => s.id === slotId);
  const dayOrders = order ? data.orders.filter((o) => o.date === order.date) : [];
  const check = checkCanAssign(order, horse, slot, dayOrders, partnerName);
  if (!check.ok || !order || !slot) return { ok: false, reason: check.reason };

  setState((draft) => ({
    ...draft,
    orders: draft.orders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: "scheduled",
            slotId: slot.id,
            partnerName: slot.kind === "double" ? partnerName.trim() : undefined,
            events: addEvent(
              o,
              "assign",
              slot.kind === "double"
                ? `安排到${slot.label}（${slot.time}），搭档：${partnerName.trim()}`
                : `安排到${slot.label}（${slot.time}）`,
            ),
          }
        : o,
    ),
  }));
  return { ok: true };
}

/** 取消派工：已排单退回待排，原安排失效 */
export function cancelAssignment(orderId: string): ActionResult {
  const data = getState();
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "派工单不存在" };
  if (order.status !== "scheduled") return { ok: false, reason: "只有已排派工单可以取消" };

  const label = slotLabel(data.slots, order.slotId);
  setState((draft) => ({
    ...draft,
    orders: draft.orders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: "pending",
            slotId: undefined,
            partnerName: undefined,
            events: addEvent(o, "cancel", `取消${label}的派工，重新待排`),
          }
        : o,
    ),
  }));
  return { ok: true };
}

/** 删除还未排时段的待排单（作废） */
export function deletePending(orderId: string): ActionResult {
  const order = getState().orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "派工单不存在" };
  if (order.status !== "pending") return { ok: false, reason: "只有待排派工单可以作废，已排单请先取消派工" };
  setState((draft) => ({ ...draft, orders: draft.orders.filter((o) => o.id !== orderId) }));
  return { ok: true };
}

export interface CompleteInput {
  score: number;
  kicked: boolean;
  resultNote: string;
}

/** 一次安全修蹄记一次配合；连续两次 4 分自动降为普通，踢人累加并回升高风险 */
export function completeOrder(orderId: string, input: CompleteInput): ActionResult {
  const data = getState();
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "派工单不存在" };
  if (order.status !== "scheduled") return { ok: false, reason: "只有已排派工单可以登记完成" };
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    return { ok: false, reason: "配合评分必须是 1–5 的整数" };
  }
  const horse = data.horses.find((h) => h.id === order.horseId);
  if (!horse) return { ok: false, reason: "马匹档案不存在" };

  const result = applyCooperation(horse, input.score, input.kicked);
  let newRisk: RiskLevel = horse.risk;
  if (result.downgraded) newRisk = "normal";
  else if (input.kicked && horse.risk === "normal") newRisk = "high";

  const riskChanged = newRisk !== horse.risk;
  let downgraded = result.downgraded;
  let invalidated = 0;

  setState((draft) => ({
    ...draft,
    horses: draft.horses.map((h) =>
      h.id === horse.id
        ? {
            ...h,
            kickCount: result.kickCount,
            coopStreak: result.coopStreak,
            risk: newRisk,
          }
        : h,
    ),
    orders: draft.orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          status: "done",
          completedAt: nowIso(),
          score: input.score,
          kicked: input.kicked,
          resultNote: input.resultNote.trim() || undefined,
          events: addEvent(
            o,
            "complete",
            `完成修蹄，配合评分 ${input.score} 分` +
              (input.kicked ? "，发生踢人" : "") +
              (downgraded ? "，连续两次达标，自动降为普通" : ""),
          ),
        };
      }
      // 风险变化（自动降级 / 踢人回升高风险）时，该马其他已排单一并失效
      if (riskChanged && o.horseId === horse.id && o.status === "scheduled") {
        invalidated += 1;
        return {
          ...o,
          status: "pending",
          slotId: undefined,
          partnerName: undefined,
          events: addEvent(
            o,
            "invalidate",
            downgraded
              ? "马匹自动降为普通风险，原安排失效，重新待排"
              : "马匹踢人回升为高风险，原安排失效，重新待排",
          ),
        };
      }
      return o;
    }),
  }));

  return { ok: true, downgraded, invalidated };
}

/** 保存时段设置（双人/单人、名称、时间、启停） */
export function saveSlots(slots: SlotDef[]): ActionResult {
  if (slots.some((s) => !s.label.trim() || !s.time.trim())) {
    return { ok: false, reason: "时段名称和时间不能为空" };
  }
  setState((draft) => {
    // 停用或删除双人时段时，占用该时段的已排单退回待排
    const slotMap = new Map(slots.map((s) => [s.id, s]));
    const orders = draft.orders.map((o) => {
      if (o.status !== "scheduled" || !o.slotId) return o;
      const s = slotMap.get(o.slotId);
      if (!s || !s.active) {
        return {
          ...o,
          status: "pending" as const,
          slotId: undefined,
          partnerName: undefined,
          events: addEvent(o, "invalidate", `时段停用，原安排失效，重新待排`),
        };
      }
      return o;
    });
    return { ...draft, slots: slots.map((s) => ({ ...s, label: s.label.trim(), time: s.time.trim() })), orders };
  });
  return { ok: true };
}
