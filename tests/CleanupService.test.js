const CleanupService = require('../src/services/CleanupService');
const { DataPersistenceService } = require('../src/services/DataPersistenceService');
const tweetCache = require('../src/utils/cache');
const metrics = require('../src/utils/metrics');

jest.mock('../src/logger');
jest.mock('../src/utils/cache');
jest.mock('../src/utils/metrics');
jest.mock('../src/services/DataPersistenceService');

describe('CleanupService', () => {
  let cleanupService;
  let mockExit;
  let mockHandler;
  const testConfig = {
    cacheCleanupInterval: 1000,
    metricsRotationInterval: 2000,
    tweetCache: {
      size: jest.fn().mockReturnValue(100),
      cleanup: jest.fn().mockResolvedValue(undefined)
    },
    dataPersistence: {
      saveMetrics: jest.fn().mockResolvedValue(undefined)
    }
  };

  beforeEach(() => {
    jest.useFakeTimers();
    cleanupService = new CleanupService(testConfig);
    jest.clearAllMocks();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mockHandler = jest.fn().mockResolvedValue(undefined);

    // Reset metrics mock
    metrics.getMetrics.mockReturnValue({});
  });

  afterEach(async () => {
    cleanupService.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    mockExit.mockRestore();
    await Promise.resolve(); // Flush promises
  });

  describe('start', () => {
    it('should start periodic cache cleanup', () => {
      tweetCache.size.mockReturnValue(100);
      cleanupService.start();

      jest.advanceTimersByTime(testConfig.cacheCleanupInterval);

      expect(tweetCache.cleanup).toHaveBeenCalledWith(testConfig.cacheCleanupInterval);
    });

    it('should start periodic metrics rotation', () => {
      cleanupService.start();

      jest.advanceTimersByTime(testConfig.metricsRotationInterval);

      expect(metrics.logMetrics).toHaveBeenCalled();
      expect(metrics.reset).toHaveBeenCalled();
    });

    it('should handle cache cleanup errors', () => {
      const error = new Error('Cleanup failed');
      tweetCache.cleanup.mockImplementationOnce(() => {
        throw error;
      });

      cleanupService.start();
      jest.advanceTimersByTime(testConfig.cacheCleanupInterval);

      expect(require('../src/logger').error).toHaveBeenCalledWith(
        'Cache cleanup failed',
        expect.any(Object)
      );
    });
  });

  describe('stop', () => {
    it('should clear all intervals', () => {
      cleanupService.start();
      expect(cleanupService.intervals.length).toBe(2);

      cleanupService.stop();
      expect(cleanupService.intervals.length).toBe(0);
    });
  });

  describe('runNow', () => {
    it('should perform immediate cleanup', async () => {
      tweetCache.size
        .mockReturnValueOnce(100) // before cleanup
        .mockReturnValueOnce(80); // after cleanup

      await cleanupService.runNow();

      expect(tweetCache.cleanup).toHaveBeenCalled();
      expect(metrics.logMetrics).toHaveBeenCalled();
      expect(require('../src/logger').info).toHaveBeenCalledWith(
        'Immediate cleanup completed',
        expect.objectContaining({
          cacheEntriesRemoved: 20,
          remainingCacheEntries: 80
        })
      );
    });

    it('should handle cleanup errors', async () => {
      const error = new Error('Cleanup failed');
      tweetCache.cleanup.mockImplementationOnce(() => {
        throw error;
      });

      await expect(cleanupService.runNow()).rejects.toThrow('Cleanup failed');
      expect(require('../src/logger').error).toHaveBeenCalledWith(
        'Immediate cleanup failed',
        expect.any(Object)
      );
    });
  });

  describe('registerCleanupHandler', () => {
    it('should register cleanup handlers', () => {
      cleanupService.registerCleanupHandler(mockHandler, 'test-handler');
      expect(cleanupService.cleanupHandlers.size).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should execute all cleanup handlers during shutdown', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      cleanupService.registerCleanupHandler(handler1, 'handler1');
      cleanupService.registerCleanupHandler(handler2, 'handler2');

      await cleanupService.shutdown('SIGTERM');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should save metrics before shutdown', async () => {
      const mockMetrics = { tweets: { processed: 100 } };
      metrics.getMetrics.mockReturnValue(mockMetrics);

      await cleanupService.shutdown('SIGTERM');

      expect(metrics.getMetrics).toHaveBeenCalled();
      expect(cleanupService.dataPersistence.saveMetrics).toHaveBeenCalledWith(mockMetrics);
    });

    it('should handle cleanup handler errors gracefully', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('cleanup failed'));
      const successHandler = jest.fn().mockResolvedValue(undefined);

      cleanupService.registerCleanupHandler(failingHandler, 'failing');
      cleanupService.registerCleanupHandler(successHandler, 'success');

      await cleanupService.shutdown('SIGTERM');

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should prevent multiple concurrent shutdowns', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      cleanupService.registerCleanupHandler(handler, 'test');

      // Start two shutdowns
      const shutdown1 = cleanupService.shutdown('SIGTERM');
      const shutdown2 = cleanupService.shutdown('SIGINT');

      await Promise.all([shutdown1, shutdown2]);

      // Handler should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should timeout long-running cleanup handlers', async () => {
      const slowHandler = jest.fn().mockImplementation(() => new Promise(resolve => {
        setTimeout(resolve, 10000);
      }));

      cleanupService.registerCleanupHandler(slowHandler, 'slow');

      const shutdownPromise = cleanupService.shutdown('SIGTERM');
      await jest.advanceTimersByTimeAsync(6000);
      await shutdownPromise;

      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});