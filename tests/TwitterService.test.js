const TwitterService = require('../src/services/TwitterService');

// Mock the dependencies
jest.mock('twit');
jest.mock('../src/logger');
jest.mock('languagedetect');

describe('TwitterService', () => {
  let twitterService;
  const mockConfig = {
    twitterKeys: {
      consumer_key: 'test',
      consumer_secret: 'test',
      access_token: 'test',
      access_token_secret: 'test'
    },
    twitterConfig: {
      language: 'english'
    }
  };

  beforeEach(() => {
    twitterService = new TwitterService(mockConfig);
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
      twitterService.isEnglishTweet = jest.fn().mockReturnValue(true);
      const tweet = {
        user: {
          screen_name: 'validUser',
          following: null,
          followers_count: 100
        },
        favorited: false,
        retweeted_status: 'undefined'
      };
      expect(twitterService.shouldProcessTweet(tweet, 'valid tweet')).toBeTruthy();
    });
  });

  describe('favoriteTweet', () => {
    it('should successfully favorite a tweet', async () => {
      const mockResult = { data: 'success' };
      twitterService.client.post = jest.fn().mockResolvedValue(mockResult);

      const result = await twitterService.favoriteTweet('123');
      expect(result).toEqual(mockResult);
      expect(twitterService.client.post).toHaveBeenCalledWith('favorites/create', { id: '123' });
    });

    it('should handle errors when favoriting fails', async () => {
      const error = new Error('API Error');
      twitterService.client.post = jest.fn().mockRejectedValue(error);

      await expect(twitterService.favoriteTweet('123')).rejects.toThrow('API Error');
    });
  });
});