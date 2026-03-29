import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

type UserRole = 'operator' | 'supervisor';

interface JwtClaims {
  sub?: string;
  user_id?: string;
  role?: UserRole;
  zone_id?: string;
  zones?: string[];
}

interface ResolvedUser {
  id: string;
  role: UserRole;
  zones: string[];
}

function parseCsvZones(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseJwtFromAuthHeader(req: Request): JwtClaims | null {
  const secret = process.env.JWT_SECRET;
  const authHeader = req.header('authorization');
  if (!secret || !authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return null;
  }

  try {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const payload = jwt.verify(token, secret);
    if (typeof payload !== 'object' || !payload) {
      return null;
    }
    return payload as JwtClaims;
  } catch {
    return null;
  }
}

function resolveUserId(req: Request, claims: JwtClaims | null): string | undefined {
  return (
    claims?.sub ||
    claims?.user_id ||
    req.header('x-user-id') ||
    (typeof req.query.userId === 'string' ? req.query.userId : undefined)
  );
}

async function fetchUser(id: string): Promise<ResolvedUser | null> {
  const result = await query(
    `
    SELECT
      u.id,
      u.role,
      u.zone_id,
      COALESCE(
        ARRAY_AGG(DISTINCT uza.zone_id) FILTER (WHERE uza.zone_id IS NOT NULL),
        ARRAY[]::uuid[]
      ) AS mapped_zones
    FROM users u
    LEFT JOIN user_zone_access uza ON uza.user_id = u.id
    WHERE u.id = $1::uuid
    GROUP BY u.id, u.role, u.zone_id
    `,
    [id]
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0] as {
    id: string;
    role: UserRole;
    zone_id: string | null;
    mapped_zones: string[];
  };

  const zones = new Set<string>();
  if (row.zone_id) {
    zones.add(row.zone_id);
  }
  for (const zone of row.mapped_zones || []) {
    zones.add(zone);
  }

  return {
    id: row.id,
    role: row.role,
    zones: Array.from(zones),
  };
}

function pickRequestedZone(req: Request): string | undefined {
  return (
    req.header('x-zone-id') ||
    req.header('x-user-zone') ||
    (typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined)
  );
}

export async function requireAuthContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const claims = parseJwtFromAuthHeader(req);
  const userId = resolveUserId(req, claims);

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const dbUser = await fetchUser(userId);
    if (!dbUser) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const requestedZone = pickRequestedZone(req);
    let effectiveZoneId: string | undefined;

    if (dbUser.role === 'operator') {
      if (!requestedZone && dbUser.zones.length === 1) {
        effectiveZoneId = dbUser.zones[0];
      } else {
        effectiveZoneId = requestedZone;
      }

      if (!effectiveZoneId) {
        res.status(400).json({ error: 'x-zone-id is required for operator requests' });
        return;
      }
      if (!dbUser.zones.includes(effectiveZoneId)) {
        res.status(403).json({ error: 'User is not authorized for the requested zone' });
        return;
      }
    } else {
      effectiveZoneId = requestedZone;
    }

    req.authUser = {
      id: dbUser.id,
      role: dbUser.role,
      zones: dbUser.zones,
      effectiveZoneId,
      authMode: claims ? 'jwt' : 'header-dev',
    };

    next();
  } catch (err) {
    console.error('Auth middleware failure', err);
    res.status(500).json({ error: 'Failed to validate authentication context' });
  }
}

export function authModeLabel(): string {
  return process.env.JWT_SECRET ? 'jwt' : 'header-dev';
}
