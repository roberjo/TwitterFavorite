const { TwitterBot } = require('../src/bot');
const TwitterService = require('../src/services/TwitterService');
const CleanupService = require('../src/services/CleanupService');
const metrics = require('../src/utils/metrics');

jest.mock('../src/services/TwitterService');
jest.mock('../src/services/CleanupService');
jest.mock('../src/utils/metrics');
jest.mock('../src/logger');

describe('TwitterBot', () => {
  let bot;
  
  beforeEach(() => {
    jest.clearAllMocks();
    bot = new TwitterBot();
    jest.useFakeTimers();
  });

  afterEach(() => {
    bot.stop();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should initialize services and start processing', async () => {
      await bot.start();

      expect(metrics.reset).toHaveBeenCalled();
      expect(bot.cleanupService.start).toHaveBeenCalled();
      expect(bot.twitterService.startStream).toHaveBeenCalled();
    });

    it('should handle startup errors', async () => {
      const error = new Error('Startup failed');
      bot.startTweetCollector = jest.fn().mockRejectedValue(error);

      await expect(bot.start()).rejects.toThrow('Startup failed');
      expect(metrics.incrementApiErrors).toHaveBeenCalled();
    });

    it('should setup shutdown handlers', async () => {
      const processOn = jest.spyOn(process, 'on');
      await bot.start();

      expect(processOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOn).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });
  });

  describe('stop', () => {
    it('should clean up resources and stop services', async () => {
      bot.stream = { stop: jest.fn() };
      await bot.start();
      await bot.stop();

      expect(bot.stream.stop).toHaveBeenCalled();
      expect(bot.cleanupService.runNow).toHaveBeenCalled();
      expect(bot.cleanupService.stop).toHaveBeenCalled();
      expect(metrics.logMetrics).toHaveBeenCalled();
    });

    it('should handle cleanup errors', async () => {
      const error = new Error('Cleanup failed');
      bot.cleanupService.runNow.mockRejectedValue(error);

      await expect(bot.stop()).rejects.toThrow('Cleanup failed');
    });

    it('should prevent multiple shutdown attempts', async () => {
      await bot.stop();
      bot.cleanupService.runNow.mockClear();
      
      await bot.stop();
      expect(bot.cleanupService.runNow).not.toHaveBeenCalled();
    });
  });

  describe('tweet processing', () => {
    it('should skip processing when shutting down', async () => {
      bot.isShuttingDown = true;
      await bot.startTweetCollector(1000);

      expect(bot.twitterService.startStream).not.toHaveBeenCalled();
    });

    it('should handle concurrent processing attempts', async () => {
      bot.isProcessing = true;
      bot.startTweetProcessor();
      
      jest.advanceTimersByTime(30000);
      expect(bot.twitterService.favoriteTweet).not.toHaveBeenCalled();
    });

    it('should record metrics during processing', async () => {
      const mockTweet = {
        id_str: '123',
        created_at: new Date(Date.now() - 31000).toISOString()
      };
      
      bot.twitterService.tweetQueue = [mockTweet];
      bot.startTweetProcessor();
      
      jest.advanceTimersByTime(30000);
      
      expect(metrics.incrementTweetsProcessed).toHaveBeenCalled();
      expect(metrics.recordProcessingTime).toHaveBeenCalled();
      expect(metrics.recordQueueSize).toHaveBeenCalled();
    });
  });

  describe('metrics reporting', () => {
    it('should periodically report metrics', async () => {
      bot.startMetricsReporter();
      
      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      expect(metrics.logMetrics).toHaveBeenCalled();
      
      metrics.logMetrics.mockClear();
      jest.advanceTimersByTime(5 * 60 * 1000); // Another 5 minutes
      expect(metrics.logMetrics).toHaveBeenCalled();
    });
  });

  describe('getTweetAge', () => {
    it('should calculate correct tweet age', () => {
      const now = Date.now();
      const thirtySecondsAgo = new Date(now - 30000);
      
      const tweet = {
        created_at: thirtySecondsAgo.toISOString()
      };

      const age = bot.getTweetAge(tweet);
      expect(age).toBeGreaterThanOrEqual(30);
      expect(age).toBeLessThan(31);
    });
  });
});