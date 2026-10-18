export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export const badRequest = (m: string, code = "BAD_REQUEST") => new AppError(400, code, m);
export const unauthorized = (m = "Unauthorized", code = "UNAUTHORIZED") => new AppError(401, code, m);
export const forbidden = (m = "Forbidden") => new AppError(403, "FORBIDDEN", m);
export const notFound = (m = "Not found") => new AppError(404, "NOT_FOUND", m);
export const conflict = (m: string, code = "CONFLICT") => new AppError(409, code, m);
