export function useBullmq(): boolean {
  if (process.env.VERCEL) {
    return false;
  }
  return Boolean(process.env.REDIS_URL?.trim());
}
