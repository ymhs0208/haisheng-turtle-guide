import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api";
import { useGuide } from "@/state";
import type { Session } from "@/types";

export function JoinPage() {
  const { id } = useParams();
  const { adopt } = useGuide();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api<{ session: Session }>(`/api/sessions/${id}`)
      .then((data) => {
        adopt(data.session);
        navigate("/app", { replace: true });
      })
      .catch(() => setError("這張票券失效了，請重新開始一趟導覽。"));
  }, [id, adopt, navigate]);

  return <main className="grid min-h-screen place-items-center px-6 text-center text-lg text-ink">{error || "正在接上你的行程…"}</main>;
}
