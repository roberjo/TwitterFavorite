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
  }

  /**
   * Starts a Twitter stream for given search terms
   * @param {string[]} searchSymbols - Array of search terms to track
   * @returns {Promise<Object>} Twitter stream object
   * @throws {Error} When stream creation fails
   */
  async startStream(searchSymbols) {
    try {
      const stream = this.client.stream('statuses/filter', { track: searchSymbols });
      this.setupStreamHandlers(stream);
      return stream;
    } catch (error) {
      logger.error('Failed to start Twitter stream', { error: error.message });
      throw error;
    }
  }

  /**
   * Sets up event handlers for the Twitter stream
   * @param {Object} stream - Twitter stream object
   * @private
   */
  setupStreamHandlers(stream) {
    stream.on('tweet', (tweet) => this.handleIncomingTweet(tweet));
    stream.on('error', (error) => {
      logger.error('Twitter stream error', { error: error.message });
    });
    stream.on('disconnect', (disconnectMessage) => {
      logger.warn('Twitter stream disconnected', { message: disconnectMessage });
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
      if (!this.isValidTweet(tweet)) {
        return;
      }

      const text = tweet.text.toLowerCase();
      if (this.shouldProcessTweet(tweet, text)) {
        logger.info('Processing tweet', {
          tweetId: tweet.id_str,
          username: tweet.user.screen_name
        });
        this.tweetQueue.push(tweet);
      }
    } catch (error) {
      logger.error('Error processing tweet', {
        error: error.message,
        tweetId: tweet?.id_str
      });
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
    try {
      const result = await this.client.post('favorites/create', { id: tweetId });
      logger.info('Successfully favorited tweet', { tweetId });
      return result;
    } catch (error) {
      logger.error('Failed to favorite tweet', {
        error: error.message,
        tweetId
      });
      throw error;
    }
  }
}

module.exports = TwitterService;