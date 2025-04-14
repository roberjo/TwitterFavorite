const config = require('./config');
const logger = require('./logger');
const TwitterService = require('./services/TwitterService');
const CleanupService = require('./services/CleanupService');
const DataPersistenceService = require('./services/DataPersistenceService');
const metrics = require('./utils/metrics');
const errorReporting = require('./services/ErrorReportingService');
const os = require('os');

// Configure UV_THREADPOOL_SIZE based on available CPUs
process.env.UV_THREADPOOL_SIZE = Math.min(os.cpus().length * 2, 128);
logger.info(`UV_THREADPOOL_SIZE set to ${process.env.UV_THREADPOOL_SIZE}`);

/** Search keywords for Twitter stream */
const searchSymbols = [
  'javascript',
  'angularjs',
  'node.js',
  '#php',
  'jquery',
  '#python',
  '#nodejs',
  'asp.net',
  'c#',
  'web api',
  'machine learning',
  'markov chain'
];

/** Time intervals in milliseconds */
const INTERVALS = {
  FIVE_MINUTES: 5 * 60 * 1000,
  TWO_MINUTES: 2 * 60 * 1000,
  ONE_MINUTE: 1 * 60 * 1000
};

/**
 * Main bot class for managing Twitter interactions
 */
class TwitterBot {
  constructor() {
    this.twitterService = new TwitterService(config);
    this.cleanupService = new CleanupService({
      cacheCleanupInterval: INTERVALS.FIVE_MINUTES,
      metricsRotationInterval: 24 * INTERVALS.FIVE_MINUTES
    });
    this.dataPersistence = new DataPersistenceService({
      dataDir: config.dataDirectory || 'data',
      keepFiles: 30 // Keep 30 days of history
    });
    this.currentTweetStreams = 0;
    this.stream = null;
    this.isProcessing = false;
    this.isShuttingDown = false;

    // Wrap critical methods with error reporting
    this.startTweetCollector = errorReporting.wrapAsync(
      this.startTweetCollector.bind(this),
      'tweet-collector'
    );
    
    this.processTweets = errorReporting.wrapAsync(
      this.processTweets.bind(this),
      'tweet-processor'
    );
  }

  async start() {
    try {
      logger.info('Starting TwitterFavorite bot');
      metrics.reset();
      
      // Start services
      this.cleanupService.start();
      
      // Load historical data
      await this.loadHistoricalData();
      
      await this.startTweetCollector(INTERVALS.ONE_MINUTE);
      this.startTweetProcessor();
      this.startMetricsReporter();
      
      // Setup graceful shutdown
      this.setupShutdownHandlers();
    } catch (error) {
      errorReporting.reportError(error, { phase: 'startup' });
      logger.error('Failed to start TwitterFavorite bot', { error: error.message });
      metrics.incrementApiErrors();
      await this.stop();
      throw error;
    }
  }

  async loadHistoricalData() {
    try {
      const [metricsHistory, errorHistory] = await Promise.all([
        this.dataPersistence.loadHistoricalMetrics(),
        this.dataPersistence.loadHistoricalErrorStats()
      ]);

      logger.info('Loaded historical data', {
        metricsFileCount: metricsHistory.length,
        errorStatsFileCount: errorHistory.length
      });

      // Analyze trends if we have historical data
      if (metricsHistory.length > 0) {
        const lastMetrics = metricsHistory[0].data;
        const prevMetrics = metricsHistory[1]?.data;
        
        if (prevMetrics) {
          const tweetsTrendPercent = ((lastMetrics.tweetsFavorited - prevMetrics.tweetsFavorited) / prevMetrics.tweetsFavorited) * 100;
          logger.info('Tweet engagement trend', {
            trend: `${tweetsTrendPercent.toFixed(2)}%`,
            period: '24h'
          });
        }
      }
    } catch (error) {
      errorReporting.reportError(error, { phase: 'historical-data-load' });
      logger.warn('Failed to load historical data', { error: error.message });
    }
  }

