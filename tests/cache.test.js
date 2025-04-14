const tweetCache = require('../src/utils/cache');

describe('TweetCache', () => {
  beforeEach(() => {
    tweetCache.clear();
  });

  describe('basic operations', () => {
    it('should store and retrieve tweets', () => {
      const tweet = { id: '123', text: 'test tweet' };
      tweetCache.set('123', tweet);
      
      expect(tweetCache.get('123')).toEqual(tweet);
    });

    it('should check existence of tweets', () => {
      tweetCache.set('123', { text: 'test' });
      
      expect(tweetCache.has('123')).toBe(true);
      expect(tweetCache.has('456')).toBe(false);
    });

    it('should track cache size', () => {
      expect(tweetCache.size()).toBe(0);
      
      tweetCache.set('123', { text: 'test1' });
      tweetCache.set('456', { text: 'test2' });
      
      expect(tweetCache.size()).toBe(2);
    });

    it('should clear all entries', () => {
      tweetCache.set('123', { text: 'test1' });
      tweetCache.set('456', { text: 'test2' });
      tweetCache.clear();
      
      expect(tweetCache.size()).toBe(0);
    });
  });

  describe('cache limits', () => {
    it('should respect maximum size limit', () => {
      const cache = new (require('../src/utils/cache').constructor)(2);
      
      cache.set('1', { text: 'one' });
      cache.set('2', { text: 'two' });
      cache.set('3', { text: 'three' });
      
      expect(cache.size()).toBe(2);
      expect(cache.has('1')).toBe(false);
      expect(cache.has('3')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      // Mock Date.now
      const realDateNow = Date.now;
      const startTime = 1000000;
      global.Date.now = jest.fn()
        .mockReturnValueOnce(startTime)              // First set
        .mockReturnValueOnce(startTime + 100)        // Second set
        .mockReturnValueOnce(startTime + 2000)       // Cleanup check
        .mockReturnValueOnce(startTime + 2000);      // Final size check
      
      tweetCache.set('old', { text: 'old tweet' });
      tweetCache.set('new', { text: 'new tweet' });
      
      tweetCache.cleanup(1000); // Clean items older than 1 second
      
      expect(tweetCache.size()).toBe(1);
      expect(tweetCache.has('old')).toBe(false);
      expect(tweetCache.has('new')).toBe(true);

      // Restore original Date.now
      global.Date.now = realDateNow;
    });
  });
});