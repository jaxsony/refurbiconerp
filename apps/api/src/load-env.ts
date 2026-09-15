import { setDefaultResultOrder } from 'node:dns';
import { config } from 'dotenv';
import { resolve } from 'path';

try {
  setDefaultResultOrder('ipv4first');
} catch {
  // Node < 17
}

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), 'apps/api/.env') });
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

function withServerlessDbParams(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '5');
    }
    if (parsed.port === '6543' && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', '1');
    }
    if (parsed.hostname.includes('supabase') && !parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'require');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

if (process.env.VERCEL && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = withServerlessDbParams(process.env.DATABASE_URL);
}

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
} else if (process.env.VERCEL && process.env.DIRECT_URL) {
  process.env.DIRECT_URL = withServerlessDbParams(process.env.DIRECT_URL);
}