  setupShutdownHandlers() {
    const shutdownHandler = async (signal) => {
      logger.info(`Received ${signal} signal`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        errorReporting.reportError(error, { phase: 'shutdown', signal });
        process.exit(1);
      }
    };

    const errorHandler = async (error, type = 'uncaughtException') => {
      errorReporting.reportError(error, { phase: type });
      logger.error(`${type} occurred`, { error: error.message });
      try {
        await this.stop();
      } finally {
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('uncaughtException', (error) => errorHandler(error));
    process.on('unhandledRejection', (error) => errorHandler(error, 'unhandledRejection'));
  }

  async stop() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Stopping TwitterFavorite bot');

    try {
      // Stop tweet collection
      if (this.stream) {
        this.stream.stop();
        this.currentTweetStreams = 0;
      }

      // Save final metrics and error stats
      const currentMetrics = metrics.getMetrics();
      const currentErrorStats = errorReporting.getErrorStats();
      
      await Promise.all([
        this.dataPersistence.saveMetrics(currentMetrics),
        this.dataPersistence.saveErrorStats(currentErrorStats)
      ]);

      // Run final cleanup
      await this.cleanupService.runNow();
      
      // Stop cleanup service
      this.cleanupService.stop();
      
      // Log final statistics
      metrics.logMetrics();
      errorReporting.logErrorStats();
    } catch (error) {
      errorReporting.reportError(error, { phase: 'shutdown' });
      logger.error('Error during shutdown', { error: error.message });
      throw error;
    }
  }

  startMetricsReporter() {
    setInterval(async () => {
      try {
        // Get current statistics
        const currentMetrics = metrics.getMetrics();
        const currentErrorStats = errorReporting.getErrorStats();
        
        // Save to disk
        await Promise.all([
          this.dataPersistence.saveMetrics(currentMetrics),
          this.dataPersistence.saveErrorStats(currentErrorStats)
        ]);
        
        // Log current stats
        metrics.logMetrics();
        errorReporting.logErrorStats();
      } catch (error) {
        errorReporting.reportError(error, { phase: 'metrics-reporting' });
      }
    }, INTERVALS.FIVE_MINUTES);
  }

  async startTweetCollector(timeInterval) {
    try {
      if (this.currentTweetStreams === 0 && !this.isShuttingDown) {
        logger.info('Starting tweet collector');
        this.stream = await this.twitterService.startStream(searchSymbols);
        this.currentTweetStreams++;
        logger.info(`Tweet stream started. Current streams: ${this.currentTweetStreams}`);
      }

      if (!this.isShuttingDown) {
        setTimeout(() => {
          this.killTweetCollector(INTERVALS.FIVE_MINUTES);
        }, timeInterval);
      }
    } catch (error) {
      errorReporting.reportError(error, { 
        phase: 'tweet-collection',
        timeInterval 
      });
      logger.error('Error in tweet collector', { error: error.message });
      metrics.incrementApiErrors();
      throw error;
    }
  }

  killTweetCollector(timeInterval) {
    if (this.isShuttingDown) {
      return;
    }

    logger.info(`Killing stream. Current streams: ${this.currentTweetStreams}`);
    if (this.stream) {
      this.stream.stop();
      this.currentTweetStreams--;
      metrics.incrementStreamDisconnects();
      logger.info(`Stream killed. Current streams: ${this.currentTweetStreams}`);
    }

    setTimeout(() => {
      this.startTweetCollector(INTERVALS.ONE_MINUTE);
    }, timeInterval);
  }

  startTweetProcessor() {
    const processTweets = async () => {
      if (this.isShuttingDown) {
        return;
      }

      if (this.isProcessing) {
        logger.warn('Tweet processor already running, skipping this cycle');
        return;
      }

      this.isProcessing = true;
      const startTime = Date.now();
      try {
        const tweetQueue = this.twitterService.tweetQueue;
        const queueLength = tweetQueue.length;
        metrics.recordQueueSize(queueLength);
        logger.info(`Processing tweets. Queue size: ${queueLength}`);

        let processedCount = 0;
        for (let i = queueLength - 1; i >= 0 && !this.isShuttingDown; i--) {
          const tweet = tweetQueue[i];
          metrics.incrementTweetsProcessed();
          
          const tweetAge = this.getTweetAge(tweet);
          if (tweetAge > 30) {
            processedCount++;
            tweetQueue.splice(i, 1);
            await this.twitterService.favoriteTweet(tweet.id_str);
            metrics.incrementTweetsFavorited();
          } else {
            metrics.incrementTweetsSkipped();
          }
        }

        logger.info(`Processed ${processedCount} of ${queueLength} tweets`);
      } catch (error) {
        errorReporting.reportError(error, { phase: 'tweet-processing' });
        logger.error('Error in tweet processor', { error: error.message });
        metrics.incrementApiErrors();
      } finally {
        this.isProcessing = false;
        metrics.recordProcessingTime(Date.now() - startTime);
      }

      if (!this.isShuttingDown) {
        setTimeout(processTweets, INTERVALS.TWO_MINUTES);
      }
    };

    setTimeout(processTweets, 30000);
  }

  getTweetAge(tweet) {
    const tweetDate = new Date(tweet.created_at);
    return (Date.now() - tweetDate.getTime()) / 1000;
  }
}

module.exports = { TwitterBot };

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new TwitterBot();
  bot.start().catch(error => {
    errorReporting.reportError(error, { phase: 'main' });
    logger.error('Fatal error starting bot', { error: error.message });
    process.exit(1);
  });
}

