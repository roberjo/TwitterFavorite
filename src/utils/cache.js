/**
 * LRU Cache implementation for tweet processing
 */
class TweetCache {
  /**
   * Creates a new TweetCache instance
   * @param {number} maxSize - Maximum number of items to store in cache
   */
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Add a tweet to the cache
   * @param {string} tweetId - ID of the tweet
   * @param {Object} data - Tweet data to cache
   */
  set(tweetId, data) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry when cache is full
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(tweetId, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get a tweet from the cache
   * @param {string} tweetId - ID of the tweet to retrieve
   * @returns {Object|null} Tweet data or null if not found
   */
  get(tweetId) {
    const entry = this.cache.get(tweetId);
    if (!entry) return null;
    return entry.data;
  }

  /**
   * Check if a tweet exists in the cache
   * @param {string} tweetId - ID of the tweet to check
   * @returns {boolean} Whether the tweet is cached
   */
  has(tweetId) {
    return this.cache.has(tweetId);
  }

  /**
   * Remove expired entries from the cache
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanup(maxAge) {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get the current size of the cache
   * @returns {number} Number of items in cache 
   */
  size() {
    return this.cache.size;
  }

  /**
   * Clear all entries from the cache
   */
  clear() {
    this.cache.clear();
  }
}

// Export singleton instance
module.exports = new TweetCache();