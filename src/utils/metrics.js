const os = require('os');
const logger = require('../logger');

/**
 * Class for collecting and reporting bot metrics
 */
class Metrics {
  constructor() {
    this.reset();
    this.startTime = this._getNow();
    this.lastCpuUsage = process.cpuUsage();
    this.lastResourceCheck = this._getNow();
    this.queueSizeLimit = 100; // Keep last 100 queue size readings
    this.resourceMetricLimit = 24; // Keep last 24 resource metrics
  }

  /**
   * Reset all metrics counters
   */
  reset() {
    this.tweetsProcessed = 0;
    this.tweetsFavorited = 0;
    this.tweetsSkipped = 0;
    this.apiErrors = 0;
    this.streamDisconnects = 0;
    this.retryAttempts = 0;
    this.queueSizes = [];
    this.processingTimes = [];
    this.resourceMetrics = [];
  }

  /**
   * Record tweet processing attempt
   */
  incrementTweetsProcessed() {
    this.tweetsProcessed++;
  }

  /**
   * Record successful tweet favorite
   */
  incrementTweetsFavorited() {
    this.tweetsFavorited++;
  }

  /**
   * Record skipped tweet
   */
  incrementTweetsSkipped() {
    this.tweetsSkipped++;
  }

  /**
   * Record API error
   */
  incrementApiErrors() {
    this.apiErrors++;
  }

  /**
   * Record stream disconnect
   */
  incrementStreamDisconnects() {
    this.streamDisconnects++;
  }

  /**
   * Record retry attempt
   */
  incrementRetryAttempts() {
    this.retryAttempts++;
  }

  /**
   * Record current queue size
   * @param {number} size - Current queue size
   */
  recordQueueSize(size) {
    this.queueSizes.push(size);
    if (this.queueSizes.length > this.queueSizeLimit) {
      this.queueSizes.shift();
    }
  }

  /**
   * Record processing time for a batch of tweets
   * @param {number} timeMs - Processing time in milliseconds
   */
  recordProcessingTime(timeMs) {
    this.processingTimes.push(timeMs);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }
  }

  /**
   * Collect system resource metrics
   * @private
   */
  collectResourceMetrics() {
    const now = this._getNow();
    const elapsedMs = now - this.lastResourceCheck;

    // Only collect every 60 seconds
    if (elapsedMs < 60000) {
      return false;
    }

    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    const cpuUsagePercent = (
      (currentCpuUsage.user + currentCpuUsage.system) /
      (elapsedMs * 1000) * 100
    ).toFixed(2);

    const memoryUsage = process.memoryUsage();
    const resourceMetric = {
      timestamp: now,
      cpu: {
        usage: parseFloat(cpuUsagePercent),
        cores: os.cpus().length
      },
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
        heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)),
        rss: Math.round(memoryUsage.rss / (1024 * 1024)),
        external: Math.round(memoryUsage.external / (1024 * 1024))
      },
      system: {
        totalMemory: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemory: Math.round(os.freemem() / (1024 * 1024)),
        uptime: Math.round(os.uptime()),
        loadAvg: os.loadavg()
      }
    };

    this.resourceMetrics.push(resourceMetric);
    if (this.resourceMetrics.length > this.resourceMetricLimit) {
      this.resourceMetrics.shift();
    }

    this.lastCpuUsage = process.cpuUsage();
    this.lastResourceCheck = now;

    // Log resource metrics
    logger.info('Resource metrics', { metrics: resourceMetric });

    return true;
  }

  /**
   * Get metrics report
   * @returns {Object} Current metrics
   */
  getMetrics() {
    this.collectResourceMetrics();

    // Calculate queue size average using only the most recent 100 entries
    const recentQueueSizes = this.queueSizes.slice(-100);
    const avgQueueSize = recentQueueSizes.length > 0
      ? Math.round(recentQueueSizes.reduce((a, b) => a + b, 0) / recentQueueSizes.length)
      : 0;

    const avgProcessingTime = this.processingTimes.length > 0
      ? Math.round(this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length)
      : 0;

    return {
      runtime: {
        uptime: Math.floor((this._getNow() - this.startTime) / 1000),
        startTime: new Date(this.startTime).toISOString()
      },
      tweets: {
        processed: this.tweetsProcessed,
        favorited: this.tweetsFavorited,
        skipped: this.tweetsSkipped,
        avgQueueSize,
        avgProcessingTime
      },
      errors: {
        apiErrors: this.apiErrors,
        streamDisconnects: this.streamDisconnects,
        retryAttempts: this.retryAttempts
      },
      resources: this.resourceMetrics.length > 0
        ? this.resourceMetrics[this.resourceMetrics.length - 1]
        : null
    };
  }

  /**
   * Log current metrics
   */
  logMetrics() {
    const metrics = this.getMetrics();
    logger.info('Current metrics', { metrics });
  }

  /**
   * Get mockable date for tests
   * @private
   * @returns {number} Current timestamp
   */
  _getMockableDate() {
    return Date.now();
  }

  /**
   * Get current timestamp, allowing test mocking
   * @private
   * @returns {number} Current timestamp
   */
  _getNow() {
    return Date.now();
  }
}

// Export singleton instance
module.exports = new Metrics();