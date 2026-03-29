import request from 'supertest';
import { createApp } from '../../src/app';
import { query } from '../../src/db';
import { seedBaseContext } from './helpers';

describe('Ingest API', () => {
  const app = createApp();

  it('accepts a valid batch insert', async () => {
    const { sensorId } = await seedBaseContext();
    const payload = [
      {
        sensor_id: sensorId,
        timestamp: new Date().toISOString(),
        voltage: 231.1,
        current: 11.4,
        temperature: 29.8,
        status_code: 200,
      },
    ];

    const res = await request(app).post('/ingest').send(payload);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ message: 'Ingested', count: 1 });

    const check = await query(`SELECT COUNT(*)::int AS count FROM readings WHERE sensor_id = $1::uuid`, [
      sensorId,
    ]);
    expect(check.rows[0].count).toBe(1);
  });

  it('rejects invalid payloads', async () => {
    const res = await request(app).post('/ingest').send({ not: 'an-array' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid array/i);
  });

  it('honors idempotency key and rejects body mismatches', async () => {
    const { sensorId } = await seedBaseContext();
    const key = 'idempo-1';
    const bodyA = [
      {
        sensor_id: sensorId,
        timestamp: new Date().toISOString(),
        voltage: 220,
        current: 10,
        temperature: 28,
        status_code: 200,
      },
    ];
    const bodyB = [
      {
        ...bodyA[0],
        voltage: 250,
      },
    ];

    const first = await request(app).post('/ingest').set('Idempotency-Key', key).send(bodyA);
    const second = await request(app).post('/ingest').set('Idempotency-Key', key).send(bodyA);
    const mismatch = await request(app).post('/ingest').set('Idempotency-Key', key).send(bodyB);

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(mismatch.status).toBe(409);

    const inserted = await query(`SELECT COUNT(*)::int AS count FROM readings WHERE sensor_id = $1::uuid`, [
      sensorId,
    ]);
    expect(inserted.rows[0].count).toBe(1);
  });
});
