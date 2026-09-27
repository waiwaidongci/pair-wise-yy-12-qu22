import { useMemo, useState } from "react";
import type { AppData, DispatchOrder, SlotDef } from "../types";
import {
  HOOF_BEHAVIOR_LABEL,
  canCancelAssignment,
  canComplete,
  canDeletePending,
  streakProgress,
} from "../domain/rules";
import {
  assignOrder,
  cancelAssignment,
  completeOrder,
  createOrder,
  deletePending,
} from "../domain/actions";
import { todayStr } from "../data/seed";
import { EmptyState, Modal, RiskBadge, ScorePicker, SlotBadge } from "./common";

type Notify = (msg: string, type?: "ok" | "err") => void;

function HorseLine({ data, horseId }: { data: AppData; horseId: string }) {
  const h = data.horses.find((x) => x.id === horseId);
  if (!h) return <span className="muted">马匹已删除</span>;
  return (
    <span className="horse-line">
      <b>{h.code}</b>
      {h.barnName ? <span className="muted">（{h.barnName}）</span> : null}
      <RiskBadge risk={h.risk} />
    </span>
  );
}

function AssignModal({
  data,
  date,
  orderId,
  slotId,
  onClose,
  notify,
}: {
  data: AppData;
  date: string;
  orderId?: string;
  slotId?: string;
  onClose: () => void;
  notify: Notify;
}) {
  const pendingOrders = data.orders.filter((o) => o.date === date && o.status === "pending");
  const [orderChoice, setOrderChoice] = useState(orderId ?? pendingOrders[0]?.id ?? "");
  const [slotChoice, setSlotChoice] = useState(slotId ?? "");
  const [partner, setPartner] = useState("");

  const order = data.orders.find((o) => o.id === orderChoice);
  const horse = order ? data.horses.find((h) => h.id === order.horseId) : undefined;
  const dayOrders = data.orders.filter((o) => o.date === date);
  const selectableSlots = data.slots.filter((s) => s.active);

  function submit() {
    if (!orderChoice) return notify("请选择待排派工单", "err");
    if (!slotChoice) return notify("请选择时段", "err");
    const res = assignOrder(orderChoice, slotChoice, partner);
    if (!res.ok) return notify(res.reason ?? "安排失败", "err");
    notify("已安排时段");
    onClose();
  }

  return (
    <Modal title="安排派工时段" onClose={onClose}>
      <div className="form-stack">
        <label className="field">
          <span>待排派工单{orderId ? "" : "（当天）"}</span>
          {orderId ? (
            <div className="readonly-box">
              <HorseLine data={data} horseId={order?.horseId ?? ""} />
            </div>
          ) : (
            <select value={orderChoice} onChange={(e) => setOrderChoice(e.target.value)}>
              <option value="">请选择…</option>
              {pendingOrders.map((o) => {
                const h = data.horses.find((x) => x.id === o.horseId);
                return (
                  <option key={o.id} value={o.id}>
                    {h?.code ?? "?"} · {o.note || "修蹄"}
                  </option>
                );
              })}
            </select>
          )}
        </label>

        {horse && horse.risk === "high" && (
          <div className="notice notice-warn">
            高风险马：只能选择双人时段，并填写搭档。
            {streakProgress(horse).current > 0 && (
              <span>
                {" "}
                已连续达标 {streakProgress(horse).current}/{streakProgress(horse).needed} 次。
              </span>
            )}
          </div>
        )}

        <div className="field">
          <span>时段</span>
          <div className="slot-choice">
            {selectableSlots.map((s) => {
              const occupied = dayOrders.some((o) => o.status === "scheduled" && o.slotId === s.id);
              const disabledByRisk = horse?.risk === "high" && s.kind !== "double";
              const disabled = occupied || disabledByRisk;
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`slot-opt ${slotChoice === s.id ? "slot-opt-on" : ""} ${disabled ? "slot-opt-off" : ""}`}
                  disabled={disabled}
                  onClick={() => setSlotChoice(s.id)}
                  title={occupied ? "该时段已占用" : disabledByRisk ? "高风险马不能排单人时段" : ""}
                >
                  <b>{s.label}</b>
                  <span className="muted">{s.time}</span>
                  <SlotBadge kind={s.kind} />
                  {occupied && <span className="muted">已占用</span>}
                </button>
              );
            })}
          </div>
        </div>

        {(() => {
          const s = data.slots.find((x) => x.id === slotChoice);
          if (s?.kind !== "double") return null;
          return (
            <label className="field">
              <span>搭档姓名 *</span>
              <input
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                placeholder="双人时段必须有搭档在场按住"
              />
            </label>
          );
        })()}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>确认安排</button>
        </div>
      </div>
    </Modal>
  );
}

