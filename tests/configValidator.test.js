const { validateConfig, ConfigValidationError } = require('../src/utils/configValidator');

jest.mock('../src/logger');

describe('Configuration Validator', () => {
  const validConfig = {
    twitterKeys: {
      consumer_key: 'test_key',
      consumer_secret: 'test_secret',
      access_token: 'test_token',
      access_token_secret: 'test_token_secret'
    },
    twitterConfig: {
      language: 'english'
    }
  };

  describe('basic validation', () => {
    it('should accept valid configuration', () => {
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should require config object', () => {
      expect(() => validateConfig(null)).toThrow('Configuration object is required');
    });

    it('should require twitter keys', () => {
      const invalidConfig = { ...validConfig };
      delete invalidConfig.twitterKeys;

      expect(() => validateConfig(invalidConfig)).toThrow('Configuration validation failed');
    });
  });

  describe('twitter keys validation', () => {
    it('should validate all required twitter keys', () => {
      const invalidConfig = {
        ...validConfig,
        twitterKeys: {
          consumer_key: 'test_key'
          // Missing other keys
        }
      };

      try {
        validateConfig(invalidConfig);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect(error.validationErrors.length).toBeGreaterThan(1);
      }
    });
  });

  describe('error handling', () => {
    it('should collect multiple validation errors', () => {
      const invalidConfig = {
        twitterKeys: {},
        twitterConfig: {}
      };

      try {
        validateConfig(invalidConfig);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect(error.validationErrors.length).toBeGreaterThan(1);
      }
    });

    it('should handle unexpected errors gracefully', () => {
      const maliciousConfig = {
        get twitterKeys() {
          throw new Error('Unexpected error');
        }
      };

      expect(() => validateConfig(maliciousConfig))
        .toThrow('Unexpected error during config validation');
    });
  });
});