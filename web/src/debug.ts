import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const KEY = "xiaolu-debug";

/** Teacher view. `?debug=1` sticks for this tab; `?debug=0` turns it off. */
export function useDebug(): boolean {
  const location = useLocation();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("debug") === "1") sessionStorage.setItem(KEY, "1");
    if (params.get("debug") === "0") sessionStorage.removeItem(KEY);
    setOn(sessionStorage.getItem(KEY) === "1");
  }, [location.search]);
  return on;
}
