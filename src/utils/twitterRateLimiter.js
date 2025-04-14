const logger = require('../logger');

class AdaptiveRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
    this.maxRequests = options.maxRequests || 100;
    this.requests = new Map();
    this.resetTimes = new Map();
    this.currentWaitMs = 1000; // Start with 1 second delay
    this.maxWaitMs = 300000; // Max 5 minute delay
    this.backoffFactor = 1.5;
    this.recoveryFactor = 0.8;
  }

  async shouldRateLimit(endpoint = 'default') {
    this._cleanExpiredRequests(endpoint);
    
    const requests = this.requests.get(endpoint) || [];
    const now = Date.now();

    if (requests.length >= this.maxRequests) {
      const waitTime = this._calculateWaitTime(endpoint);
      logger.debug(`Rate limiting ${endpoint}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.shouldRateLimit(endpoint); // Recheck after waiting
    }

    requests.push(now);
    this.requests.set(endpoint, requests);
    return false;
  }

  updateLimits(headers) {
    const remaining = parseInt(headers['x-rate-limit-remaining'], 10);
    const resetTime = parseInt(headers['x-rate-limit-reset'], 10) * 1000; // Convert to ms
    const endpoint = headers['x-rate-limit-endpoint'] || 'default';

    this.resetTimes.set(endpoint, resetTime);

    // Adjust backoff based on remaining requests
    if (remaining !== undefined) {
      const remainingRatio = remaining / this.maxRequests;
      
      if (remainingRatio < 0.1) { // Less than 10% remaining
        this.currentWaitMs = Math.min(
          this.currentWaitMs * this.backoffFactor,
          this.maxWaitMs
        );
      } else if (remainingRatio > 0.5) { // More than 50% remaining
        this.currentWaitMs = Math.max(
          this.currentWaitMs * this.recoveryFactor,
          1000
        );
      }
    }

    logger.debug(`Updated rate limits for ${endpoint}: ${remaining} remaining, reset at ${new Date(resetTime).toISOString()}`);
  }

  _calculateWaitTime(endpoint) {
    const resetTime = this.resetTimes.get(endpoint);
    if (resetTime) {
      const now = Date.now();
      if (resetTime > now) {
        return Math.min(resetTime - now, this.maxWaitMs);
      }
    }
    return this.currentWaitMs;
  }

  _cleanExpiredRequests(endpoint) {
    const now = Date.now();
    const resetTime = this.resetTimes.get(endpoint);
    
    if (resetTime && resetTime <= now) {
      this.requests.delete(endpoint);
      this.resetTimes.delete(endpoint);
      return;
    }

    const requests = this.requests.get(endpoint);
    if (requests) {
      const validRequests = requests.filter(time => 
        now - time < this.windowMs
      );
      if (validRequests.length < requests.length) {
        this.requests.set(endpoint, validRequests);
      }
    }
  }

  getStatus() {
    const status = {};
    for (const [endpoint, requests] of this.requests.entries()) {
      status[endpoint] = {
        remaining: this.maxRequests - requests.length,
        resetTime: this.resetTimes.get(endpoint),
        currentWaitMs: this.currentWaitMs
      };
    }
    return status;
  }

  reset() {
    this.requests.clear();
    this.resetTimes.clear();
    this.currentWaitMs = 1000;
  }
}

module.exports = AdaptiveRateLimiter;