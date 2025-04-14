const logger = require('../logger');

class AdaptiveRateLimiter {
  constructor(config = {}) {
    this.windowMs = config.windowMs || 900000; // 15 minutes
    this.maxRequests = config.maxRequests || 100;
    this.requests = new Map();
    this.resetTimes = new Map();
    this.currentWaitMs = 1000;
    this.backoffFactor = 2;
    this.recoveryFactor = 0.5;
    this.maxWaitMs = 60000;
  }

  _cleanExpiredRequests(endpoint) {
    const requests = this.requests.get(endpoint);
    if (!requests) return;

    const now = Date.now();
    const resetTime = this.resetTimes.get(endpoint);

    // If reset time has passed, clear all requests
    if (resetTime && now >= resetTime) {
      this.requests.delete(endpoint);
      this.resetTimes.delete(endpoint);
      return;
    }

    // Remove requests outside the window
    const windowStart = now - this.windowMs;
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length === 0) {
      this.requests.delete(endpoint);
    } else {
      this.requests.set(endpoint, validRequests);
    }
  }

  async shouldRateLimit(endpoint = 'default') {
    this._cleanExpiredRequests(endpoint);
    
    const requests = this.requests.get(endpoint) || [];
    const now = Date.now();

    if (requests.length >= this.maxRequests) {
      return true;
    }

    requests.push(now);
    this.requests.set(endpoint, requests);
    return false;
  }

  isRateLimited(endpoint = 'default') {
    this._cleanExpiredRequests(endpoint);
    const requests = this.requests.get(endpoint) || [];
    return requests.length >= this.maxRequests;
  }

  getResetTime(endpoint = 'default') {
    const resetTime = this.resetTimes.get(endpoint);
    if (resetTime && resetTime > Date.now()) {
      return resetTime - Date.now();
    }
    return this.currentWaitMs;
  }

  reset() {
    this.requests.clear();
    this.resetTimes.clear();
    this.currentWaitMs = 1000;
  }

  updateFromHeaders(endpoint, headers) {
    const remaining = parseInt(headers['x-rate-limit-remaining'], 10);
    const resetTime = parseInt(headers['x-rate-limit-reset'], 10) * 1000;

    if (resetTime) {
      this.resetTimes.set(endpoint, resetTime);
    }

    if (typeof remaining === 'number') {
      const remainingRatio = remaining / this.maxRequests;
      if (remainingRatio < 0.1) {
        this.currentWaitMs = Math.min(
          this.currentWaitMs * this.backoffFactor,
          this.maxWaitMs
        );
      } else if (remainingRatio > 0.5) {
        this.currentWaitMs = Math.max(
          this.currentWaitMs * this.recoveryFactor,
          1000
        );
      }
    }
  }

  getStatus(endpoint = 'default') {
    this._cleanExpiredRequests(endpoint);
    const requests = this.requests.get(endpoint) || [];
    const resetTime = this.resetTimes.get(endpoint);

    return {
      remaining: this.maxRequests - requests.length,
      resetTime: resetTime || Date.now() + this.windowMs,
      windowMs: this.windowMs,
      currentWaitMs: this.currentWaitMs
    };
  }
}

module.exports = AdaptiveRateLimiter;