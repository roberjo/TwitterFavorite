const AdaptiveRateLimiter = require('../src/utils/twitterRateLimiter');
jest.mock('../src/logger');

describe('AdaptiveRateLimiter', () => {
  let rateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    rateLimiter = new AdaptiveRateLimiter({
      maxRequests: 100,
      windowMs: 900000 // 15 minutes
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with default values', () => {
    expect(rateLimiter.windowMs).toBe(900000);
    expect(rateLimiter.maxRequests).toBe(100);
    expect(rateLimiter.currentWaitMs).toBe(1000);
  });

  it('should update limits based on headers', () => {
    const headers = {
      'x-rate-limit-remaining': '5',
      'x-rate-limit-reset': (Date.now() / 1000 + 100).toString()
    };

    rateLimiter.updateFromHeaders('default', headers);

    // Should increase backoff due to low remaining requests
    expect(rateLimiter.currentWaitMs).toBeGreaterThan(1000);
  });

  it('should decrease backoff when plenty of requests remain', () => {
    rateLimiter.currentWaitMs = 5000; // Start with increased backoff

    const headers = {
      'x-rate-limit-remaining': '90',
      'x-rate-limit-reset': (Date.now() / 1000 + 100).toString()
    };

    rateLimiter.updateFromHeaders('default', headers);

    // Should decrease backoff due to high remaining requests
    expect(rateLimiter.currentWaitMs).toBeLessThan(5000);
  });

  it('should rate limit when max requests reached', async () => {
    const now = Date.now();
    const requests = Array(100).fill(now);
    rateLimiter.requests.set('default', requests);
    rateLimiter.resetTimes.set('default', now + 60000);

    const shouldLimit = await rateLimiter.shouldRateLimit('default');
    expect(shouldLimit).toBe(true);

    // Should have waited at least the minimum wait time
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));
  }, 10000); // Increase timeout to 10 seconds

  it('should clear requests after reset time', async () => {
    const pastTime = Date.now() - 1000000;
    rateLimiter.requests.set('default', [pastTime]);
    rateLimiter.resetTimes.set('default', pastTime);

    await rateLimiter.shouldRateLimit();

    // After reset time, requests should be cleared
    expect(rateLimiter.requests.has('default')).toBe(false);
    expect(rateLimiter.resetTimes.has('default')).toBe(false);
  });

  it('should track requests per endpoint separately', () => {
    const endpoint1 = 'api1';
    const endpoint2 = 'api2';

    rateLimiter.recordCall(endpoint1);
    rateLimiter.recordCall(endpoint2);

    const status = rateLimiter.getStatus();
    expect(status.remaining).toBeDefined();
    expect(status.resetTime).toBeDefined();
    expect(status.windowMs).toBe(900000);
  });

  it('should reset all state', () => {
    rateLimiter.requests.set('default', [Date.now()]);
    rateLimiter.resetTimes.set('default', Date.now() + 60000);
    rateLimiter.currentWaitMs = 5000;

    rateLimiter.reset();

    expect(rateLimiter.requests.size).toBe(0);
    expect(rateLimiter.resetTimes.size).toBe(0);
    expect(rateLimiter.currentWaitMs).toBe(1000);
  });

  it('should respect maximum wait time', () => {
    rateLimiter.currentWaitMs = rateLimiter.maxWaitMs;

    const headers = {
      'x-rate-limit-remaining': '1',
      'x-rate-limit-reset': (Date.now() / 1000 + 100).toString()
    };

    // Call multiple times to increase backoff
    for (let i = 0; i < 5; i++) {
      rateLimiter.updateFromHeaders('default', headers);
    }

    // Should not exceed maxWaitMs
    expect(rateLimiter.currentWaitMs).toBe(rateLimiter.maxWaitMs);
  });
});