import { useState } from "react";
import type { AppData, HoofBehavior, RiskLevel } from "../types";
import {
  HOOF_BEHAVIOR_LABEL,
  RISK_LABEL,
  completedCount,
  latestScore,
  riskReasons,
  streakProgress,
  suggestRisk,
} from "../domain/rules";
import { saveHorse } from "../domain/actions";
import { BehaviorTag, EmptyState, RiskBadge } from "./common";
import type { Horse } from "../types";

type Notify = (msg: string, type?: "ok" | "err") => void;

const BEHAVIORS: HoofBehavior[] = ["calm", "coax", "hold", "refuse"];

interface HorseFormState {
  id?: string;
  code: string;
  barnName: string;
  hoofBehavior: HoofBehavior;
  behaviorNote: string;
  needPartner: boolean;
  kickCount: number;
  riskOverride: boolean;
  risk: RiskLevel;
}

function blankForm(): HorseFormState {
  return {
    code: "",
    barnName: "",
    hoofBehavior: "calm",
    behaviorNote: "",
    needPartner: false,
    kickCount: 0,
    riskOverride: false,
    risk: "normal",
  };
}

function fromHorse(h: Horse): HorseFormState {
  const suggested = suggestRisk(h);
  return {
    id: h.id,
    code: h.code,
    barnName: h.barnName ?? "",
    hoofBehavior: h.hoofBehavior,
    behaviorNote: h.behaviorNote,
    needPartner: h.needPartner,
    kickCount: h.kickCount,
    riskOverride: h.risk !== suggested,
    risk: h.risk,
  };
}