function CompleteModal({
  data,
  orderId,
  onClose,
  notify,
}: {
  data: AppData;
  orderId: string;
  onClose: () => void;
  notify: Notify;
}) {
  const order = data.orders.find((o) => o.id === orderId);
  const horse = order ? data.horses.find((h) => h.id === order.horseId) : undefined;
  const [score, setScore] = useState<number | null>(null);
  const [kicked, setKicked] = useState(false);
  const [resultNote, setResultNote] = useState("");

  if (!order || !horse) return null;

  function submit() {
    if (score === null) return notify("请给出本次配合评分（1–5）", "err");
    const res = completeOrder(orderId, { score, kicked, resultNote });
    if (!res.ok) return notify(res.reason ?? "登记失败", "err");
    if (res.downgraded) notify("已连续两次达到 4 分，该马自动降为普通风险", "ok");
    else if (kicked) notify("已记录踢人，累计次数 +1；普通马将回升高风险", "err");
    else notify("配合记录已保存", "ok");
    onClose();
  }

  return (
    <Modal title="登记本次安全修蹄" onClose={onClose}>
      <div className="form-stack">
        <div className="readonly-box">
          <HorseLine data={data} horseId={horse.id} />
          <span className="muted">
            {HOOF_BEHAVIOR_LABEL[horse.hoofBehavior]} · 累计踢人 {horse.kickCount} 次
          </span>
        </div>

        <label className="field">
          <span>本次配合评分</span>
          <ScorePicker value={score} onChange={setScore} />
        </label>

        <label className="check-field">
          <input type="checkbox" checked={kicked} onChange={(e) => setKicked(e.target.checked)} />
          <span>本次修蹄过程中发生踢人（累计踢人次数 +1，连续配合计数清零）</span>
        </label>

        <label className="field">
          <span>现场备注</span>
          <textarea
            rows={3}
            value={resultNote}
            onChange={(e) => setResultNote(e.target.value)}
            placeholder="如：左后蹄依旧敏感，搭档按住后顺利完成"
          />
        </label>

        {horse.risk === "high" && (
          <div className="notice notice-info">
            高风险马连续两次评分 ≥ 4 将自动降为普通（当前 {horse.coopStreak}/2）。
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>保存配合记录</button>
        </div>
      </div>
    </Modal>
  );
}

function NewOrderModal({
  data,
  date,
  onClose,
  notify,
}: {
  data: AppData;
  date: string;
  onClose: () => void;
  notify: Notify;
}) {
  const [horseId, setHorseId] = useState("");
  const [note, setNote] = useState("");
  const horse = data.horses.find((h) => h.id === horseId);

  function submit() {
    if (!horseId) return notify("请选择马匹", "err");
    const res = createOrder(horseId, date, note);
    if (!res.ok) return notify(res.reason ?? "开单失败", "err");
    notify("派工单已创建（待排）");
    onClose();
  }

  return (
    <Modal title="新开派工单" onClose={onClose}>
      <div className="form-stack">
        <div className="readonly-box">派工日期：{date}</div>
        <label className="field">
          <span>马匹 *</span>
          <select value={horseId} onChange={(e) => setHorseId(e.target.value)}>
            <option value="">请选择马号…</option>
            {data.horses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.code}
                {h.barnName ? `（${h.barnName}）` : ""}
                {h.risk === "high" ? " · 高风险" : ""}
              </option>
            ))}
          </select>
        </label>
        {horse && (
          <div className={`notice ${horse.risk === "high" ? "notice-warn" : "notice-info"}`}>
            <div><RiskBadge risk={horse.risk} /> 抬蹄习惯：{HOOF_BEHAVIOR_LABEL[horse.hoofBehavior]}
              {horse.needPartner ? " · 需搭档按住" : ""}
            </div>
            <div className="muted">累计踢人 {horse.kickCount} 次{horse.behaviorNote ? ` · ${horse.behaviorNote}` : ""}</div>
          </div>
        )}
        <label className="field">
          <span>修蹄要求</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：换新蹄铁 / 检查后蹄裂纹" />
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>开单</button>
        </div>
      </div>
    </Modal>
  );
}

function SlotCard({
  slot,
  order,
  data,
  date,
  onAssign,
  onComplete,
  onCancel,
  notify,
}: {
  slot: SlotDef;
  order?: DispatchOrder;
  data: AppData;
  date: string;
  onAssign: (slotId?: string, orderId?: string) => void;
  onComplete: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  notify: Notify;
}) {
  const horse = order ? data.horses.find((h) => h.id === order.horseId) : undefined;
  return (
    <article className={`slot-card ${!slot.active ? "slot-card-off" : ""}`}>
      <header className="slot-head">
        <div>
          <h4>{slot.label}</h4>
          <span className="muted">{slot.time}</span>
        </div>
        <SlotBadge kind={slot.kind} />
      </header>

      {!slot.active ? (
        <EmptyState text="该时段已停用" />
      ) : order && horse ? (
        <div className={`slot-order ${horse.risk === "high" ? "slot-order-high" : ""}`}>
          <HorseLine data={data} horseId={horse.id} />
          <p className="order-note">{order.note || "常规修蹄"}</p>
          {order.partnerName && <p className="partner-line">搭档：{order.partnerName}</p>}
          <div className="row-actions">
            {canComplete(order) && (
              <button className="btn btn-primary btn-sm" onClick={() => onComplete(order.id)}>
                登记完成
              </button>
            )}
            {canCancelAssignment(order) && (
              <button className="btn btn-sm" onClick={() => onCancel(order.id)}>
                取消派工
              </button>
            )}
          </div>
        </div>
      ) : (
        <button className="slot-empty" onClick={() => onAssign(slot.id)}>
          + 安排待排单
        </button>
      )}
    </article>
  );
}

