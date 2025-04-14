/**
 * @typedef {Object} TwitterConfig
 * @property {Object} twitterKeys - Twitter API authentication keys
 * @property {string} twitterKeys.consumer_key - Twitter API consumer key
 * @property {string} twitterKeys.consumer_secret - Twitter API consumer secret
 * @property {string} twitterKeys.access_token - Twitter API access token
 * @property {string} twitterKeys.access_token_secret - Twitter API access token secret
 * @property {Object} twitterConfig - Twitter bot configuration
 * @property {string} twitterConfig.language - Target language for tweets
 */

const Twit = require('twit');
const logger = require('../logger');
const isReply = require('../helpers/isReply');
const LanguageDetect = require('languagedetect');
const metrics = require('../utils/metrics');
const tweetCache = require('../utils/cache');
const rateLimiter = require('../utils/twitterRateLimiter');
const { retryWithBackoff } = require('../utils/retryWithBackoff');
const errorReporting = require('./ErrorReportingService');

const ONE_HOUR = 60 * 60 * 1000; // Define constant at module level

/**
 * Service class for handling Twitter API interactions
 * @class TwitterService
 */
class TwitterService {
  /**
   * Creates an instance of TwitterService
   * @param {TwitterConfig} config - Configuration object for Twitter API
   */
  constructor(config) {
    this.client = new Twit(config.twitterKeys);
    this.config = config.twitterConfig;
    this.lngDetector = new LanguageDetect();
    this.tweetQueue = [];
    
    // Start cache cleanup interval
    setInterval(() => {
      tweetCache.cleanup(ONE_HOUR);
    }, ONE_HOUR);

    // Configure retry settings for API calls
    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 30000,
      shouldRetry: (error) => {
        // Don't retry if rate limited, handle that separately
        if (error.code === 88) return false;
        
        return (
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.statusCode === 503
        );
      }
    };

