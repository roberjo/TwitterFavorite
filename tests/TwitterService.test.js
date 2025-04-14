const TwitterService = require('../src/services/TwitterService');
const tweetCache = require('../src/utils/cache');
const metrics = require('../src/utils/metrics');

jest.mock('../src/logger');
jest.mock('../src/utils/cache');
jest.mock('../src/utils/metrics');
jest.mock('../src/services/ErrorReportingService');
jest.mock('twit');

describe('TwitterService', () => {
  let twitterService;
  const testConfig = {
    twitterKeys: {
      consumer_key: 'test_key',
      consumer_secret: 'test_secret',
      access_token: 'test_token',
      access_token_secret: 'test_token_secret'
    },
    twitterConfig: {
      language: 'english'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    twitterService = new TwitterService(testConfig);
  });

  describe('isValidTweet', () => {
    it('should return false for undefined tweet', () => {
      expect(twitterService.isValidTweet(undefined)).toBeFalsy();
    });

    it('should return false for tweet without text', () => {
      expect(twitterService.isValidTweet({})).toBeFalsy();
    });

    it('should return true for valid tweet', () => {
      const tweet = {
        text: 'Valid tweet',
        id_str: '123'
      };
      expect(twitterService.isValidTweet(tweet)).toBeTruthy();
    });
  });

  describe('shouldProcessTweet', () => {
    it('should return false for non-English tweet', () => {
      twitterService.isEnglishTweet = jest.fn().mockReturnValue(false);
      expect(twitterService.shouldProcessTweet({}, '')).toBeFalsy();
    });

    it('should return false for blocked user', () => {
      twitterService.isEnglishTweet = jest.fn().mockReturnValue(true);
      const tweet = {
        user: {
          screen_name: 'dailyJsPackages',
          followers_count: 100
        }
      };
      expect(twitterService.shouldProcessTweet(tweet, '')).toBeFalsy();
    });

    it('should return true for valid tweet', () => {
      const tweet = {
        id_str: '123',
        text: 'valid tweet',
        user: {
          screen_name: 'testuser',
          followers_count: 100,
          following: null
        },
        favorited: false,
        retweeted_status: 'undefined'
      };

      expect(twitterService.shouldProcessTweet(tweet, tweet.text.toLowerCase())).toBeTruthy();
    });
  });

  describe('handleIncomingTweet', () => {
    it('should skip already cached tweets', async () => {
      const tweet = {
        id_str: '123',
        text: 'Test tweet'
      };

      tweetCache.has.mockReturnValue(true);
      await twitterService.handleIncomingTweet(tweet);

      expect(metrics.incrementTweetsSkipped).toHaveBeenCalled();
      expect(twitterService.tweetQueue.length).toBe(0);
    });

    it('should cache and queue valid tweets', async () => {
      const tweet = {
        id_str: '123',
        text: 'valid tweet',
        user: {
          screen_name: 'testuser',
          followers_count: 100,
          following: null
        },
        favorited: false,
        retweeted_status: 'undefined'
      };

      tweetCache.has.mockReturnValue(false);
      tweetCache.set.mockImplementation(() => {});

      await twitterService.handleIncomingTweet(tweet);

      expect(tweetCache.set).toHaveBeenCalledWith('123', expect.any(Object));
      expect(twitterService.tweetQueue.length).toBe(1);
    });
  });

  describe('favoriteTweet', () => {
    it('should skip already processed tweets', async () => {
      tweetCache.get.mockReturnValue({ processed: true });
      
      const result = await twitterService.favoriteTweet('123');
      
      expect(result).toBeNull();
      expect(twitterService.client.post).not.toHaveBeenCalled();
    });

    it('should favorite and update cache for new tweets', async () => {
      const mockResponse = { data: 'success' };
      tweetCache.get.mockReturnValue({ processed: false });
      twitterService.client.post = jest.fn().mockResolvedValue(mockResponse);

      const result = await twitterService.favoriteTweet('123');

      expect(result).toEqual(mockResponse);
      expect(tweetCache.set).toHaveBeenCalledWith('123', expect.objectContaining({
        processed: true
      }));
      expect(metrics.incrementTweetsFavorited).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      twitterService.client.post.mockRejectedValue(error);

      await expect(twitterService.favoriteTweet('123')).rejects.toThrow('API Error');
      expect(metrics.incrementApiErrors).toHaveBeenCalled();
    });
  });

  describe('stream management', () => {
    it('should set up stream handlers correctly', async () => {
      const mockStream = {
        on: jest.fn()
      };
      twitterService.client.stream.mockReturnValue(mockStream);

      await twitterService.startStream(['test']);

      expect(mockStream.on).toHaveBeenCalledWith('tweet', expect.any(Function));
      expect(mockStream.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockStream.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should handle stream errors', async () => {
      const error = new Error('Stream Error');
      twitterService.client.stream.mockImplementation(() => {
        throw error;
      });

      await expect(twitterService.startStream(['test'])).rejects.toThrow('Stream Error');
      expect(metrics.incrementApiErrors).toHaveBeenCalled();
    });
  });

  describe('cache cleanup', () => {
    it('should set up cache cleanup interval', () => {
      jest.useFakeTimers();
      new TwitterService(testConfig);

      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
      expect(tweetCache.cleanup).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});