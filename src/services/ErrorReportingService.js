const logger = require('../logger');
const os = require('os');

/**
 * Service for handling error reporting and aggregation
 */
class ErrorReportingService {
  constructor() {
    this.errors = new Map();
    this.instanceInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      nodeVersion: process.version,
      startTime: new Date().toISOString()
    };
  }

  /**
   * Report an error
   * @param {Error} error - Error object
   * @param {Object} context - Additional context about the error
   */
  reportError(error, context = {}) {
    const errorKey = this.getErrorKey(error);
    const errorInfo = this.errors.get(errorKey) || {
      count: 0,
      firstSeen: new Date(),
      lastSeen: null,
      contexts: []
    };

    errorInfo.count++;
    errorInfo.lastSeen = new Date();
    errorInfo.contexts.push({
      timestamp: new Date(),
      ...context
    });

    // Keep only last 10 contexts to prevent memory bloat
    if (errorInfo.contexts.length > 10) {
      errorInfo.contexts.shift();
    }

    this.errors.set(errorKey, errorInfo);

    // Log the error with full context
    logger.error('Error reported', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      instanceInfo: this.instanceInfo,
      occurrences: errorInfo.count
    });
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      errorTypes: {},
      instanceInfo: this.instanceInfo,
      mostFrequent: []
    };

    for (const [key, info] of this.errors) {
      stats.totalErrors += info.count;
      const [errorName] = key.split(':');
      
      stats.errorTypes[errorName] = (stats.errorTypes[errorName] || 0) + info.count;
      
      stats.mostFrequent.push({
        key,
        count: info.count,
        firstSeen: info.firstSeen,
        lastSeen: info.lastSeen
      });
    }

    // Sort most frequent errors
    stats.mostFrequent.sort((a, b) => b.count - a.count);
    stats.mostFrequent = stats.mostFrequent.slice(0, 5);

    return stats;
  }

  /**
   * Clear error history
   */
  clearErrors() {
    this.errors.clear();
  }

  /**
   * Generate unique key for an error
   * @private
   * @param {Error} error - Error object
   * @returns {string} Error key
   */
  getErrorKey(error) {
    return `${error.name}:${error.message}`;
  }

  /**
   * Log error statistics
   */
  logErrorStats() {
    const stats = this.getErrorStats();
    logger.info('Error statistics', { stats });
  }

  /**
   * Create error handler function
   * @param {string} context - Context identifier for the error handler
   * @returns {Function} Error handler function
   */
  createErrorHandler(context) {
    return (error) => {
      this.reportError(error, { context });
    };
  }

  /**
   * Wrap an async function with error reporting
   * @template T
   * @param {Function} fn - Function to wrap
   * @param {string} context - Context identifier
   * @returns {Function} Wrapped function
   */
  wrapAsync(fn, context) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.reportError(error, { context, args });
        throw error;
      }
    };
  }
}

// Export singleton instance
module.exports = new ErrorReportingService();