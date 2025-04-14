const dotenv = require('dotenv');
const { validateConfig } = require('./utils/configValidator');
const logger = require('./logger');

// Load environment variables
const result = dotenv.config();
if (result.error) {
  logger.error('Failed to load .env file', { error: result.error.message });
  throw result.error;
}

const config = {
  twitterKeys: {
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    timeout_ms: parseInt(process.env.TWITTER_TIMEOUT, 10) * 1000
  },
  twitterConfig: {
    queryString: process.env.QUERY_STRING,
    resultType: process.env.RESULT_TYPE,
    language: process.env.LANGUAGE,
    username: process.env.TWITTER_USERNAME,
    retweet_rate: parseInt(process.env.TWITTER_RETWEET_RATE, 10),
    like_rate: parseInt(process.env.TWITTER_LIKE_RATE, 10),
    quote_rate: parseInt(process.env.TWITTER_QUOTE_RATE, 10),
    search_count: parseInt(process.env.TWITTER_SEARCH_COUNT, 10),
    randomReply: process.env.RANDOM_REPLY
  }
};

// Validate configuration
validateConfig(config);

module.exports = config;