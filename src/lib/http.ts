import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors';

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string, code = 'error'): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/** Wraps a handler so domain errors become readable HTTP responses instead of 500s. */
export function handleApi<Args extends unknown[]>(
  fn: (req: NextRequest, ...args: Args) => Promise<Response>,
): (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  return async (req, ctx) => {
    try {
      const params = ctx?.params ? await ctx.params : {};
      return await fn(req, ...(Object.values(params) as Args));
    } catch (err) {
      if (err instanceof AppError) return fail(err.status, err.message, err.code);
      if (err instanceof ZodError) {
        return fail(422, err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation_failed');
      }
      console.error('[api] unhandled error', err);
      return fail(500, 'Unexpected server error');
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError(400, 'A JSON body is required', 'bad_json');
  }
}
