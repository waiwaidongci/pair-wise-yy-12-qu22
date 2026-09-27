import { useCallback, useEffect, useState } from "react";
import "./styles.css";
import { useAppData } from "./hooks/useAppData";
import BoardPage from "./ui/BoardPage";
import HorsesPage from "./ui/HorsesPage";
import SettingsPage from "./ui/SettingsPage";

type Tab = "board" | "horses" | "settings";
type Toast = { id: number; msg: string; type: "ok" | "err" };

const TABS: { key: Tab; label: string }[] = [
  { key: "board", label: "今日派工" },
  { key: "horses", label: "马匹档案" },
  { key: "settings", label: "时段与数据" },
];

function App() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>("board");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, msg, type }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  useEffect(() => {
    document.title = "蹄铁安全派工台";
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-mark">🐎</span>
          <div>
            <h1>蹄铁安全派工台</h1>
            <p>上门只看到马号，到厩才知道抬蹄表现——先登记习惯，再排安全时段</p>
          </div>
        </div>
        <nav className="app-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? "tab-on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {tab === "board" && <BoardPage data={data} notify={notify} />}
        {tab === "horses" && <HorsesPage data={data} notify={notify} />}
        {tab === "settings" && <SettingsPage data={data} notify={notify} />}
      </main>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
