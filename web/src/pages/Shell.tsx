import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Compass, MessageCircle, Sparkles, Waves, Map } from "lucide-react";
import { ShowOverlay } from "@/components/ShowOverlay";
import { useGuide } from "@/state";
import { museumMap } from "@/data/museum";

const links = [
  { to: "/app", label: "陪我參觀", icon: Compass },
  { to: "/app/quiz", label: "小挑戰", icon: Sparkles },
  { to: "/app/chat", label: "問小綠", icon: MessageCircle },
];

export function Shell() {
  const { ready, session, toast, clearToast, setAnim } = useGuide();
  const location = useLocation();
  if (!ready) return <main className="grid min-h-screen place-items-center text-base text-muted">小綠游過來…</main>;
  if (!session) return <Navigate to="/" replace />;
  const home = location.pathname === "/app";
  return (
    <div className="museum-shell">
      <a className="skip-content" href="#main-content">跳到主要內容</a>
      <header className="museum-header">
        <Link to="/app" className="museum-brand" aria-label="小綠海洋導覽首頁"><span className="brand-mark"><Waves size={27} /></span><span><strong>小綠</strong><small>你的私人海洋導遊</small></span></Link>
        <a className="header-map" href={museumMap} target="_blank" rel="noreferrer"><Map size={17} /><span>館內地圖</span></a>
      </header>
      <main id="main-content" className={home ? "museum-main" : "museum-subpage"}>
        {!home && <Link className="mb-5 inline-flex min-h-11 items-center gap-2 font-semibold text-tide" to="/app">← 回到小綠身邊</Link>}
        <Outlet />
      </main>
      {toast && <button role="status" className="museum-toast" onClick={clearToast}>{toast}</button>}
      <ShowOverlay />
      <nav className="mobile-navigation" aria-label="主要功能">{links.map(({to, label, icon: Icon}) => <NavLink key={to} to={to} end={to === "/app"} onClick={() => setAnim("idle")}><Icon size={21} /><span>{label}</span></NavLink>)}</nav>
    </div>
  );
}
