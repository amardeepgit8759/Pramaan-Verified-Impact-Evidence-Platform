import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Env } from './env.js';

const common = { standardHeaders: 'draft-8', legacyHeaders: false } as const;
const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

/**
 * Limits for endpoints that call Gemini. They cost money and share one quota, so they are
 * limited per signed-in user (and reports per organisation), on top of the global limit.
 */
export function aiRateLimiters(
  env: Pick<
    Env,
    | 'AI_RATE_LIMIT_WINDOW_MS'
    | 'AI_RATE_LIMIT_MAX'
    | 'REPORT_RATE_LIMIT_WINDOW_MS'
    | 'REPORT_RATE_LIMIT_MAX'
  >,
) {
  return {
    /** Search queries and upload confirmations (captioning and embedding). */
    ai: rateLimit({
      ...common,
      windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
      limit: env.AI_RATE_LIMIT_MAX,
      keyGenerator: (req) => req.user?.id ?? ipKey(req),
      message: {
        error: 'That’s a lot of AI requests in a short time. Wait a minute and try again.',
      },
    }),
    /** Report generation, per organisation. */
    reports: rateLimit({
      ...common,
      windowMs: env.REPORT_RATE_LIMIT_WINDOW_MS,
      limit: env.REPORT_RATE_LIMIT_MAX,
      keyGenerator: (req) => req.user?.orgId ?? ipKey(req),
      message: {
        error: 'Your organisation has generated a lot of reports recently. Try again later.',
      },
    }),
  };
}
