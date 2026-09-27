/** Integration tests run against the `db-test` service from docker-compose.yml. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://pramaan:pramaan@localhost:55433/pramaan_test';
