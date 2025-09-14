import { useCallback, useEffect, useMemo, useState } from "react";

export function usePagination<T>(items: T[], itemsPerPage: number = 5) {
  const [page, setPage] = useState(1);

  const totalPages =
    items.length > 0 ? Math.ceil(items.length / itemsPerPage) : 0;

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return items.slice(start, start + itemsPerPage);
  }, [items, page, itemsPerPage]);

  const nextPage = useCallback(
    () => setPage((p) => Math.min(p + 1, totalPages)),
    [totalPages]
  );

  const prevPage = useCallback(() => setPage((p) => Math.max(p - 1, 1)), []);

  const resetPage = useCallback(() => setPage(1), []);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages || 1);
    }
  }, [page, totalPages]);

  return { page, totalPages, paginatedItems, nextPage, prevPage, resetPage };
}
