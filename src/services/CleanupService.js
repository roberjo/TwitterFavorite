const logger = require('../logger');
const metrics = require('../utils/metrics');
const DataPersistenceService = require('./DataPersistenceService');

class CleanupService {
  constructor(options = {}) {
    this.cleanupHandlers = new Set();
    this.intervals = new Set();
    this.isShuttingDown = false;
    this.dataPersistence = new DataPersistenceService(options.persistenceConfig);

    // Default intervals
    this.cacheCleanupInterval = options.cacheCleanupInterval || 300000; // 5 minutes
    this.metricsRotationInterval = options.metricsRotationInterval || 86400000; // 24 hours

    this.setupSignalHandlers();
  }

  start() {
    // Start periodic cache cleanup
    const cacheInterval = setInterval(() => {
      this.runNow().catch(error => {
        logger.error('Periodic cleanup failed', { error });
      });
    }, this.cacheCleanupInterval);
    this.intervals.add(cacheInterval);

    // Start periodic metrics rotation
    const metricsInterval = setInterval(() => {
      metrics.logMetrics();
      this.dataPersistence.saveMetrics(metrics.getMetrics())
        .catch(error => {
          logger.error('Failed to save metrics', { error });
        });
    }, this.metricsRotationInterval);
    this.intervals.add(metricsInterval);

    logger.info('Cleanup service started', {
      cacheInterval: this.cacheCleanupInterval,
      metricsInterval: this.metricsRotationInterval
    });
  }

  stop() {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
    logger.info('Cleanup service stopped');
  }

  async runNow() {
    try {
      const cacheSize = tweetCache.size();
      await tweetCache.cleanup(3600000); // Clean tweets older than 1 hour
      const newSize = tweetCache.size();
      
      if (newSize < cacheSize) {
        logger.info('Cache cleanup completed', {
          before: cacheSize,
          after: newSize,
          removed: cacheSize - newSize
        });
      }

      metrics.logMetrics();
    } catch (error) {
      logger.error('Immediate cleanup failed', { error });
      throw new Error('Cleanup failed');
    }
  }

  /**
   * Register a cleanup handler to be called during shutdown
   * @param {Function} handler - Async function to be called during cleanup
   * @param {string} name - Name of the handler for logging
   */
  registerCleanupHandler(handler, name) {
    this.cleanupHandlers.add({ handler, name });
    logger.debug(`Registered cleanup handler: ${name}`);
  }

  /**
   * Set up process signal handlers
   * @private
   */
  setupSignalHandlers() {
    // Handle normal termination signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      this.shutdown('unhandledRejection');
    });
  }

  /**
   * Perform graceful shutdown
   * @param {string} signal - The signal that triggered the shutdown
   * @private
   */
  async shutdown(signal) {
    if (this.isShuttingDown) {
      logger.info('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Starting graceful shutdown: ${signal}`);

    try {
      // Save final metrics
      const finalMetrics = metrics.getMetrics();
      await this.dataPersistence.saveMetrics(finalMetrics);

      // Execute all cleanup handlers
      const cleanupPromises = Array.from(this.cleanupHandlers).map(async ({ handler, name }) => {
        try {
          logger.debug(`Running cleanup handler: ${name}`);
          await handler();
          logger.debug(`Completed cleanup handler: ${name}`);
        } catch (error) {
          logger.error(`Error in cleanup handler ${name}`, { error });
        }
      });

      // Wait for all cleanup handlers with timeout
      await Promise.race([
        Promise.all(cleanupPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Cleanup timeout')), 5000)
        )
      ]);

      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown', { error });
    } finally {
      // Force exit after cleanup
      process.exit(1);
    }
  }

  /**
   * Check if shutdown is in progress
   * @returns {boolean}
   */
  isShuttingDown() {
    return this.isShuttingDown;
  }
}

module.exports = CleanupService;