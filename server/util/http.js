export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Please log in first') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (msg) => new HttpError(409, msg);
export const tooMany = (msg = 'Too many requests, slow down') => new HttpError(429, msg);

/** Parse ?page=&pageSize= with sane bounds. */
export function paging(query, defSize = 50, maxSize = 200) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const pageResult = (items, total, { page, pageSize }) => ({
  items,
  total,
  page,
  pageSize,
  pages: Math.max(1, Math.ceil(total / pageSize)),
});
