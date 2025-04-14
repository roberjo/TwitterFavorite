/**
 * Configuration validation utility
 * @module configValidator
 */

const logger = require('../logger');

/**
 * Validates Twitter API keys
 * @param {Object} twitterKeys - Twitter API keys configuration
 * @throws {Error} If any required keys are missing or invalid
 */
function validateTwitterKeys(twitterKeys) {
  const requiredKeys = [
    'consumer_key',
    'consumer_secret',
    'access_token',
    'access_token_secret',
  ];

  requiredKeys.forEach(key => {
    if (!twitterKeys[key]) {
      throw new Error(`Missing required Twitter API key: ${key}`);
    }
    if (typeof twitterKeys[key] !== 'string') {
      throw new Error(`Invalid Twitter API key type for ${key}`);
    }
  });
}

/**
 * Validates Twitter bot configuration
 * @param {Object} twitterConfig - Twitter bot configuration
 * @throws {Error} If any required configuration is missing or invalid
 */
function validateTwitterConfig(twitterConfig) {
  if (!twitterConfig.language) {
    throw new Error('Missing required language configuration');
  }

  if (typeof twitterConfig.language !== 'string') {
    throw new Error('Invalid language configuration type');
  }

  const numericFields = [
    'retweet_rate',
    'like_rate',
    'quote_rate',
    'search_count'
  ];

  numericFields.forEach(field => {
    const value = parseInt(twitterConfig[field]);
    if (isNaN(value) || value < 0) {
      throw new Error(`Invalid ${field} configuration: must be a positive number`);
    }
  });
}

/**
 * Validates entire configuration object
 * @param {Object} config - Complete configuration object
 * @throws {Error} If configuration is invalid
 */
function validateConfig(config) {
  if (!config) {
    throw new Error('Configuration object is required');
  }

  if (!config.twitterKeys || !config.twitterConfig) {
    throw new Error('Missing required configuration sections');
  }

  try {
    validateTwitterKeys(config.twitterKeys);
    validateTwitterConfig(config.twitterConfig);
    logger.info('Configuration validation successful');
  } catch (error) {
    logger.error('Configuration validation failed', { error: error.message });
    throw error;
  }
}

module.exports = {
  validateConfig,
  validateTwitterKeys,
  validateTwitterConfig,
};