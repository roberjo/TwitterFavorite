const logger = require('../logger');

/**
 * Class for collecting and reporting bot metrics
 */
class Metrics {
  constructor() {
    this.reset();
  }

  /**
   * Reset all metrics counters
   */
  reset() {
    this.metrics = {
      tweetsProcessed: 0,
      tweetsFavorited: 0,
      tweetsSkipped: 0,
      apiErrors: 0,
      streamDisconnects: 0,
      processingTime: [],
      queueSize: [],
      startTime: Date.now()
    };
  }

  /**
   * Record tweet processing attempt
   */
  incrementTweetsProcessed() {
    this.metrics.tweetsProcessed++;
  }

  /**
   * Record successful tweet favorite
   */
  incrementTweetsFavorited() {
    this.metrics.tweetsFavorited++;
  }

  /**
   * Record skipped tweet
   */
  incrementTweetsSkipped() {
    this.metrics.tweetsSkipped++;
  }

  /**
   * Record API error
   */
  incrementApiErrors() {
    this.metrics.apiErrors++;
  }

  /**
   * Record stream disconnect
   */
  incrementStreamDisconnects() {
    this.metrics.streamDisconnects++;
  }

  /**
   * Record processing time for a batch of tweets
   * @param {number} time - Processing time in milliseconds
   */
  recordProcessingTime(time) {
    this.metrics.processingTime.push(time);
    // Keep only last 100 measurements
    if (this.metrics.processingTime.length > 100) {
      this.metrics.processingTime.shift();
    }
  }

  /**
   * Record current queue size
   * @param {number} size - Current queue size
   */
  recordQueueSize(size) {
    this.metrics.queueSize.push(size);
    // Keep only last 100 measurements
    if (this.metrics.queueSize.length > 100) {
      this.metrics.queueSize.shift();
    }
  }

  /**
   * Calculate average processing time
   * @returns {number} Average processing time in milliseconds
   */
  getAverageProcessingTime() {
    if (this.metrics.processingTime.length === 0) return 0;
    const sum = this.metrics.processingTime.reduce((a, b) => a + b, 0);
    return sum / this.metrics.processingTime.length;
  }

  /**
   * Calculate average queue size
   * @returns {number} Average queue size
   */
  getAverageQueueSize() {
    if (this.metrics.queueSize.length === 0) return 0;
    const sum = this.metrics.queueSize.reduce((a, b) => a + b, 0);
    return sum / this.metrics.queueSize.length;
  }

  /**
   * Get metrics report
   * @returns {Object} Current metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.metrics.startTime;
    return {
      ...this.metrics,
      uptime,
      averageProcessingTime: this.getAverageProcessingTime(),
      averageQueueSize: this.getAverageQueueSize(),
      tweetsPerMinute: (this.metrics.tweetsProcessed / (uptime / 1000 / 60)).toFixed(2)
    };
  }

  /**
   * Log current metrics
   */
  logMetrics() {
    const metrics = this.getMetrics();
    logger.info('Bot Metrics', { metrics });
  }
}

// Export singleton instance
module.exports = new Metrics();