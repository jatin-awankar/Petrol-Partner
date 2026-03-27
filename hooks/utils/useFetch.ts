// app/hooks/utils/useFetch.ts
import { useState, useEffect } from "react";

interface FetchOptions extends RequestInit {
  token?: string;
}

export function useFetch<T = any>(url: string, options: FetchOptions = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
            ...options.headers,
          },
        });

        if (!res.ok) throw new Error(`Network error: ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [options, url]);

  return { data, loading, error };
}
