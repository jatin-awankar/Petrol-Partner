// app/hooks/utils/usePagination.ts
import { useState } from "react";

export function usePagination(initialPage = 1) {
  const [page, setPage] = useState(initialPage);

  const nextPage = () => setPage((prev) => prev + 1);
  const prevPage = () => setPage((prev) => Math.max(prev - 1, 1));
  const goToPage = (p: number) => setPage(Math.max(p, 1));

  return { page, setPage, nextPage, prevPage, goToPage };
}
