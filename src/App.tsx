// 页面层：只负责渲染与交互，规则判断走 rules.ts，存取走 store.ts。

import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { loadState, saveState, todayStr, uid } from "./store";
import type { BoardState, DispatchOrder, Horse, RiskLevel } from "./store";
import {
  HABIT_OPTIONS,
  PASS_SCORE,
  PASS_STREAK,
  TIME_SLOTS,
  applyCooperationScore,
  averageScore,
  findUnfinishedOrder,
  invalidateOrder,
  lastScore,
  needsTwoPerson,
  riskLabel,
  statusLabel,
  suggestRisk,
  validateSchedule,
} from "./rules";

type Toast = { kind: "ok" | "err"; text: string };

const SCORE_OPTIONS = [
  { value: 1, label: "1 分 · 激烈抗拒" },
  { value: 2, label: "2 分 · 多次踢蹬" },
  { value: 3, label: "3 分 · 基本可控" },
  { value: 4, label: "4 分 · 配合良好" },
  { value: 5, label: "5 分 · 全程顺利" },
];

function App() {
  const [state, setState] = useState<BoardState>(loadState);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => saveState(state), [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const today = todayStr();
  const horseById = useMemo(
    () => new Map(state.horses.map((h) => [h.id, h])),
    [state.horses]
  );

  const notify = (kind: Toast["kind"], text: string) => setToast({ kind, text });

  // ---- 页面动作：组合判断层规则，再写回记录层 ----

  const addHorse = (input: { code: string; habit: string; kickCount: number; risk: RiskLevel }) => {
    const code = input.code.trim();
    if (!code) return notify("err", "请填写马号");
    if (state.horses.some((h) => h.code === code)) {
      return notify("err", `马号「${code}」已登记`);
    }
    const horse: Horse = {
      id: uid("h"),
      code,
      habit: input.habit,
      kickCount: Math.max(0, input.kickCount),
      risk: input.risk,
      scores: [],
      passStreak: 0,
      createdAt: new Date().toISOString(),
    };
    setState({ ...state, horses: [...state.horses, horse] });
    notify("ok", `已登记「${code}」，风险等级：${riskLabel(horse.risk)}`);
  };

  const toggleRisk = (horse: Horse) => {
    const next: RiskLevel = horse.risk === "high" ? "normal" : "high";
    let voided = 0;
    const orders = state.orders.map((o) => {
      if (o.horseId !== horse.id || o.status !== "scheduled") return o;
      voided += 1;
      return invalidateOrder(o, "风险等级调整");
    });
    setState({
      horses: state.horses.map((h) =>
        h.id === horse.id ? { ...h, risk: next, passStreak: 0 } : h
      ),
      orders,
    });
    notify(
      "ok",
      voided > 0
        ? `「${horse.code}」已调整为${riskLabel(next)}，${voided} 张原安排失效并重新待排`
        : `「${horse.code}」已调整为${riskLabel(next)}`
    );
  };

  const createOrder = (input: { horseId: string; date: string; note: string }) => {
    const horse = horseById.get(input.horseId);
    if (!horse) return notify("err", "请选择马匹");
    if (!input.date) return notify("err", "请选择派工日期");
    const dup = findUnfinishedOrder(state.orders, horse.id, input.date);
    if (dup) {
      return notify("err", `「${horse.code}」${input.date} 已有一张未完成派工单，当天只留一张`);
    }
    const order: DispatchOrder = {
      id: uid("o"),
      horseId: horse.id,
      date: input.date,
      note: input.note.trim(),
      status: "pending",
      slot: null,
      crew: null,
      score: null,
      kicks: 0,
      voids: [],
      createdAt: new Date().toISOString(),
      doneAt: null,
    };
    setState({ ...state, orders: [...state.orders, order] });
    notify("ok", `已为「${horse.code}」开立 ${input.date} 派工单，等待排班`);
  };

  const scheduleOrder = (orderId: string, slot: string, crew: number) => {
    const order = state.orders.find((o) => o.id === orderId);
    const horse = order ? horseById.get(order.horseId) : undefined;
    if (!order || !horse) return;
    const error = validateSchedule(horse, slot, crew);
    if (error) return notify("err", error);
    setState({
      ...state,
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status: "scheduled", slot, crew: crew as 1 | 2 } : o
      ),
    });
    notify("ok", `「${horse.code}」已排 ${order.date} ${slot}（${crew === 2 ? "双人" : "单人"}）`);
  };

  const cancelDispatch = (orderId: string) => {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return;
    const horse = horseById.get(order.horseId);
    setState({
      ...state,
      orders: state.orders.map((o) => (o.id === orderId ? invalidateOrder(o, "取消派工") : o)),
    });
    notify("ok", `「${horse?.code ?? ""}」原安排已失效，工单重新待排`);
  };

  const completeOrder = (orderId: string, score: number, kicks: number) => {
    const order = state.orders.find((o) => o.id === orderId);
    const horse = order ? horseById.get(order.horseId) : undefined;
    if (!order || !horse) return;
    if (!(score >= 1 && score <= 5)) return notify("err", "请录入 1-5 的配合评分");
    const safeKicks = Math.max(0, kicks);
    const { horse: scored, downgraded } = applyCooperationScore(horse, score);
    setState({
      horses: state.horses.map((h) =>
        h.id === horse.id ? { ...scored, kickCount: scored.kickCount + safeKicks } : h
      ),
      orders: state.orders.map((o) =>
        o.id === orderId
          ? { ...o, status: "done", score, kicks: safeKicks, doneAt: new Date().toISOString() }
          : o
      ),
    });
    notify(
      "ok",
      downgraded
        ? `已记一次配合（${score} 分）：「${horse.code}」连续 ${PASS_STREAK} 次达 ${PASS_SCORE} 分，自动降为普通`
        : `已记一次配合（${score} 分），「${horse.code}」本次修蹄完成`
    );
  };

  // ---- 汇总指标 ----
  const highRiskCount = state.horses.filter((h) => h.risk === "high").length;
  const pendingOrders = state.orders
    .filter((o) => o.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const scheduledOrders = state.orders
    .filter((o) => o.status === "scheduled")
    .sort((a, b) => `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`));
  const doneOrders = state.orders
    .filter((o) => o.status === "done")
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""))
    .slice(0, 8);
  const todayScheduled = state.orders.filter(
    (o) => o.status === "scheduled" && o.date === today
  ).length;
  const todayDone = state.orders.filter((o) => o.status === "done" && o.date === today).length;

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62011 · 蹄铁师安全派工</p>
        <h1>安全派工台</h1>
        <span>
          登记每匹马的抬蹄习惯、踢人次数与配合评分；高风险马只能排双人时段，同一匹马当天只留一张未完成派工单；
          每完成一次安全修蹄记一次配合，连续两次达 {PASS_SCORE} 分自动降为普通；
          改动风险或取消派工，原安排立即失效并重新待排。数据保存在本机浏览器。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>高风险马</small>
          <strong>{highRiskCount}</strong>
        </article>
        <article>
          <small>待排工单</small>
          <strong>{pendingOrders.length}</strong>
        </article>
        <article>
          <small>今日已排</small>
          <strong>{todayScheduled}</strong>
        </article>
        <article>
          <small>今日完成</small>
          <strong>{todayDone}</strong>
        </article>
      </section>

      <div className="board">
        <section className="workspace">
          <HorseForm onAdd={addHorse} />
          <OrderForm horses={state.horses} defaultDate={today} onCreate={createOrder} />
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>马匹档案</p>
              <h2>抬蹄习惯与风险</h2>
            </div>
          </div>
          {state.horses.length === 0 ? (
            <div className="empty">还没有马匹档案，先在上方登记</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>马号</th>
                    <th>抬蹄习惯</th>
                    <th>踢人次数</th>
                    <th>配合评分</th>
                    <th>连续达标</th>
                    <th>风险</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {state.horses.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <b>{h.code}</b>
                      </td>
                      <td>{h.habit}</td>
                      <td>{h.kickCount} 次</td>
                      <td>
                        最近 {lastScore(h)} · 平均 {averageScore(h)} · 共 {h.scores.length} 次
                      </td>
                      <td>
                        {h.risk === "high" ? `${h.passStreak}/${PASS_STREAK}` : "—"}
                      </td>
                      <td>
                        <span className={`badge ${h.risk}`}>{riskLabel(h.risk)}</span>
                      </td>
                      <td>
                        <button onClick={() => toggleRisk(h)}>
                          {h.risk === "high" ? "降为普通" : "调为高风险"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="two-col">
          <section className="panel">
            <div className="heading">
              <div>
                <p>待排工单</p>
                <h2>选择时段与人手</h2>
              </div>
            </div>
            {pendingOrders.length === 0 ? (
              <div className="empty">没有待排工单</div>
            ) : (
              <div className="order-list">
                {pendingOrders.map((o) => {
                  const horse = horseById.get(o.horseId);
                  if (!horse) return null;
                  return (
                    <PendingCard
                      key={`${o.id}-${horse.risk}`}
                      order={o}
                      horse={horse}
                      onSchedule={scheduleOrder}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="heading">
              <div>
                <p>已排工单</p>
                <h2>上门修蹄</h2>
              </div>
            </div>
            {scheduledOrders.length === 0 ? (
              <div className="empty">没有已排工单</div>
            ) : (
              <div className="order-list">
                {scheduledOrders.map((o) => {
                  const horse = horseById.get(o.horseId);
                  if (!horse) return null;
                  return (
                    <ScheduledCard
                      key={o.id}
                      order={o}
                      horse={horse}
                      onCancel={cancelDispatch}
                      onComplete={completeOrder}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="panel">
          <div className="heading">
            <div>
              <p>完成记录</p>
              <h2>安全修蹄与配合评分</h2>
            </div>
          </div>
          {doneOrders.length === 0 ? (
            <div className="empty">还没有完成记录</div>
          ) : (
            <div className="order-list">
              {doneOrders.map((o) => {
                const horse = horseById.get(o.horseId);
                return (
                  <article key={o.id} className="order-card">
                    <div className="meta">
                      <b>{horse?.code ?? "已删除马匹"}</b>
                      <span className="badge done">{statusLabel(o.status)}</span>
                      <span className="muted">
                        {o.date} {o.slot} · {o.crew === 2 ? "双人" : "单人"}
                      </span>
                    </div>
                    <p className="muted">
                      配合评分 {o.score} 分 · 本次踢人 {o.kicks} 次{o.note ? ` · ${o.note}` : ""}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </main>
  );
}

function HorseForm({
  onAdd,
}: {
  onAdd: (input: { code: string; habit: string; kickCount: number; risk: RiskLevel }) => void;
}) {
  const [code, setCode] = useState("");
  const [habit, setHabit] = useState(HABIT_OPTIONS[0]);
  const [kicks, setKicks] = useState(0);
  const [risk, setRisk] = useState<RiskLevel>("normal");
  const [riskTouched, setRiskTouched] = useState(false);

  const suggested = suggestRisk(kicks);

  const submit = () => {
    onAdd({ code, habit, kickCount: kicks, risk });
    setCode("");
    setKicks(0);
    setRisk("normal");
    setRiskTouched(false);
  };

  return (
    <aside className="panel">
      <h2>登记马匹</h2>
      <div className="form-stack">
        <label>
          <span>马号</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 M-032" />
        </label>
        <label>
          <span>抬蹄习惯</span>
          <select value={habit} onChange={(e) => setHabit(e.target.value)}>
            {HABIT_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>累计踢人次数</span>
          <input
            type="number"
            min={0}
            value={kicks}
            onChange={(e) => {
              const n = Math.max(0, Number(e.target.value) || 0);
              setKicks(n);
              if (!riskTouched) setRisk(suggestRisk(n));
            }}
          />
        </label>
        <label>
          <span>风险等级（按踢人次数建议：{riskLabel(suggested)}）</span>
          <select
            value={risk}
            onChange={(e) => {
              setRisk(e.target.value as RiskLevel);
              setRiskTouched(true);
            }}
          >
            <option value="normal">普通</option>
            <option value="high">高风险</option>
          </select>
        </label>
        <button className="primary" onClick={submit}>
          登记入库
        </button>
      </div>
    </aside>
  );
}

function OrderForm({
  horses,
  defaultDate,
  onCreate,
}: {
  horses: Horse[];
  defaultDate: string;
  onCreate: (input: { horseId: string; date: string; note: string }) => void;
}) {
  const [horseId, setHorseId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState("");

  const submit = () => {
    onCreate({ horseId, date, note });
    setNote("");
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>新建派工单</p>
          <h2>当天只留一张未完成单</h2>
        </div>
      </div>
      {horses.length === 0 ? (
        <div className="empty">先登记马匹，再开立派工单</div>
      ) : (
        <div className="form-stack">
          <label>
            <span>马匹</span>
            <select value={horseId} onChange={(e) => setHorseId(e.target.value)}>
              <option value="">请选择马匹</option>
              {horses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.code} · {riskLabel(h.risk)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>派工日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>备注（客户反映、修蹄内容）</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：左前蹄换铁，客户称近期爱踢"
            />
          </label>
          <button className="primary" onClick={submit}>
            开立派工单
          </button>
        </div>
      )}
    </section>
  );
}

function PendingCard({
  order,
  horse,
  onSchedule,
}: {
  order: DispatchOrder;
  horse: Horse;
  onSchedule: (orderId: string, slot: string, crew: number) => void;
}) {
  const [slot, setSlot] = useState(TIME_SLOTS[0]);
  const [crew, setCrew] = useState(needsTwoPerson(horse) ? 2 : 1);
  const lastVoid = order.voids[order.voids.length - 1];

  return (
    <article className="order-card">
      <div className="meta">
        <b>{horse.code}</b>
        <span className={`badge ${horse.risk}`}>{riskLabel(horse.risk)}</span>
        <span className="badge pending">{statusLabel(order.status)}</span>
        <span className="muted">{order.date}</span>
      </div>
      {order.note && <p className="muted">{order.note}</p>}
      {lastVoid && (
        <p className="muted">
          原安排已失效（{lastVoid.reason}：{lastVoid.slot} ·{" "}
          {lastVoid.crew === 2 ? "双人" : "单人"}），重新待排
        </p>
      )}
      <div className="inline-controls">
        <label>
          <span>时段</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>人手{needsTwoPerson(horse) ? "（高风险须双人）" : ""}</span>
          <select value={crew} onChange={(e) => setCrew(Number(e.target.value))}>
            <option value={1}>单人</option>
            <option value={2}>双人</option>
          </select>
        </label>
        <button className="primary" onClick={() => onSchedule(order.id, slot, crew)}>
          派工
        </button>
      </div>
    </article>
  );
}

function ScheduledCard({
  order,
  horse,
  onCancel,
  onComplete,
}: {
  order: DispatchOrder;
  horse: Horse;
  onCancel: (orderId: string) => void;
  onComplete: (orderId: string, score: number, kicks: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(4);
  const [kicks, setKicks] = useState(0);

  return (
    <article className="order-card">
      <div className="meta">
        <b>{horse.code}</b>
        <span className={`badge ${horse.risk}`}>{riskLabel(horse.risk)}</span>
        <span className="badge scheduled">{statusLabel(order.status)}</span>
        <span className="muted">
          {order.date} {order.slot} · {order.crew === 2 ? "双人" : "单人"}
        </span>
      </div>
      {order.note && <p className="muted">{order.note}</p>}
      {open ? (
        <div className="inline-controls">
          <label>
            <span>本次配合评分</span>
            <select value={score} onChange={(e) => setScore(Number(e.target.value))}>
              {SCORE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>本次踢人次数</span>
            <input
              type="number"
              min={0}
              value={kicks}
              onChange={(e) => setKicks(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <button
            className="primary"
            onClick={() => {
              onComplete(order.id, score, kicks);
              setOpen(false);
            }}
          >
            确认完成
          </button>
          <button onClick={() => setOpen(false)}>收起</button>
        </div>
      ) : (
        <div className="inline-controls">
          <button className="primary" onClick={() => setOpen(true)}>
            完成修蹄
          </button>
          <button className="danger" onClick={() => onCancel(order.id)}>
            取消派工
          </button>
        </div>
      )}
    </article>
  );
}

export default App;
