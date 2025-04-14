const os = require('os');
const metrics = require('../src/utils/metrics');

jest.mock('../src/logger');
jest.useFakeTimers();

describe('Metrics', () => {
  beforeEach(() => {
    metrics.reset();
    jest.clearAllMocks();
  });

  describe('basic metrics', () => {
    it('should track tweet counts correctly', () => {
      metrics.incrementTweetsProcessed();
      metrics.incrementTweetsProcessed();
      metrics.incrementTweetsFavorited();
      metrics.incrementTweetsSkipped();

      const report = metrics.getMetrics();
      expect(report.tweets.processed).toBe(2);
      expect(report.tweets.favorited).toBe(1);
      expect(report.tweets.skipped).toBe(1);
    });

    it('should track error counts correctly', () => {
      metrics.incrementApiErrors();
      metrics.incrementStreamDisconnects();
      metrics.incrementRetryAttempts();
      metrics.incrementRetryAttempts();

      const report = metrics.getMetrics();
      expect(report.errors.apiErrors).toBe(1);
      expect(report.errors.streamDisconnects).toBe(1);
      expect(report.errors.retryAttempts).toBe(2);
    });
  });

  describe('queue metrics', () => {
    it('should calculate average queue size correctly', () => {
      metrics.recordQueueSize(5);
      metrics.recordQueueSize(10);
      metrics.recordQueueSize(15);

      const report = metrics.getMetrics();
      expect(report.tweets.avgQueueSize).toBe(10);
    });

    it('should maintain maximum queue size history', () => {
      for (let i = 0; i < 150; i++) {
        metrics.recordQueueSize(i);
      }

      const report = metrics.getMetrics();
      expect(report.tweets.avgQueueSize).toBe(99); // Average of last 100 numbers (50-149)
    });
  });

  describe('processing time metrics', () => {
    it('should calculate average processing time correctly', () => {
      metrics.recordProcessingTime(100);
      metrics.recordProcessingTime(200);
      metrics.recordProcessingTime(300);

      const report = metrics.getMetrics();
      expect(report.tweets.avgProcessingTime).toBe(200);
    });
  });

  describe('resource metrics', () => {
    beforeEach(() => {
      // Mock os functions
      jest.spyOn(os, 'cpus').mockReturnValue(Array(4).fill({}));
      jest.spyOn(os, 'totalmem').mockReturnValue(16000000000);
      jest.spyOn(os, 'freemem').mockReturnValue(8000000000);
      jest.spyOn(os, 'uptime').mockReturnValue(3600);
      jest.spyOn(os, 'loadavg').mockReturnValue([1.5, 1.0, 0.5]);

      // Mock process.cpuUsage
      jest.spyOn(process, 'cpuUsage').mockReturnValue({
        user: 100000,
        system: 50000
      });

      // Mock process.memoryUsage
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapTotal: 50000000,
        heapUsed: 25000000,
        external: 10000000,
        rss: 75000000
      });
    });

    it('should collect resource metrics after interval', () => {
      // Advance time by more than 60 seconds
      jest.advanceTimersByTime(61000);

      const report = metrics.getMetrics();
      expect(report.resources).toBeDefined();
      expect(report.resources.cpu).toBeDefined();
      expect(report.resources.memory).toBeDefined();
      expect(report.resources.system).toBeDefined();
    });

    it('should not collect resource metrics before interval', () => {
      // Advance time by less than 60 seconds
      jest.advanceTimersByTime(30000);

      const report = metrics.getMetrics();
      expect(report.resources).toBeNull();
    });

    it('should maintain correct resource metrics history', () => {
      // Simulate 30 resource collections
      for (let i = 0; i < 30; i++) {
        jest.advanceTimersByTime(60000);
        metrics.getMetrics();
      }

      // Should only keep last 24 readings
      expect(metrics.resourceMetrics.length).toBe(24);
    });

    it('should format memory values in MB', () => {
      jest.advanceTimersByTime(61000);
      
      const report = metrics.getMetrics();
      expect(report.resources.memory.heapTotal).toBe(48); // 50MB
      expect(report.resources.memory.heapUsed).toBe(24);  // 25MB
      expect(report.resources.system.totalMemory).toBe(15259); // ~16GB
      expect(report.resources.system.freeMemory).toBe(7629);  // ~8GB
    });
  });

  describe('runtime metrics', () => {
    it('should track uptime correctly', () => {
      jest.advanceTimersByTime(5000);
      
      const report = metrics.getMetrics();
      expect(report.runtime.uptime).toBe(5);
      expect(report.runtime.startTime).toBeDefined();
    });
  });
});