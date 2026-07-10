export default class RateLimiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.timestamps = new Map();
  }

  hit(key) {
    const now = Date.now();
    const userTimestamps = this.timestamps.get(key) || [];
    const filtered = userTimestamps.filter(ts => now - ts < this.windowMs);
    filtered.push(now);
    this.timestamps.set(key, filtered);
    return filtered.length > this.max;
  }

  count(key) {
    const now = Date.now();
    const userTimestamps = this.timestamps.get(key) || [];
    return userTimestamps.filter(ts => now - ts < this.windowMs).length;
  }
}
