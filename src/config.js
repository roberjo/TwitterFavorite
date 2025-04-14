const dotenv = require('dotenv');
const path = require('path');
const { validateConfig } = require('./utils/configValidator');

// Load environment variables from .env file
dotenv.config();

const config = {
  twitterKeys: {
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  },
  twitterConfig: {
    language: process.env.TWITTER_LANGUAGE || 'english'
  },
  dataDirectory: path.join(process.cwd(), process.env.DATA_DIRECTORY || 'data'),
  rateLimits: {
    favorites: parseInt(process.env.RATE_LIMIT_FAVORITES, 10) || 75,
    stream: parseInt(process.env.RATE_LIMIT_STREAM, 10) || 50
  },
  retryConfig: {
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
    initialDelay: parseInt(process.env.INITIAL_RETRY_DELAY, 10) || 2000,
    maxDelay: parseInt(process.env.MAX_RETRY_DELAY, 10) || 30000
  }
};

// Validate the configuration
const validatedConfig = validateConfig(config);

module.exports = validatedConfig;