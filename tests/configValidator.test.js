const { validateConfig, validateTwitterKeys, validateTwitterConfig, ConfigValidationError } = require('../src/utils/configValidator');

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

describe('Configuration Validator', () => {
  const validConfig = {
    twitterKeys: {
      consumer_key: 'test-key',
      consumer_secret: 'test-secret',
      access_token: 'test-token',
      access_token_secret: 'test-token-secret'
    },
    twitterConfig: {
      language: 'english'
    }
  };

  describe('required fields validation', () => {
    it('should accept valid configuration', () => {
      const result = validateConfig(validConfig);
      expect(result).toBeDefined();
      expect(result.twitterKeys).toBeDefined();
      expect(result.twitterConfig).toBeDefined();
    });

    it('should throw error for missing twitter keys', () => {
      const invalidConfig = {
        twitterConfig: { language: 'english' }
      };

      expect(() => validateConfig(invalidConfig))
        .toThrow(ConfigValidationError);
    });

    it('should throw error for incomplete twitter keys', () => {
      const incompleteConfig = {
        ...validConfig,
        twitterKeys: {
          consumer_key: 'test-key'
          // Missing other required keys
        }
      };

      expect(() => validateConfig(incompleteConfig))
        .toThrow(ConfigValidationError);
    });
  });

  describe('type validation', () => {
    it('should validate types correctly', () => {
      const configWithNumbers = {
        ...validConfig,
        rateLimits: {
          favorites: 50,
          stream: 30
        }
      };

      const result = validateConfig(configWithNumbers);
      expect(result.rateLimits.favorites).toBe(50);
    });

    it('should throw error for invalid types', () => {
      const invalidTypeConfig = {
        ...validConfig,
        rateLimits: {
          favorites: '50' // Should be number
        }
      };

      expect(() => validateConfig(invalidTypeConfig))
        .toThrow(ConfigValidationError);
    });
  });

  describe('value range validation', () => {
    it('should validate number ranges', () => {
      const configWithValidRanges = {
        ...validConfig,
        rateLimits: {
          favorites: 75,
          stream: 50
        },
        retryConfig: {
          maxRetries: 3,
          initialDelay: 2000,
          maxDelay: 30000
        }
      };

      const result = validateConfig(configWithValidRanges);
      expect(result.rateLimits.favorites).toBe(75);
    });

    it('should throw error for out of range values', () => {
      const invalidRangeConfig = {
        ...validConfig,
        rateLimits: {
          favorites: 2000 // Exceeds max of 1000
        }
      };

      expect(() => validateConfig(invalidRangeConfig))
        .toThrow(ConfigValidationError);
    });
  });

  describe('default values', () => {
    it('should apply default values for missing optional fields', () => {
      const result = validateConfig(validConfig);
      expect(result.dataDirectory).toBe('data');
      expect(result.twitterConfig.language).toBe('english');
    });

    it('should not override provided values with defaults', () => {
      const configWithCustomValues = {
        ...validConfig,
        dataDirectory: 'custom-data-dir',
        twitterConfig: {
          language: 'spanish'
        }
      };

      const result = validateConfig(configWithCustomValues);
      expect(result.dataDirectory).toBe('custom-data-dir');
      expect(result.twitterConfig.language).toBe('spanish');
    });
  });

  describe('error handling', () => {
    it('should collect multiple validation errors', () => {
      const multipleErrorConfig = {
        twitterKeys: {
          consumer_key: 123, // Wrong type
          // Missing required fields
        },
        rateLimits: {
          favorites: 2000 // Out of range
        }
      };

      try {
        validateConfig(multipleErrorConfig);
        fail('Expected validation to throw');
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