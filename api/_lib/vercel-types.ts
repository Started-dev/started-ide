import type { IncomingMessage, ServerResponse } from 'node:http';

export type VercelRequest = IncomingMessage & {
  body?: any;
  query?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
};

export type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};
