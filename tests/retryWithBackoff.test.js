const { retryWithBackoff, makeRetryable, defaultConfig } = require('../src/utils/retryWithBackoff');

jest.mock('../src/logger');

describe('Retry With Backoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('retryWithBackoff', () => {
    it('should execute function successfully without retries', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const error = new Error('Network error');
      error.code = 'ECONNRESET';
      
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn);
      
      // Fast-forward through retries
      jest.runAllTimers();
      
      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxRetries limit', async () => {
      const error = new Error('Network error');
      error.code = 'ECONNRESET';
      
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn, { maxRetries: 2 });
      
      jest.runAllTimers();
      
      await expect(promise).rejects.toThrow('Network error');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const error = new Error('Rate limit');
      error.code = 88;
      
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn, { initialDelay: 1000 });
      
      // First retry should be after 1000ms
      jest.advanceTimersByTime(999);
      expect(fn).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(2);
      
      // Second retry should be after 2000ms
      jest.advanceTimersByTime(1999);
      expect(fn).toHaveBeenCalledTimes(2);
      
      jest.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(3);
      
      const result = await promise;
      expect(result).toBe('success');
    });
  });

  describe('makeRetryable', () => {
    it('should create retryable version of function', async () => {
      const fn = jest.fn().mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce('success');
      
      const retryableFn = makeRetryable(fn);
      const promise = retryableFn('arg1', 'arg2');
      
      jest.runAllTimers();
      
      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('configuration', () => {
    it('should respect custom shouldRetry function', async () => {
      const error = new Error('Custom error');
      const fn = jest.fn().mockRejectedValue(error);
      const shouldRetry = jest.fn().mockReturnValue(false);

      const promise = retryWithBackoff(fn, { shouldRetry });
      
      await expect(promise).rejects.toThrow('Custom error');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(error);
    });

    it('should respect maxDelay limit', async () => {
      const error = new Error('Rate limit');
      error.code = 88;
      
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn, {
        initialDelay: 1000,
        maxDelay: 1500
      });
      
      // First retry - 1000ms
      jest.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(2);
      
      // Second retry - should be capped at 1500ms instead of 2000ms
      jest.advanceTimersByTime(1500);
      expect(fn).toHaveBeenCalledTimes(3);
      
      const result = await promise;
      expect(result).toBe('success');
    });
  });
});