    // Wrap API methods with error reporting
    this.startStream = errorReporting.wrapAsync(this.startStream.bind(this), 'twitter-stream');
    this.favoriteTweet = errorReporting.wrapAsync(this.favoriteTweet.bind(this), 'favorite-tweet');
  }

  /**
   * Starts a Twitter stream for given search terms
   * @param {string[]} searchSymbols - Array of search terms to track
   * @returns {Promise<Object>} Twitter stream object
   * @throws {Error} When stream creation fails
   */
  async startStream(searchSymbols) {
    return retryWithBackoff(async () => {
      try {
        if (rateLimiter.isRateLimited('statuses/filter')) {
          const resetTime = rateLimiter.getResetTime('statuses/filter');
          logger.warn('Stream creation rate limited', { resetInMs: resetTime });
          await new Promise(resolve => setTimeout(resolve, resetTime));
        }

        const stream = this.client.stream('statuses/filter', { track: searchSymbols });
        rateLimiter.recordCall('statuses/filter');
        this.setupStreamHandlers(stream);
        return stream;
      } catch (error) {
        errorReporting.reportError(error, { 
          operation: 'startStream',
          searchSymbols 
        });
        throw error;
      }
    }, this.retryConfig);
  }

  /**
   * Sets up event handlers for the Twitter stream
   * @param {Object} stream - Twitter stream object
   * @private
   */
  setupStreamHandlers(stream) {
    const errorHandler = errorReporting.createErrorHandler('stream-error');
    const disconnectHandler = errorReporting.createErrorHandler('stream-disconnect');

    stream.on('tweet', (tweet) => this.handleIncomingTweet(tweet));
    stream.on('error', (error) => {
      errorHandler(error);
      metrics.incrementApiErrors();
    });
    stream.on('disconnect', (disconnectMessage) => {
      disconnectHandler(new Error('Stream disconnected: ' + disconnectMessage));
      metrics.incrementStreamDisconnects();
    });
    stream.on('connect', () => {
      logger.info('Attempting to connect to Twitter stream');
    });
    stream.on('connected', () => {
      logger.info('Successfully connected to Twitter stream');
    });
  }

  /**
   * Processes an incoming tweet from the stream
   * @param {Object} tweet - Twitter status object
   * @returns {Promise<void>}
   * @private
   */
  async handleIncomingTweet(tweet) {
    try {
      // Check cache first
      if (tweetCache.has(tweet.id_str)) {
        metrics.incrementTweetsSkipped();
        logger.debug('Tweet already processed', { tweetId: tweet.id_str });
        return;
      }

      if (!this.isValidTweet(tweet)) {
        metrics.incrementTweetsSkipped();
        return;
      }

      const text = tweet.text.toLowerCase();
      if (this.shouldProcessTweet(tweet, text)) {
        logger.info('Processing tweet', {
          tweetId: tweet.id_str,
          username: tweet.user.screen_name
        });
        
        // Add to cache before queueing
        tweetCache.set(tweet.id_str, {
          processed: false,
          timestamp: Date.now()
        });
        
        this.tweetQueue.push(tweet);
      } else {
        metrics.incrementTweetsSkipped();
      }
    } catch (error) {
      errorReporting.reportError(error, {
        operation: 'handleIncomingTweet',
        tweetId: tweet?.id_str
      });
      metrics.incrementApiErrors();
    }
  }

  /**
   * Checks if a tweet is valid for processing
   * @param {Object} tweet - Twitter status object
   * @returns {boolean} Whether the tweet is valid
   * @private
   */
  isValidTweet(tweet) {
    return tweet?.text && !isReply(tweet);
  }

  /**
   * Determines if a tweet should be processed based on various criteria
   * @param {Object} tweet - Twitter status object
   * @param {string} text - Lowercase tweet text
   * @returns {boolean} Whether the tweet should be processed
   * @private
   */
  shouldProcessTweet(tweet, text) {
    if (!this.isEnglishTweet(text)) {
      return false;
    }

    return (
      tweet.retweeted_status !== 'undefined' &&
      !text.startsWith('rt ') &&
      !tweet.favorited &&
      tweet.user.following === null &&
      tweet.user.followers_count > 50 &&
      !this.isBlockedUser(tweet.user.screen_name)
    );
  }

  /**
   * Checks if tweet text is in English
   * @param {string} text - Tweet text to analyze
   * @returns {boolean} Whether the tweet is in English
   * @private
   */
  isEnglishTweet(text) {
    const languageResults = this.lngDetector.detect(text);
    if (!languageResults || languageResults.length < 3) {
      return false;
    }
    
    return languageResults.slice(0, 3).some(([lang]) => lang === this.config.language);
  }

  /**
   * Checks if a username is in the blocked users list
   * @param {string} username - Twitter username to check
   * @returns {boolean} Whether the user is blocked
   * @private
   */
  isBlockedUser(username) {
    const blockedUsers = ['dailyJsPackages', 'NutKacPI'];
    return blockedUsers.includes(username);
  }

  /**
   * Favorites a tweet using the Twitter API
   * @param {string} tweetId - ID of the tweet to favorite
   * @returns {Promise<Object>} Twitter API response
   * @throws {Error} When favoriting fails
   */
  async favoriteTweet(tweetId) {
    return retryWithBackoff(async () => {
      try {
        const cachedTweet = tweetCache.get(tweetId);
        if (cachedTweet && cachedTweet.processed) {
          logger.warn('Attempting to favorite already processed tweet', { tweetId });
          return null;
        }

        if (rateLimiter.isRateLimited('favorites/create')) {
          const resetTime = rateLimiter.getResetTime('favorites/create');
          logger.warn('Favorite action rate limited', { 
            tweetId,
            resetInMs: resetTime 
          });
          // Add to queue for retry
          this.tweetQueue.unshift({ id_str: tweetId });
          return null;
        }

        const result = await this.client.post('favorites/create', { id: tweetId });
        rateLimiter.recordCall('favorites/create');
        
        // Update rate limits from response headers
        if (result.resp && result.resp.headers) {
          rateLimiter.updateFromHeaders('favorites/create', result.resp.headers);
        }

        // Update cache to mark as processed
        tweetCache.set(tweetId, {
          processed: true,
          timestamp: Date.now()
        });
        
        logger.info('Successfully favorited tweet', { tweetId });
        metrics.incrementTweetsFavorited();
        return result;
      } catch (error) {
        if (error.code === 88) { // Rate limit exceeded
          rateLimiter.updateFromHeaders('favorites/create', error.twitterReply.headers);
          // Re-add to queue for retry
          this.tweetQueue.unshift({ id_str: tweetId });
          logger.warn('Rate limit exceeded while favoriting', { tweetId });
          return null;
        }
        errorReporting.reportError(error, {
          operation: 'favoriteTweet',
          tweetId
        });
        throw error;
      }
    }, this.retryConfig);
  }

  /**
   * Clears the tweet queue
   */
  clearQueue() {
    this.tweetQueue = [];
  }
}

module.exports = TwitterService;