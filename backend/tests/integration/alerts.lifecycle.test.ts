import request from 'supertest';
import { createApp } from '../../src/app';
import { query } from '../../src/db';
import { seedAlert, seedBaseContext } from './helpers';

describe('Alert lifecycle API', () => {
  const app = createApp();

  it('transitions open -> acknowledged -> resolved', async () => {
    const { operatorId, zoneId, sensorId, ruleId } = await seedBaseContext();
    const { alertId } = await seedAlert(sensorId, ruleId);

    const ack = await request(app)
      .put(`/alerts/${alertId}/status`)
      .set('x-user-id', operatorId)
      .set('x-zone-id', zoneId)
      .send({ status: 'acknowledged' });

    const resolve = await request(app)
      .put(`/alerts/${alertId}/status`)
      .set('x-user-id', operatorId)
      .set('x-zone-id', zoneId)
      .send({ status: 'resolved' });

    expect(ack.status).toBe(200);
    expect(resolve.status).toBe(200);

    const row = await query(`SELECT status FROM alerts WHERE id = $1::uuid`, [alertId]);
    expect(row.rows[0].status).toBe('resolved');
  });

  it('rejects invalid status transitions', async () => {
    const { operatorId, zoneId, sensorId, ruleId } = await seedBaseContext();
    const { alertId } = await seedAlert(sensorId, ruleId);

    await request(app)
      .put(`/alerts/${alertId}/status`)
      .set('x-user-id', operatorId)
      .set('x-zone-id', zoneId)
      .send({ status: 'acknowledged' });

    await request(app)
      .put(`/alerts/${alertId}/status`)
      .set('x-user-id', operatorId)
      .set('x-zone-id', zoneId)
      .send({ status: 'resolved' });

    const invalid = await request(app)
      .put(`/alerts/${alertId}/status`)
      .set('x-user-id', operatorId)
      .set('x-zone-id', zoneId)
      .send({ status: 'acknowledged' });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatch(/invalid transition/i);
  });
});
