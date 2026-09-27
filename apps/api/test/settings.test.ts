import { DEFAULT_ORG_SETTINGS } from '@pramaan/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { getOrgSettings } from '../src/services/settings.js';
import { createOrg, resetDb } from './fixtures.js';
import { TEST_DATABASE_URL } from './test-db-url.js';

const { db, pool } = createDb(TEST_DATABASE_URL);
afterAll(() => pool.end());
beforeEach(() => resetDb(db));

describe('org settings', () => {
  it('are seeded from the shared defaults and read back unchanged', async () => {
    const org = await createOrg(db);
    expect(await getOrgSettings(db, org.id)).toEqual(DEFAULT_ORG_SETTINGS);
  });

  it('fail loudly when an organization has no settings row', async () => {
    await expect(getOrgSettings(db, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      /has no settings row/,
    );
  });
});
