// 共享数据模型：马匹档案、派工单、时段定义

/** 抬蹄习惯 */
export type HoofBehavior = "calm" | "coax" | "hold" | "refuse";

/** 风险等级：高风险马只能排双人时段 */
export type RiskLevel = "normal" | "high";

/** 时段类型 */
export type SlotKind = "single" | "double";

/** 派工单状态：待排 → 已排（已安排时段）→ 已完成 */
export type OrderStatus = "pending" | "scheduled" | "done";

export interface Horse {
  id: string;
  /** 马号，唯一 */
  code: string;
  /** 马名（选填） */
  barnName?: string;
  hoofBehavior: HoofBehavior;
  /** 抬蹄表现备注，如“左后蹄敏感” */
  behaviorNote: string;
  /** 是否需要搭档按住才能修蹄 */
  needPartner: boolean;
  /** 历史踢人次数（完成修蹄时勾选踢人会自动累加） */
  kickCount: number;
  risk: RiskLevel;
  /** 连续配合达标（评分≥4）次数，高风险马达到 2 次自动降为普通 */
  coopStreak: number;
  createdAt: string;
}

export interface SlotDef {
  id: string;
  kind: SlotKind;
  /** 时段名称，如“上午双人时段” */
  label: string;
  /** 时间，如“10:30–12:00” */
  time: string;
  active: boolean;
}

export interface OrderEvent {
  at: string;
  type: "create" | "assign" | "cancel" | "complete" | "invalidate";
  detail: string;
}

export interface DispatchOrder {
  id: string;
  horseId: string;
  /** 派工日期 YYYY-MM-DD */
  date: string;
  /** 修蹄要求备注 */
  note: string;
  status: OrderStatus;
  slotId?: string;
  /** 双人时段的搭档姓名 */
  partnerName?: string;
  createdAt: string;
  completedAt?: string;
  /** 本次配合评分 1–5 */
  score?: number;
  /** 本次修蹄是否发生踢人 */
  kicked?: boolean;
  resultNote?: string;
  events: OrderEvent[];
}

export interface AppData {
  schemaVersion: 1;
  horses: Horse[];
  orders: DispatchOrder[];
  slots: SlotDef[];
}
