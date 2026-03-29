import { Response } from 'express';
import Redis from 'ioredis';

const redisHost = process.env.REDIS_URL || 'redis://localhost:6379/0';
// Isolated Redis clients required for distinct pub/sub
const pubClient = new Redis(redisHost);
const subClient = new Redis(redisHost);

const connections: Map<string, Set<Response>> = new Map();

// When our single node receives a trigger via pub-sub from ANY worker, 
// broadcast it to standard connected websockets
subClient.subscribe('zone-events', (err) => {
  if (err) console.error('Redis Subscribe Error', err);
});

subClient.on('message', (channel, message) => {
  if (channel === 'zone-events') {
    const payload = JSON.parse(message);
    const { zoneId, data } = payload;
    
    const zoneClients = connections.get(zoneId);
    if (zoneClients) {
      const eventString = `data: ${JSON.stringify(data)}\n\n`;
      for (const res of zoneClients) {
        res.write(eventString);
      }
    }
  }
});

export const SSEManager = {
  addClient: (zoneId: string, res: Response) => {
    if (!connections.has(zoneId)) {
      connections.set(zoneId, new Set());
    }
    connections.get(zoneId)!.add(res);

    // Keep active
    const ka = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 25000);

    res.on('close', () => {
      clearInterval(ka);
      connections.get(zoneId)?.delete(res);
    });
  },

  // Workers trigger this function to fanout state updates
  broadcastToZone: (zoneId: string, data: any) => {
    pubClient.publish('zone-events', JSON.stringify({ zoneId, data }));
  }
};
