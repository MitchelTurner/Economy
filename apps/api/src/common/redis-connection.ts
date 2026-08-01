/** Shared ioredis options for BullMQ / auth so boot cannot hang forever. */
export function redisConnectionFromUrl(url: string) {
  return {
    url,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    connectTimeout: 5_000,
    retryStrategy(times: number) {
      if (times > 20) return null;
      return Math.min(times * 200, 2_000);
    },
  };
}
