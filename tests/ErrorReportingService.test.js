const errorReporting = require('../src/services/ErrorReportingService');

jest.mock('../src/logger');
jest.useFakeTimers();

describe('ErrorReportingService', () => {
  beforeEach(() => {
    errorReporting.clearErrors();
    jest.clearAllMocks();
  });

  describe('error reporting', () => {
    it('should track error occurrences', () => {
      const error = new Error('Test error');
      const context = { operation: 'test' };

      errorReporting.reportError(error, context);
      errorReporting.reportError(error, context);

      const stats = errorReporting.getErrorStats();
      expect(stats.totalErrors).toBe(2);
      expect(stats.errorTypes.Error).toBe(2);
    });

    it('should limit context history', () => {
      const error = new Error('Test error');
      
      // Report error 11 times
      for (let i = 0; i < 11; i++) {
        errorReporting.reportError(error, { iteration: i });
      }

      const errorKey = errorReporting.getErrorKey(error);
      const errorInfo = errorReporting.errors.get(errorKey);
      
      expect(errorInfo.contexts.length).toBe(10);
      expect(errorInfo.contexts[0].iteration).toBe(1); // First context was removed
    });

    it('should track different error types separately', () => {
      const error1 = new TypeError('Type error');
      const error2 = new ReferenceError('Reference error');

      errorReporting.reportError(error1);
      errorReporting.reportError(error2);

      const stats = errorReporting.getErrorStats();
      expect(stats.errorTypes.TypeError).toBe(1);
      expect(stats.errorTypes.ReferenceError).toBe(1);
    });
  });

  describe('error statistics', () => {
    it('should return most frequent errors', () => {
      const error1 = new Error('Frequent error');
      const error2 = new Error('Rare error');

      for (let i = 0; i < 3; i++) {
        errorReporting.reportError(error1);
      }
      errorReporting.reportError(error2);

      const stats = errorReporting.getErrorStats();
      expect(stats.mostFrequent[0].count).toBe(3);
      expect(stats.mostFrequent[0].key).toBe('Error:Frequent error');
    });

    it('should include instance info in stats', () => {
      const stats = errorReporting.getErrorStats();
      expect(stats.instanceInfo).toBeDefined();
      expect(stats.instanceInfo.nodeVersion).toBe(process.version);
    });
  });

  describe('error handling utilities', () => {
    it('should create error handler with context', () => {
      const handler = errorReporting.createErrorHandler('test-context');
      const error = new Error('Handler test');

      handler(error);

      const stats = errorReporting.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(require('../src/logger').error).toHaveBeenCalledWith(
        'Error reported',
        expect.objectContaining({
          context: { context: 'test-context' }
        })
      );
    });

    it('should wrap async functions with error reporting', async () => {
      const failingFn = async () => {
        throw new Error('Async error');
      };

      const wrapped = errorReporting.wrapAsync(failingFn, 'async-context');
      
      await expect(wrapped()).rejects.toThrow('Async error');
      
      const stats = errorReporting.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorTypes.Error).toBe(1);
    });

    it('should preserve successful function results', async () => {
      const successFn = async () => 'success';
      const wrapped = errorReporting.wrapAsync(successFn, 'success-context');

      const result = await wrapped();
      expect(result).toBe('success');
      
      const stats = errorReporting.getErrorStats();
      expect(stats.totalErrors).toBe(0);
    });
  });
});