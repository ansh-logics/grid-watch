import 'express';

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        role: 'operator' | 'supervisor';
        zones: string[];
        effectiveZoneId?: string;
        authMode: 'jwt' | 'header-dev';
      };
    }
  }
}

export {};
