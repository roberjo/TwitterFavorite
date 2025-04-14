/**
 * Configuration validation utility
 * @module configValidator
 */

const logger = require('../logger');

class ConfigValidationError extends Error {
  constructor(message, validationErrors = []) {
    super(message);
    this.name = 'ConfigValidationError';
    this.validationErrors = validationErrors;
  }
}

function validateSection(config, validatedConfig, path, schema, errors) {
  for (const [key, value] of Object.entries(schema)) {
    const fullPath = path ? `${path}.${key}` : key;
    
    if (!(key in config)) {
      errors.push(`Missing required field: ${fullPath}`);
      continue;
    }

    const configValue = config[key];
    if (value && typeof value === 'object') {
      validatedConfig[key] = {};
      validateSection(configValue, validatedConfig[key], fullPath, value, errors);
    } else {
      validatedConfig[key] = configValue;
    }
  }
}

function validateConfig(config) {
  if (!config) {
    throw new ConfigValidationError('Configuration object is required');
  }

  const errors = [];
  const validatedConfig = { ...config };

  try {
    if (!config.twitterKeys || !config.twitterConfig) {
      errors.push('Missing required configuration sections');
      throw new ConfigValidationError('Configuration validation failed', errors);
    }

    // Validate required sections and properties
    const configSchema = {
      twitterKeys: {
        consumer_key: true,
        consumer_secret: true,
        access_token: true,
        access_token_secret: true
      },
      twitterConfig: {
        language: true
      }
    };

    validateSection(config, validatedConfig, '', configSchema, errors);

    if (errors.length > 0) {
      logger.error('Configuration validation failed', { errors });
      throw new ConfigValidationError('Configuration validation failed', errors);
    }

    // Log validation success with sanitized config
    const sanitizedConfig = {
      ...validatedConfig,
      twitterKeys: {
        ...validatedConfig.twitterKeys,
        consumer_secret: '***',
        access_token_secret: '***'
      }
    };
    
    logger.info('Configuration validated successfully', { config: sanitizedConfig });
    return validatedConfig;
  } catch (error) {
    throw new Error(`Unexpected error during config validation: ${error.message}`);
  }
}

module.exports = {
  validateConfig,
  ConfigValidationError
};