const config = require('./config');
const logger = require('./logger');
const TwitterService = require('./services/TwitterService');
const os = require('os');

/**
 * @typedef {Object} Intervals
 * @property {number} FIVE_MINUTES - 5 minute interval in milliseconds
 * @property {number} TWO_MINUTES - 2 minute interval in milliseconds
 * @property {number} ONE_MINUTE - 1 minute interval in milliseconds
 */

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

/** @type {Intervals} Time intervals in milliseconds */
const INTERVALS = {
  FIVE_MINUTES: 5 * 60 * 1000,
  TWO_MINUTES: 2 * 60 * 1000,
  ONE_MINUTE: 1 * 60 * 1000
};

/**
 * Main bot class for managing Twitter interactions
 * @class TwitterBot
 */
class TwitterBot {
  /**
   * Creates an instance of TwitterBot
   */
  constructor() {
    this.twitterService = new TwitterService(config);
    this.currentTweetStreams = 0;
    this.stream = null;
    this.isProcessing = false;
  }

  /**
   * Starts the Twitter bot
   * @returns {Promise<void>}
   * @throws {Error} When startup fails
   */
  async start() {
    try {
      logger.info('Starting TwitterFavorite bot');
      await this.startTweetCollector(INTERVALS.ONE_MINUTE);
      this.startTweetProcessor();
    } catch (error) {
      logger.error('Failed to start TwitterFavorite bot', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Starts collecting tweets from Twitter stream
   * @param {number} timeInterval - Interval to run collector
   * @returns {Promise<void>}
   * @throws {Error} When collector fails to start
   */
  async startTweetCollector(timeInterval) {
    try {
      if (this.currentTweetStreams === 0) {
        logger.info('Starting tweet collector');
        this.stream = await this.twitterService.startStream(searchSymbols);
        this.currentTweetStreams++;
        logger.info(`Tweet stream started. Current streams: ${this.currentTweetStreams}`);
      }

      setTimeout(() => {
        this.killTweetCollector(INTERVALS.FIVE_MINUTES);
      }, timeInterval);
    } catch (error) {
      logger.error('Error in tweet collector', { error: error.message });
      throw error;
    }
  }

  /**
   * Stops the tweet collector stream
   * @param {number} timeInterval - Interval to wait before restarting
   */
  killTweetCollector(timeInterval) {
    logger.info(`Killing stream. Current streams: ${this.currentTweetStreams}`);
    if (this.stream) {
      this.stream.stop();
      this.currentTweetStreams--;
      logger.info(`Stream killed. Current streams: ${this.currentTweetStreams}`);
    }

    setTimeout(() => {
      this.startTweetCollector(INTERVALS.ONE_MINUTE);
    }, timeInterval);
  }

  /**
   * Starts the tweet processing loop
   */
  startTweetProcessor() {
    const processTweets = async () => {
      if (this.isProcessing) {
        logger.warn('Tweet processor already running, skipping this cycle');
        return;
      }

      this.isProcessing = true;
      try {
        const tweetQueue = this.twitterService.tweetQueue;
        const queueLength = tweetQueue.length;
        logger.info(`Processing tweets. Queue size: ${queueLength}`);

        let processedCount = 0;
        for (let i = queueLength - 1; i >= 0; i--) {
          const tweet = tweetQueue[i];
          const tweetAge = this.getTweetAge(tweet);

          if (tweetAge > 30) {
            processedCount++;
            tweetQueue.splice(i, 1);
            await this.twitterService.favoriteTweet(tweet.id_str);
          }
        }

        logger.info(`Processed ${processedCount} of ${queueLength} tweets`);
      } catch (error) {
        logger.error('Error in tweet processor', { error: error.message });
      } finally {
        this.isProcessing = false;
      }

      setTimeout(processTweets, INTERVALS.TWO_MINUTES);
    };

    setTimeout(processTweets, 30000);
  }

  /**
   * Calculates age of tweet in seconds
   * @param {Object} tweet - Tweet object
   * @returns {number} Age of tweet in seconds
   */
  getTweetAge(tweet) {
    const tweetDate = new Date(tweet.created_at);
    return (Date.now() - tweetDate.getTime()) / 1000;
  }

  /**
   * Gracefully stops the bot
   */
  async stop() {
    logger.info('Stopping TwitterFavorite bot');
    if (this.stream) {
      this.stream.stop();
      this.currentTweetStreams = 0;
    }
  }
}

// Export the TwitterBot class
module.exports = { TwitterBot };

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new TwitterBot();
  bot.start().catch(error => {
    logger.error('Fatal error starting bot', { error: error.message });
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await bot.stop();
    process.exit(0);
  });
}