function HorseFormModal({
  data,
  initial,
  onClose,
  notify,
}: {
  data: AppData;
  initial: HorseFormState;
  onClose: () => void;
  notify: Notify;
}) {
  const [form, setForm] = useState<HorseFormState>(initial);
  const isEdit = Boolean(form.id);
  const editing = isEdit ? data.horses.find((h) => h.id === form.id) : undefined;
  const autoRisk = suggestRisk({
    kickCount: form.kickCount,
    needPartner: form.needPartner,
    hoofBehavior: form.hoofBehavior,
  });
  const effectiveRisk: RiskLevel = form.riskOverride ? form.risk : autoRisk;
  const scheduledCount = editing
    ? data.orders.filter((o) => o.horseId === editing.id && o.status === "scheduled").length
    : 0;

  function patch(p: Partial<HorseFormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function submit() {
    const res = saveHorse({
      id: form.id,
      code: form.code,
      barnName: form.barnName,
      hoofBehavior: form.hoofBehavior,
      behaviorNote: form.behaviorNote,
      needPartner: form.needPartner,
      kickCount: form.kickCount,
      risk: effectiveRisk,
    });
    if (!res.ok) return notify(res.reason ?? "保存失败", "err");
    if ((res.invalidated ?? 0) > 0) {
      notify(`档案已保存，风险有改动，${res.invalidated} 张已排派工单失效并重新待排`, "ok");
    } else {
      notify("马匹档案已保存", "ok");
    }
    onClose();
  }

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit ? `编辑马匹 ${editing?.code ?? ""}` : "登记新马"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="field">
              <span>马号 *</span>
              <input value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="上门前唯一可见的马号，如 B-07" />
            </label>
            <label className="field">
              <span>马名</span>
              <input value={form.barnName} onChange={(e) => patch({ barnName: e.target.value })} placeholder="选填" />
            </label>

            <div className="field field-full">
              <span>抬蹄习惯 *</span>
              <div className="chip-row">
                {BEHAVIORS.map((b) => (
                  <button
                    type="button"
                    key={b}
                    className={`chip ${form.hoofBehavior === b ? "chip-on" : ""}`}
                    onClick={() => patch({ hoofBehavior: b })}
                  >
                    {HOOF_BEHAVIOR_LABEL[b]}
                  </button>
                ))}
              </div>
            </div>

            <label className="check-field field-full">
              <input
                type="checkbox"
                checked={form.needPartner}
                onChange={(e) => patch({ needPartner: e.target.checked })}
              />
              <span>需要搭档按住才能修蹄</span>
            </label>

            <label className="field">
              <span>累计踢人次数</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.kickCount}
                onChange={(e) => patch({ kickCount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </label>

            <div className="field field-full">
              <span>风险判定</span>
              <div className={`risk-box risk-box-${effectiveRisk}`}>
                <RiskBadge risk={effectiveRisk} />
                {effectiveRisk === "high" ? (
                  <span>高风险马只能排双人时段。原因：{riskReasons({
                    kickCount: form.kickCount,
                    needPartner: form.needPartner,
                    hoofBehavior: form.hoofBehavior,
                  }).join("、") || "人工标记"}
                  </span>
                ) : (
                  <span className="muted">当前特征可安排单人时段（双人时段也可以）。</span>
                )}
              </div>
              <label className="check-field inline-check">
                <input
                  type="checkbox"
                  checked={form.riskOverride}
                  onChange={(e) => patch({ riskOverride: e.target.checked, risk: e.target.checked ? autoRisk : "normal" })}
                />
                <span>人工指定风险等级（不按特征自动判断）</span>
              </label>
              {form.riskOverride && (
                <div className="chip-row">
                  {(["normal", "high"] as RiskLevel[]).map((r) => (
                    <button
                      type="button"
                      key={r}
                      className={`chip ${form.risk === r ? "chip-on" : ""}`}
                      onClick={() => patch({ risk: r })}
                    >
                      {RISK_LABEL[r]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="field field-full">
              <span>到厩观察备注</span>
              <textarea
                rows={3}
                value={form.behaviorNote}
                onChange={(e) => patch({ behaviorNote: e.target.value })}
                placeholder="蹄铁师上门后才知道的情况：哪只蹄敏感、怎么引导、上次谁按住的…"
              />
            </label>
          </div>

          {isEdit && editing && editing.risk !== effectiveRisk && scheduledCount > 0 && (
            <div className="notice notice-warn">
              保存后风险等级将从「{RISK_LABEL[editing.risk]}」改为「{RISK_LABEL[effectiveRisk]}」，
              该马 {scheduledCount} 张已排派工单会立即失效、退回待排，需要重新安排。
            </div>
          )}

          <div className="modal-actions">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={submit}>保存档案</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HorsesPage({ data, notify }: { data: AppData; notify: Notify }) {
  const [filter, setFilter] = useState<"all" | "high" | "normal">("all");
  const [editing, setEditing] = useState<HorseFormState | null>(null);

  const horses = data.horses.filter((h) => filter === "all" || h.risk === filter);
  const ordersOf = (id: string) => data.orders.filter((o) => o.horseId === id);

  return (
    <div className="page">
      <div className="page-toolbar">
        <div className="chip-row">
          {([
            ["all", "全部"],
            ["high", "高风险"],
            ["normal", "普通"],
          ] as const).map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? "chip-on" : ""}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(blankForm())}>+ 登记新马</button>
      </div>

      {horses.length === 0 ? (
        <EmptyState text="还没有马匹档案，先登记一匹马" />
      ) : (
        <div className="horse-grid">
          {horses.map((h) => {
            const orders = ordersOf(h.id);
            const last = latestScore(orders);
            const progress = streakProgress(h);
            return (
              <article key={h.id} className={`horse-card horse-card-${h.risk}`}>
                <header className="horse-head">
                  <div>
                    <h4>{h.code}</h4>
                    {h.barnName && <span className="muted">{h.barnName}</span>}
                  </div>
                  <RiskBadge risk={h.risk} />
                </header>

                <div className="horse-tags">
                  <BehaviorTag behavior={h.hoofBehavior} />
                  {h.needPartner && <span className="tag tag-warn">需搭档按住</span>}
                </div>

                {h.behaviorNote && <p className="horse-note">{h.behaviorNote}</p>}

                <div className="horse-metrics">
                  <div>
                    <strong className={h.kickCount > 0 ? "score-low" : ""}>{h.kickCount}</strong>
                    <span>踢人次数</span>
                  </div>
                  <div>
                    <strong>{completedCount(orders)}</strong>
                    <span>配合记录</span>
                  </div>
                  <div>
                    <strong>{last ?? "—"}</strong>
                    <span>最近评分</span>
                  </div>
                </div>

                {h.risk === "high" && (
                  <div className="streak-bar">
                    <div className="streak-track">
                      <div className="streak-fill" style={{ width: `${(progress.current / progress.needed) * 100}%` }} />
                    </div>
                    <span>连续达标 {progress.current}/{progress.needed}，再 {progress.needed - progress.current} 次 4 分以上自动降级</span>
                  </div>
                )}

                <button className="btn btn-sm btn-block" onClick={() => setEditing(fromHorse(h))}>编辑档案 / 风险</button>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <HorseFormModal data={data} initial={editing} onClose={() => setEditing(null)} notify={notify} />
      )}
    </div>
  );
}
