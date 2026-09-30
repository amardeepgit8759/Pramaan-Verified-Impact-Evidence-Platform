import { describe, expect, it } from 'vitest';
import { withVerifiedTls } from '../src/db/client.js';

const NEON =
  'postgresql://neondb_owner:p4ss@ep-x-123.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

describe('withVerifiedTls', () => {
  it('upgrades Neon’s sslmode=require to verify-full and keeps everything else', () => {
    expect(withVerifiedTls(NEON)).toBe(NEON.replace('sslmode=require', 'sslmode=verify-full'));
  });

  it.each(['prefer', 'verify-ca'])('upgrades sslmode=%s too', (mode) => {
    expect(withVerifiedTls(`postgres://u:p@h/db?sslmode=${mode}`)).toBe(
      'postgres://u:p@h/db?sslmode=verify-full',
    );
  });

  it('leaves verify-full, disable, no sslmode and unparsable strings alone', () => {
    for (const url of [
      'postgres://u:p@h/db?sslmode=verify-full',
      'postgres://u:p@h/db?sslmode=disable',
      'postgres://pramaan:pramaan@localhost:55432/pramaan',
      'not a url',
    ]) {
      expect(withVerifiedTls(url)).toBe(url);
    }
  });

  it('keeps a percent-encoded password intact', () => {
    const url = 'postgres://u:p%40ss%2Fw0rd@h/db?sslmode=require';
    expect(withVerifiedTls(url)).toBe('postgres://u:p%40ss%2Fw0rd@h/db?sslmode=verify-full');
  });
});
