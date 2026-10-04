"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useApiData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(Boolean(path)); const [error, setError] = useState("");
  const reload = useCallback(async () => { if (!path) return; setLoading(true); setError(""); try { setData(await api<T>(path)); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load data"); } finally { setLoading(false); } }, [path]);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void api<T>(path)
      .then((response) => { if (active) setData(response); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load data"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path]);
  return { data, loading, error, reload, setData };
}
