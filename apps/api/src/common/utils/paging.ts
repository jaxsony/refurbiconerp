export type PageQuery = {
  page?: string | number;
  pageSize?: string | number;
  q?: string;
};

export function paging(query: PageQuery = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, q };
}

export function pageOf<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / Math.max(pageSize, 1))),
  };
}
