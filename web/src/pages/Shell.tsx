import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { ShowOverlay } from "@/components/ShowOverlay";
import { useGuide } from "@/state";

const LINKS = [
  ["/app", "首頁"],
  ["/app/quiz", "練習"],
  ["/app/chat", "對話"],
  ["/app/show", "展示"],
];

export function Shell() {
  const { ready, session, toast, clearToast, setAnim } = useGuide();
  const location = useLocation();
  if (!ready) return <main className="grid min-h-screen place-items-center text-muted">小綠游過來…</main>;
  if (!session) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] px-4 pb-28 pt-5">
      <Outlet />
      {toast && (
        <button className="fixed bottom-24 left-1/2 z-30 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl bg-sand px-4 py-3 text-left text-sm text-abyss" onClick={clearToast}>
          {toast}
        </button>
      )}
      <ShowOverlay />
      <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[480px] -translate-x-1/2 justify-around border-t border-white/10 bg-[#04151c]/95 px-2 py-2 backdrop-blur">
        {LINKS.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/app"}
            onClick={() => setAnim("idle")}
            className={({ isActive }) =>
              `min-h-11 min-w-16 rounded-full px-3 py-2 text-center text-sm ${isActive || (to !== "/app" && location.pathname.startsWith(to)) ? "bg-teal text-abyss" : "text-muted"}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
