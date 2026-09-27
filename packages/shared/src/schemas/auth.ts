import { z } from 'zod';
import { USER_ROLES } from '../domain.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'Use at most 200 characters');

const nameSchema = z.string().trim().min(1, 'Required').max(120, 'Keep it under 120 characters');

export const signupInput = z.object({
  orgName: nameSchema,
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupInput>;

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginInput>;

export const inviteInput = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(USER_ROLES),
});
export type InviteInput = z.infer<typeof inviteInput>;

export const setPasswordInput = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type SetPasswordInput = z.infer<typeof setPasswordInput>;

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(USER_ROLES),
});
export type User = z.infer<typeof userSchema>;

export const sessionResponse = z.object({
  user: userSchema,
  org: z.object({ id: z.uuid(), name: z.string() }),
});
export type SessionResponse = z.infer<typeof sessionResponse>;

export const teamMemberSchema = userSchema.extend({
  status: z.enum(['active', 'invited']),
  createdAt: z.string(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const inviteResponse = z.object({
  member: teamMemberSchema,
  /** One-time link the invitee uses to set a password (also logged on the server). */
  inviteUrl: z.string(),
});
export type InviteResponse = z.infer<typeof inviteResponse>;
