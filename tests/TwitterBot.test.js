const TwitterBot = require('../src/bot').TwitterBot;
const TwitterService = require('../src/services/TwitterService');

jest.mock('../src/services/TwitterService');
jest.mock('../src/logger');

describe('TwitterBot', () => {
  let bot;
  
  beforeEach(() => {
    TwitterService.mockClear();
    bot = new TwitterBot();
  });

  describe('start', () => {
    it('should initialize tweet collector and processor', async () => {
      bot.startTweetCollector = jest.fn();
      bot.startTweetProcessor = jest.fn();

      await bot.start();

      expect(bot.startTweetCollector).toHaveBeenCalled();
      expect(bot.startTweetProcessor).toHaveBeenCalled();
    });

    it('should handle startup errors', async () => {
      const error = new Error('Startup failed');
      bot.startTweetCollector = jest.fn().mockRejectedValue(error);

      await expect(bot.start()).rejects.toThrow('Startup failed');
    });
  });

  describe('getTweetAge', () => {
    it('should calculate correct tweet age', () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now - 30000);
      
      const tweet = {
        created_at: thirtySecondsAgo.toString()
      };

      const age = bot.getTweetAge(tweet);
      expect(age).toBeGreaterThanOrEqual(30);
      expect(age).toBeLessThan(31);
    });
  });

  describe('startTweetCollector', () => {
    it('should start stream if no streams active', async () => {
      const mockStream = {
        stop: jest.fn()
      };
      bot.twitterService.startStream = jest.fn().mockResolvedValue(mockStream);

      await bot.startTweetCollector(1000);

      expect(bot.currentTweetStreams).toBe(1);
      expect(bot.twitterService.startStream).toHaveBeenCalled();
    });

    it('should not start stream if stream already active', async () => {
      bot.currentTweetStreams = 1;
      bot.twitterService.startStream = jest.fn();

      await bot.startTweetCollector(1000);

      expect(bot.currentTweetStreams).toBe(1);
      expect(bot.twitterService.startStream).not.toHaveBeenCalled();
    });
  });

  describe('killTweetCollector', () => {
    it('should stop stream and decrease counter', () => {
      bot.currentTweetStreams = 1;
      bot.stream = {
        stop: jest.fn()
      };

      bot.killTweetCollector(1000);

      expect(bot.currentTweetStreams).toBe(0);
      expect(bot.stream.stop).toHaveBeenCalled();
    });
  });
});