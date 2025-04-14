const AdaptiveRateLimiter = require('../src/utils/twitterRateLimiter');
jest.mock('../src/logger');

describe('AdaptiveRateLimiter', () => {
  let rateLimiter;
  
  beforeEach(() => {
    jest.useFakeTimers();
    rateLimiter = new AdaptiveRateLimiter({
      windowMs: 900000, // 15 minutes
      maxRequests: 100
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
      'x-rate-limit-reset': '1680000000',
      'x-rate-limit-endpoint': '/tweets'
    };

    rateLimiter.updateLimits(headers);
    
    // Should increase backoff due to low remaining requests
    expect(rateLimiter.currentWaitMs).toBeGreaterThan(1000);
    expect(rateLimiter.resetTimes.get('/tweets')).toBe(1680000000000);
  });

  it('should decrease backoff when plenty of requests remain', () => {
    rateLimiter.currentWaitMs = 5000; // Start with increased backoff
    
    const headers = {
      'x-rate-limit-remaining': '90',
      'x-rate-limit-reset': '1680000000',
      'x-rate-limit-endpoint': '/tweets'
    };

    rateLimiter.updateLimits(headers);
    
    // Should decrease backoff due to high remaining requests
    expect(rateLimiter.currentWaitMs).toBeLessThan(5000);
  });

  it('should rate limit when max requests reached', async () => {
    const now = Date.now();
    const requests = Array(100).fill(now);
    rateLimiter.requests.set('default', requests);
    rateLimiter.resetTimes.set('default', now + 60000);

    const shouldLimit = await rateLimiter.shouldRateLimit();
    expect(shouldLimit).toBe(false); // Returns false after waiting
    
    // Should have waited at least the minimum wait time
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));
  });

  it('should clear requests after reset time', async () => {
    const pastTime = Date.now() - 1000000;
    rateLimiter.requests.set('default', [pastTime]);
    rateLimiter.resetTimes.set('default', pastTime);

    const shouldLimit = await rateLimiter.shouldRateLimit();
    
    expect(shouldLimit).toBe(false);
    expect(rateLimiter.requests.get('default')).toBeUndefined();
    expect(rateLimiter.resetTimes.get('default')).toBeUndefined();
  });

  it('should track requests per endpoint separately', async () => {
    const endpoint1 = '/tweets';
    const endpoint2 = '/users';
    
    // Add requests to both endpoints
    rateLimiter.requests.set(endpoint1, [Date.now()]);
    rateLimiter.requests.set(endpoint2, [Date.now()]);

    const status = rateLimiter.getStatus();
    
    expect(status[endpoint1]).toBeDefined();
    expect(status[endpoint2]).toBeDefined();
    expect(status[endpoint1].remaining).toBe(99);
    expect(status[endpoint2].remaining).toBe(99);
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
      'x-rate-limit-reset': '1680000000',
      'x-rate-limit-endpoint': '/tweets'
    };

    rateLimiter.updateLimits(headers);
    
    // Should not exceed maxWaitMs
    expect(rateLimiter.currentWaitMs).toBe(rateLimiter.maxWaitMs);
  });
});