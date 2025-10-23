'use client';

import { useCallback, useEffect, useState } from "react";

interface UseCommunityUpdatesOptions {
  limit?: number;
}

export function useCommunityUpdates(options: UseCommunityUpdatesOptions = {}) {
  const [updates, setUpdates] = useState<CommunityUpdates[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchCommUpdates = useCallback(
    async (append = false) => {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({
          limit: String(options.limit || 3),
          page: String(page),
        });

        const res = await fetch(`/api/community?${query}`);
        if (!res.ok) throw new Error("Failed to fetch community updates");

        const data = await res.json();
        const newUpdates = data.updates || [];

        setUpdates((prev) =>
          append ? [...prev, ...newUpdates] : newUpdates
        );

        setHasMore(newUpdates.length >= (options.limit || 3));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [page, options.limit]
  );

  useEffect(() => {
    fetchCommUpdates(page > 1); // append if next page
  }, [fetchCommUpdates, page]);

  const loadMore = () => {
    if (hasMore && !loading) setPage((p) => p + 1);
  };

  return { updates, loading, error, hasMore, loadMore, refetch: () => fetchCommUpdates(false) };
}
