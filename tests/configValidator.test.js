const { validateConfig, validateTwitterKeys, validateTwitterConfig } = require('../src/utils/configValidator');

jest.mock('../src/logger');

describe('Config Validator', () => {
  describe('validateTwitterKeys', () => {
    it('should validate correct Twitter keys', () => {
      const validKeys = {
        consumer_key: 'test-key',
        consumer_secret: 'test-secret',
        access_token: 'test-token',
        access_token_secret: 'test-token-secret'
      };

      expect(() => validateTwitterKeys(validKeys)).not.toThrow();
    });

    it('should throw error for missing keys', () => {
      const invalidKeys = {
        consumer_key: 'test-key',
        consumer_secret: 'test-secret'
      };

      expect(() => validateTwitterKeys(invalidKeys)).toThrow('Missing required Twitter API key');
    });

    it('should throw error for invalid key types', () => {
      const invalidKeys = {
        consumer_key: 123,
        consumer_secret: 'test-secret',
        access_token: 'test-token',
        access_token_secret: 'test-token-secret'
      };

      expect(() => validateTwitterKeys(invalidKeys)).toThrow('Invalid Twitter API key type');
    });
  });

  describe('validateTwitterConfig', () => {
    it('should validate correct Twitter config', () => {
      const validConfig = {
        language: 'english',
        retweet_rate: '3',
        like_rate: '3',
        quote_rate: '3',
        search_count: '5'
      };

      expect(() => validateTwitterConfig(validConfig)).not.toThrow();
    });

    it('should throw error for missing language', () => {
      const invalidConfig = {
        retweet_rate: '3',
        like_rate: '3',
        quote_rate: '3',
        search_count: '5'
      };

      expect(() => validateTwitterConfig(invalidConfig)).toThrow('Missing required language configuration');
    });

    it('should throw error for invalid numeric values', () => {
      const invalidConfig = {
        language: 'english',
        retweet_rate: 'invalid',
        like_rate: '3',
        quote_rate: '3',
        search_count: '5'
      };

      expect(() => validateTwitterConfig(invalidConfig)).toThrow('must be a positive number');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct complete config', () => {
      const validConfig = {
        twitterKeys: {
          consumer_key: 'test-key',
          consumer_secret: 'test-secret',
          access_token: 'test-token',
          access_token_secret: 'test-token-secret'
        },
        twitterConfig: {
          language: 'english',
          retweet_rate: '3',
          like_rate: '3',
          quote_rate: '3',
          search_count: '5'
        }
      };

      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should throw error for missing config sections', () => {
      const invalidConfig = {
        twitterKeys: {
          consumer_key: 'test-key',
          consumer_secret: 'test-secret',
          access_token: 'test-token',
          access_token_secret: 'test-token-secret'
        }
      };

      expect(() => validateConfig(invalidConfig)).toThrow('Missing required configuration sections');
    });

    it('should throw error for null config', () => {
      expect(() => validateConfig(null)).toThrow('Configuration object is required');
    });
  });
});