export default function BoardPage({
  data,
  notify,
}: {
  data: AppData;
  notify: Notify;
}) {
  const [date, setDate] = useState(todayStr());
  const [assignState, setAssignState] = useState<{ slotId?: string; orderId?: string } | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const dayOrders = useMemo(() => data.orders.filter((o) => o.date === date), [data.orders, date]);
  const scheduled = dayOrders.filter((o) => o.status === "scheduled");
  const pending = dayOrders.filter((o) => o.status === "pending");
  const done = dayOrders.filter((o) => o.status === "done");
  const highPending = pending.filter((o) => data.horses.find((h) => h.id === o.horseId)?.risk === "high");

  function handleCancel(orderId: string) {
    if (!window.confirm("取消派工后原安排失效，该单退回待排。确认取消？")) return;
    const res = cancelAssignment(orderId);
    notify(res.ok ? "已取消派工，重新待排" : res.reason ?? "取消失败", res.ok ? "ok" : "err");
  }

  function handleDelete(orderId: string) {
    if (!window.confirm("确认作废这张待排派工单？")) return;
    const res = deletePending(orderId);
    notify(res.ok ? "派工单已作废" : res.reason ?? "操作失败", res.ok ? "ok" : "err");
  }

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="date-pick">
          <label>派工日期</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}>+ 新开派工单</button>
      </div>

      <div className="stat-row">
        <div className="stat"><strong>{scheduled.length}</strong><span>已排时段</span></div>
        <div className={`stat ${highPending.length ? "stat-alert" : ""}`}>
          <strong>{pending.length}</strong><span>待排{highPending.length ? `（高风险 ${highPending.length}）` : ""}</span>
        </div>
        <div className="stat"><strong>{done.length}</strong><span>当日已完成</span></div>
      </div>

      <section className="block">
        <h3>双人 / 单人时段</h3>
        <div className="slot-grid">
          {data.slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              date={date}
              order={scheduled.find((o) => o.slotId === slot.id)}
              data={data}
              onAssign={(slotId, orderId) => setAssignState({ slotId, orderId })}
              onComplete={setCompleteId}
              onCancel={handleCancel}
              notify={notify}
            />
          ))}
        </div>
      </section>

      <section className="block">
        <h3>待排派工单 <span className="muted">（{pending.length}）</span></h3>
        {pending.length === 0 ? (
          <EmptyState text="当天没有待排派工单" />
        ) : (
          <div className="order-list">
            {pending.map((o) => {
              const h = data.horses.find((x) => x.id === o.horseId);
              return (
                <article key={o.id} className={`order-row ${h?.risk === "high" ? "order-row-high" : ""}`}>
                  <div className="order-main">
                    <HorseLine data={data} horseId={o.horseId} />
                    <p className="order-note">{o.note || "常规修蹄"}</p>
                    {h?.risk === "high" && (
                      <p className="hint-warn">高风险马 · 只能安排双人时段
                        {h.coopStreak > 0 && ` · 已连续达标 ${h.coopStreak}/2`}
                      </p>
                    )}
                    {o.events.some((e) => e.type === "invalidate" || e.type === "cancel") && (
                      <p className="hint-muted">原安排已失效，等待重新排期</p>
                    )}
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => setAssignState({ orderId: o.id })}>
                      排入时段
                    </button>
                    {canDeletePending(o) && (
                      <button className="btn btn-sm" onClick={() => handleDelete(o.id)}>作废</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="block">
        <h3>当日完成记录 <span className="muted">（{done.length}）</span></h3>
        {done.length === 0 ? (
          <EmptyState text="还没有完成的修蹄" />
        ) : (
          <div className="order-list">
            {done.map((o) => {
              const h = data.horses.find((x) => x.id === o.horseId);
              return (
                <article key={o.id} className="order-row order-row-done">
                  <div className="order-main">
                    <HorseLine data={data} horseId={o.horseId} />
                    <p className="order-note">
                      评分 <b className={o.score && o.score >= 4 ? "score-good" : "score-low"}>{o.score}</b> / 5
                      {o.kicked && <span className="kick-flag">发生踢人</span>}
                    </p>
                    {o.resultNote && <p className="muted small">{o.resultNote}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {assignState && (
        <AssignModal
          data={data}
          date={date}
          orderId={assignState.orderId}
          slotId={assignState.slotId}
          onClose={() => setAssignState(null)}
          notify={notify}
        />
      )}
      {completeId && (
        <CompleteModal data={data} orderId={completeId} onClose={() => setCompleteId(null)} notify={notify} />
      )}
      {newOpen && <NewOrderModal data={data} date={date} onClose={() => setNewOpen(false)} notify={notify} />}
    </div>
  );
}
