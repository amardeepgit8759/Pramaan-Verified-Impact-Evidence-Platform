import { z } from 'zod';

const required = (hint: string) =>
  z
    .string({ error: `is required (${hint})` })
    .trim()
    .min(1, `is required (${hint})`);

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: required('Postgres connection string').regex(
    /^postgres(ql)?:\/\//,
    'must be a postgres:// or postgresql:// URL',
  ),

  JWT_SECRET: required('random string used to sign auth cookies').min(
    32,
    'must be at least 32 characters',
  ),

  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  CLOUDINARY_CLOUD_NAME: required('Cloudinary Console → Settings → API Keys'),
  CLOUDINARY_API_KEY: required('Cloudinary Console → Settings → API Keys'),
  CLOUDINARY_API_SECRET: required('Cloudinary Console → Settings → API Keys'),
  CLOUDINARY_UPLOAD_FOLDER: z.string().trim().min(1).default('pramaan'),
  CLOUDINARY_TAGGING_ADDON: z
    .enum(['google_tagging', 'imagga_tagging', 'aws_rek_tagging'])
    .default('google_tagging'),

  GEMINI_API_KEY: required('Google AI Studio API key'),
  GEMINI_VISION_MODEL: required('Gemini model id for captioning/tagging'),
  GEMINI_REPORT_MODEL: required('Gemini model id for report generation'),
  GEMINI_EMBEDDING_MODEL: required('Gemini model id for text embeddings'),

  TAGGING_PROVIDER: z.enum(['cloudinary', 'gemini']).default('cloudinary'),

  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_WHATSAPP_FROM: optional,

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Stricter limit for sign-in, sign-up and password-set, per client IP. */
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  /** Directory holding the built web app; served by the API when set. */
  WEB_DIST_DIR: optional,
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'Copy .env.example to .env and fill in the missing values.',
    );
    this.name = 'EnvError';
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`),
    );
  }
  return result.data;
}
