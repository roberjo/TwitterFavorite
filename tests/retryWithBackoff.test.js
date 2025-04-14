const { retryWithBackoff, makeRetryable } = require('../src/utils/retryWithBackoff');

jest.useFakeTimers();

describe('Retry With Backoff', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('retryWithBackoff', () => {
    it('should return immediately on success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const promise = retryWithBackoff(fn);
      await Promise.resolve();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const error = new Error('Network error');
      error.code = 'ECONNRESET';

      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const promise = retryWithBackoff(fn);
      await Promise.resolve();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect maxRetries limit', async () => {
      const error = new Error('Test error');
      error.code = 'ECONNRESET';

      const fn = jest.fn().mockRejectedValue(error);
      const options = { maxRetries: 2, initialDelay: 100, maxDelay: 1000 };

      await expect(retryWithBackoff(fn, options)).rejects.toThrow('Test error');
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const error = new Error('Test error');
      error.code = 'ECONNRESET';

      const fn = jest.fn().mockRejectedValue(error);
      const options = { maxRetries: 2, initialDelay: 100, maxDelay: 1000 };

      const promise = retryWithBackoff(fn, options);
      
      // Initial call
      expect(fn).toHaveBeenCalledTimes(1);
      
      // First retry after 100ms
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(2);
      
      // Second retry after 200ms (2 * initial)
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(3);

      await expect(promise).rejects.toThrow('Test error');
    });
  });

  describe('makeRetryable', () => {
    it('should create retryable version of function', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Test error'))
        .mockResolvedValueOnce('success');

      const retryableFn = makeRetryable(fn, { maxRetries: 1, initialDelay: 100 });

      const result = await retryableFn();
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('configuration', () => {
    it('should respect maxDelay limit', async () => {
      const error = new Error('Test error');
      error.code = 'ECONNRESET';

      const fn = jest.fn().mockRejectedValue(error);
      const options = { maxRetries: 3, initialDelay: 100, maxDelay: 200 };

      const promise = retryWithBackoff(fn, options);
      
      // Initial call
      expect(fn).toHaveBeenCalledTimes(1);
      
      // First retry after 100ms
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(2);
      
      // Second retry after 200ms (maxDelay)
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(3);
      
      // Third retry after 200ms (maxDelay)
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(4);

      await expect(promise).rejects.toThrow('Test error');
    });
  });
});