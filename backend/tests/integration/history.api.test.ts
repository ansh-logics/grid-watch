import request from 'supertest';
import { createApp } from '../../src/app';
import { query } from '../../src/db';
import { seedBaseContext } from './helpers';

describe('History API', () => {
  const app = createApp();

  it('supports pagination and returns expected response structure', async () => {
    const { sensorId, operatorId, zoneId } = await seedBaseContext();
    const base = new Date('2026-01-01T00:00:00.000Z');

    for (let i = 0; i < 5; i += 1) {
      await query(
        `
        INSERT INTO readings (id, sensor_id, timestamp, voltage, current, temperature, status_code)
        VALUES (uuid_generate_v4(), $1::uuid, $2::timestamptz, $3, $4, $5, 200)
        `,
        [sensorId, new Date(base.getTime() + i * 60_000).toISOString(), 220 + i, 10 + i, 25 + i]
      );
    }

    const from = new Date(base.getTime() - 60_000).toISOString();
    const to = new Date(base.getTime() + 10 * 60_000).toISOString();

    const res = await request(app)
      .get(`/sensors/${sensorId}/history`)
      .set('x-user-id', operatorId)
      .set('x-zone-id', zoneId)
      .query({ from, to, limit: 2, offset: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ limit: 2, offset: 1, count: 2 });
    expect(res.body.data[0]).toHaveProperty('reading_id');
    expect(res.body.data[0]).toHaveProperty('timestamp');
    expect(res.body.data[0]).toHaveProperty('anomalies');
  });
});
