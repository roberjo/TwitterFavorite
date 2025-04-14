const TweetCache = require('../src/utils/cache');
const MockDate = require('mockdate');

describe('TweetCache', () => {
  let tweetCache;

  beforeEach(() => {
    tweetCache = require('../src/utils/cache');
    tweetCache.clear();
  });

  afterEach(() => {
    MockDate.reset();
  });

  describe('basic operations', () => {
    it('should store and retrieve tweets', () => {
      tweetCache.set('123', { processed: true });
      expect(tweetCache.get('123')).toEqual({ processed: true });
    });

    it('should check tweet existence', () => {
      tweetCache.set('123', { processed: true });
      expect(tweetCache.has('123')).toBe(true);
      expect(tweetCache.has('456')).toBe(false);
    });

    it('should maintain size limit', () => {
      const maxSize = 1000;
      for (let i = 0; i < maxSize + 10; i++) {
        tweetCache.set(i.toString(), { data: i });
      }
      expect(tweetCache.size()).toBeLessThanOrEqual(maxSize);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      // Set initial time
      MockDate.set('2025-04-13T00:00:00Z');
      
      // Add old tweet
      tweetCache.set('old', { data: 'old' });

      // Advance time by 2 seconds
      MockDate.set('2025-04-13T00:00:02Z');
      
      // Add new tweet
      tweetCache.set('new', { data: 'new' });

      // Clean items older than 1 second
      tweetCache.cleanup(1000);

      expect(tweetCache.size()).toBe(1);
      expect(tweetCache.has('old')).toBe(false);
      expect(tweetCache.has('new')).toBe(true);
    });

    it('should handle empty cache', () => {
      expect(() => tweetCache.cleanup(1000)).not.toThrow();
    });
  });
});