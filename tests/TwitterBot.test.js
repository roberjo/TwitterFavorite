const { TwitterBot } = require('../src/bot');

// Mock dependencies
jest.mock('../src/config', () => ({
  twitterKeys: {
    consumer_key: 'test_key',
    consumer_secret: 'test_secret',
    access_token: 'test_token',
    access_token_secret: 'test_token_secret'
  },
  twitterConfig: {
    language: 'english'
  },
  dataDirectory: './test-data',
  rateLimits: {
    favorites: 75,
    stream: 50
  },
  retryConfig: {
    maxRetries: 3,
    initialDelay: 2000,
    maxDelay: 30000
  }
}));

jest.mock('../src/logger');
jest.mock('../src/services/TwitterService');
jest.mock('../src/services/DataPersistenceService');
jest.mock('../src/services/ErrorReportingService');

describe('TwitterBot', () => {
  let bot;

  beforeEach(() => {
    bot = new TwitterBot();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should initialize services and start tweet collection', async () => {
      await bot.start();
      expect(bot.twitterService.startStream).toHaveBeenCalled();
    });

    it('should handle startup errors gracefully', async () => {
      const error = new Error('Startup error');
      bot.twitterService.startStream.mockRejectedValueOnce(error);

      await expect(bot.start()).rejects.toThrow('Startup error');
      expect(bot.cleanupService.stop).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop services and save final metrics', async () => {
      await bot.stop();
      expect(bot.cleanupService.stop).toHaveBeenCalled();
      expect(bot.dataPersistence.saveMetrics).toHaveBeenCalled();
    });
  });
});