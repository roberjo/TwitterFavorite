const logger = require('../logger');

/**
 * Configuration for retry behavior
 * @typedef {Object} RetryConfig
 * @property {number} maxRetries - Maximum number of retry attempts
 * @property {number} initialDelay - Initial delay in milliseconds
 * @property {number} maxDelay - Maximum delay in milliseconds
 * @property {Function} shouldRetry - Function to determine if error is retryable
 */

/**
 * Default retry configuration
 * @type {RetryConfig}
 */
const defaultConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 60000,
  shouldRetry: (error) => {
    // Retry on network errors or rate limits
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 88 || // Twitter rate limit
      error.statusCode === 429 ||
      error.statusCode === 503
    );
  }
};

/**
 * Executes a function with exponential backoff retry logic
 * @template T
 * @param {Function} fn - Function to execute
 * @param {Partial<RetryConfig>} [config] - Retry configuration
 * @returns {Promise<T>} - Result of the function
 */
async function retryWithBackoff(fn, config = {}) {
  const finalConfig = { ...defaultConfig, ...config };
  let lastError;
  
  for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;
      
      if (!finalConfig.shouldRetry(error) || attempt === finalConfig.maxRetries) {
        throw error;
      }

      const delay = Math.min(
        finalConfig.initialDelay * Math.pow(2, attempt - 1),
        finalConfig.maxDelay
      );

      logger.warn('Request failed, retrying', {
        attempt,
        nextRetryMs: delay,
        error: error.message
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Creates a retryable version of a function
 * @template T
 * @param {Function} fn - Function to make retryable
 * @param {Partial<RetryConfig>} [config] - Retry configuration
 * @returns {Function} - Retryable version of the function
 */
function makeRetryable(fn, config = {}) {
  return (...args) => retryWithBackoff(() => fn(...args), config);
}

module.exports = {
  retryWithBackoff,
  makeRetryable,
  defaultConfig
};