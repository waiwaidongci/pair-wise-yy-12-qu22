import { useState } from "react";
import type { AppData, SlotDef, SlotKind } from "../types";
import { getState, replaceData, uid } from "../data/store";
import { saveSlots } from "../domain/actions";
import { seedData, STORAGE_KEY } from "../data/seed";

type Notify = (msg: string, type?: "ok" | "err") => void;

export default function SettingsPage({ data, notify }: { data: AppData; notify: Notify }) {
  const [slots, setSlots] = useState<SlotDef[]>(data.slots.map((s) => ({ ...s })));
  const [dirty, setDirty] = useState(false);

  function patch(id: string, p: Partial<SlotDef>) {
    setSlots((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));
    setDirty(true);
  }

  function addSlot(kind: SlotKind) {
    setSlots((list) => [
      ...list,
      { id: uid("slot"), kind, label: kind === "double" ? "新双人时段" : "新单人时段", time: "17:00–18:00", active: true },
    ]);
    setDirty(true);
  }

  function removeSlot(id: string) {
    setSlots((list) => list.filter((s) => s.id !== id));
    setDirty(true);
  }

  function save() {
    const res = saveSlots(slots);
    if (!res.ok) return notify(res.reason ?? "保存失败", "err");
    setDirty(false);
    notify("时段设置已保存（受影响的已排单会退回待排）");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `farrier-dispatch-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("已导出 JSON 备份");
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData;
        if (!Array.isArray(parsed.horses) || !Array.isArray(parsed.orders)) {
          throw new Error("bad shape");
        }
        replaceData(parsed);
        setSlots(parsed.slots ?? seedData().slots);
        setDirty(false);
        notify("数据已导入浏览器", "ok");
      } catch {
        notify("导入失败：文件格式不是本工作台的备份", "err");
      }
    };
    reader.readAsText(file);
  }

  function resetDemo() {
    if (!window.confirm("恢复示例数据将覆盖当前浏览器里的全部马匹与派工单，确定继续？")) return;
    const seeded = seedData();
    replaceData(seeded);
    setSlots(seeded.slots);
    setDirty(false);
    notify("已恢复示例数据", "ok");
  }

  return (
    <div className="page">
      <section className="block">
        <h3>每日时段设置</h3>
        <p className="muted">
          双人时段用于高风险马，安排时必须填写搭档；停用或删除时段会让占用它的已排单失效并退回待排。
        </p>
        <div className="slot-edit-list">
          {slots.map((s) => (
            <div key={s.id} className="slot-edit-row">
              <div className="slot-edit-kind">
                <button
                  type="button"
                  className={`chip ${s.kind === "single" ? "chip-on" : ""}`}
                  onClick={() => patch(s.id, { kind: "single" })}
                >
                  单人
                </button>
                <button
                  type="button"
                  className={`chip ${s.kind === "double" ? "chip-on chip-warn" : ""}`}
                  onClick={() => patch(s.id, { kind: "double" })}
                >
                  双人
                </button>
              </div>
              <input value={s.label} onChange={(e) => patch(s.id, { label: e.target.value })} placeholder="时段名称" />
              <input value={s.time} onChange={(e) => patch(s.id, { time: e.target.value })} placeholder="时间" className="time-input" />
              <label className="check-field">
                <input type="checkbox" checked={s.active} onChange={(e) => patch(s.id, { active: e.target.checked })} />
                <span>启用</span>
              </label>
              <button className="icon-btn" onClick={() => removeSlot(s.id)} aria-label="删除时段">×</button>
            </div>
          ))}
        </div>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => addSlot("double")}>+ 双人时段</button>
          <button className="btn" onClick={() => addSlot("single")}>+ 单人时段</button>
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>保存时段设置</button>
        </div>
      </section>

      <section className="block">
        <h3>浏览器数据</h3>
        <p className="muted">
          所有马匹档案、派工单与配合评分都存在本机浏览器的 <code>{STORAGE_KEY}</code> 中，不会上传。
        </p>
        <div className="data-grid">
          <div className="data-card">
            <strong>{data.horses.length}</strong>
            <span>马匹档案</span>
          </div>
          <div className="data-card">
            <strong>{data.orders.length}</strong>
            <span>派工单总数</span>
          </div>
          <div className="data-card">
            <strong>{data.orders.filter((o) => o.status === "done").length}</strong>
            <span>配合记录</span>
          </div>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={exportJson}>导出 JSON 备份</button>
          <label className="btn file-btn">
            导入 JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = "";
              }}
            />
          </label>
          <button className="btn btn-danger" onClick={resetDemo}>恢复示例数据</button>
        </div>
      </section>
    </div>
  );
}
