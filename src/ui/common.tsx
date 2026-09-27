import { useEffect } from "react";
import type { RiskLevel, SlotKind } from "../types";
import { HOOF_BEHAVIOR_LABEL, RISK_LABEL } from "../domain/rules";
import type { HoofBehavior } from "../types";

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`badge badge-${risk}`}>{RISK_LABEL[risk]}</span>;
}

export function SlotBadge({ kind }: { kind: SlotKind }) {
  return (
    <span className={`badge badge-slot-${kind}`}>
      {kind === "double" ? "双人时段" : "单人时段"}
    </span>
  );
}

export function BehaviorTag({ behavior }: { behavior: HoofBehavior }) {
  return <span className="tag">{HOOF_BEHAVIOR_LABEL[behavior]}</span>;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ScorePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="score-picker">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`score-btn ${value === n ? "score-btn-on" : ""} ${value !== null && n >= 4 ? "score-pass" : ""}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <span className="score-hint">≥4 分为一次达标配合</span>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
