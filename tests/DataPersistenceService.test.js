const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const DataPersistenceService = require('../src/services/DataPersistenceService');

jest.mock('../src/logger');
jest.mock('../src/services/ErrorReportingService');

describe('DataPersistenceService', () => {
  let service;
  let tempDir;
  const mockDate = new Date('2025-04-13');

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twitter-bot-test-'));
    service = new DataPersistenceService({
      dataDir: tempDir,
      keepFiles: 3 // Keep fewer files for testing
    });

    // Create test files with fixed dates
    await fs.writeFile(
      path.join(tempDir, '2025-04-13-metrics.json'),
      JSON.stringify({ test: 'data1' })
    );
    await fs.writeFile(
      path.join(tempDir, '2025-04-12-metrics.json'),
      JSON.stringify({ test: 'data2' })
    );

    await fs.writeFile(
      path.join(tempDir, '2025-04-13-error_stats.json'),
      JSON.stringify({ test: 'error1' })
    );
    await fs.writeFile(
      path.join(tempDir, '2025-04-12-error_stats.json'),
      JSON.stringify({ test: 'error2' })
    );
  });

  afterEach(async () => {
    // Clean up temporary test directory
    try {
      const files = await fs.readdir(tempDir);
      await Promise.all(files.map(file => 
        fs.unlink(path.join(tempDir, file))
      ));
      await fs.rmdir(tempDir);
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('initialization', () => {
    it('should create data directory if it does not exist', async () => {
      const stats = await fs.stat(tempDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should handle existing data directory', async () => {
      // Creating service again with same directory should not throw
      const newService = new DataPersistenceService({
        dataDir: tempDir
      });
      expect(newService).toBeDefined();
    });
  });

  describe('metrics persistence', () => {
    it('should save metrics to disk', async () => {
      const metrics = {
        tweetsProcessed: 100,
        tweetsFavorited: 50,
        timestamp: new Date().toISOString()
      };

      await service.saveMetrics(metrics);

      const files = await fs.readdir(tempDir);
      expect(files.some(f => f.includes('metrics.json'))).toBe(true);
    });

    it('should load historical metrics', async () => {
      const metrics1 = { tweetsProcessed: 100, date: '2025-04-12' };
      const metrics2 = { tweetsProcessed: 200, date: '2025-04-13' };

      // Save test metrics files
      await service.saveMetrics(metrics1);
      await service.saveMetrics(metrics2);

      const history = await service.loadHistoricalMetrics();
      expect(history.length).toBe(2);
      expect(history[0].data.tweetsProcessed).toBeDefined();
    });

    it('should enforce file retention limit', async () => {
      // Save more metrics than the retention limit
      for (let i = 0; i < 5; i++) {
        await service.saveMetrics({ test: i });
      }

      const files = await fs.readdir(tempDir);
      const metricsFiles = files.filter(f => f.includes('metrics.json'));
      expect(metricsFiles.length).toBeLessThanOrEqual(service.config.keepFiles);
    });
  });

  describe('error stats persistence', () => {
    it('should save error statistics to disk', async () => {
      const errorStats = {
        totalErrors: 5,
        errorTypes: { NetworkError: 3, ValidationError: 2 },
        timestamp: new Date().toISOString()
      };

      await service.saveErrorStats(errorStats);

      const files = await fs.readdir(tempDir);
      expect(files.some(f => f.includes('error_stats.json'))).toBe(true);
    });

    it('should load historical error statistics', async () => {
      const stats1 = { totalErrors: 5, date: '2025-04-12' };
      const stats2 = { totalErrors: 8, date: '2025-04-13' };

      await service.saveErrorStats(stats1);
      await service.saveErrorStats(stats2);

      const history = await service.loadHistoricalErrorStats();
      expect(history.length).toBe(2);
      expect(history[0].data.totalErrors).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle file write errors', async () => {
      // Make directory read-only to simulate write error
      await fs.chmod(tempDir, 0o444);

      const metrics = { test: 'data' };
      await service.saveMetrics(metrics);

      // Should log error but not throw
      expect(require('../src/services/ErrorReportingService').reportError)
        .toHaveBeenCalled();
    });

    it('should handle file read errors', async () => {
      // Create an unreadable file
      const badFile = path.join(tempDir, '2025-04-13-metrics.json');
      await fs.writeFile(badFile, 'invalid json');

      const history = await service.loadHistoricalMetrics();
      expect(history).toEqual([]);
      expect(require('../src/services/ErrorReportingService').reportError)
        .toHaveBeenCalled();
    });
  });
});