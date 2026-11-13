import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { ShowOverlay } from "@/components/ShowOverlay";
import { useGuide } from "@/state";

const LINKS = [
  ["/app", "首頁"],
  ["/app/quiz", "小挑戰"],
  ["/app/chat", "問小綠"],
];

export function Shell() {
  const { ready, session, toast, clearToast, setAnim } = useGuide();
  const location = useLocation();
  if (!ready) return <main className="grid min-h-screen place-items-center text-base text-muted">小綠游過來…</main>;
  if (!session) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] px-4 pb-28 pt-5">
      <Outlet />
      {toast && (
        <button className="fixed bottom-24 left-1/2 z-30 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 text-left text-base text-ink shadow-lg ring-1 ring-tide/15" onClick={clearToast}>
          {toast}
        </button>
      )}
      <ShowOverlay />
      <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[480px] -translate-x-1/2 justify-around border-t border-tide/10 bg-white/95 px-2 py-2 backdrop-blur">
        {LINKS.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/app"}
            onClick={() => setAnim("idle")}
            className={({ isActive }) =>
              `flex min-h-12 min-w-24 items-center justify-center rounded-full px-3 text-base font-semibold ${isActive || (to !== "/app" && location.pathname.startsWith(to)) ? "bg-tide text-white" : "text-muted"}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
