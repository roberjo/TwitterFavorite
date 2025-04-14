/**
 * Configuration validation utility
 * @module configValidator
 */

const logger = require('../logger');

/**
 * Configuration schema definition
 */
const configSchema = {
  twitterKeys: {
    required: true,
    properties: {
      consumer_key: { type: 'string', required: true },
      consumer_secret: { type: 'string', required: true },
      access_token: { type: 'string', required: true },
      access_token_secret: { type: 'string', required: true }
    }
  },
  twitterConfig: {
    required: true,
    properties: {
      language: { type: 'string', required: true, default: 'english' }
    }
  },
  dataDirectory: {
    type: 'string',
    required: false,
    default: 'data'
  },
  rateLimits: {
    required: false,
    properties: {
      favorites: { type: 'number', min: 1, max: 1000, default: 75 },
      stream: { type: 'number', min: 1, max: 100, default: 50 }
    }
  },
  retryConfig: {
    required: false,
    properties: {
      maxRetries: { type: 'number', min: 1, max: 10, default: 3 },
      initialDelay: { type: 'number', min: 1000, max: 60000, default: 2000 },
      maxDelay: { type: 'number', min: 5000, max: 300000, default: 30000 }
    }
  }
};

class ConfigValidationError extends Error {
  constructor(message, validationErrors) {
    super(message);
    this.name = 'ConfigValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Validates configuration object against schema
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validated and normalized configuration
 * @throws {ConfigValidationError} If validation fails
 */
function validateConfig(config) {
  const errors = [];
  const validatedConfig = { ...config };

  try {
    // Validate required sections and properties
    validateSection(config, validatedConfig, '', configSchema, errors);

    if (errors.length > 0) {
      throw new ConfigValidationError('Configuration validation failed', errors);
    }

    // Log validation success with sanitized config (removing sensitive data)
    const sanitizedConfig = sanitizeConfig(validatedConfig);
    logger.info('Configuration validated successfully', { config: sanitizedConfig });

    return validatedConfig;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      logger.error('Configuration validation failed', {
        errors: error.validationErrors
      });
      throw error;
    }
    throw new Error(`Unexpected error during config validation: ${error.message}`);
  }
}

/**
 * Validates a section of the configuration
 * @private
 */
function validateSection(source, target, path, schema, errors) {
  for (const [key, definition] of Object.entries(schema)) {
    const currentPath = path ? `${path}.${key}` : key;
    const value = source[key];

    if (definition.required && value === undefined) {
      errors.push(`Missing required configuration: ${currentPath}`);
      continue;
    }

    if (value === undefined && 'default' in definition) {
      target[key] = definition.default;
      continue;
    }

    if (value === undefined) {
      continue;
    }

    if (definition.type) {
      validateType(value, definition, currentPath, errors);
      if (definition.min !== undefined) {
        validateMinValue(value, definition.min, currentPath, errors);
      }
      if (definition.max !== undefined) {
        validateMaxValue(value, definition.max, currentPath, errors);
      }
    }

    if (definition.properties) {
      target[key] = target[key] || {};
      validateSection(value || {}, target[key], currentPath, definition.properties, errors);
    } else {
      target[key] = value;
    }
  }
}

/**
 * Validates a value's type
 * @private
 */
function validateType(value, definition, path, errors) {
  const actualType = typeof value;
  if (actualType !== definition.type) {
    errors.push(`Invalid type for ${path}: expected ${definition.type}, got ${actualType}`);
  }
}

/**
 * Validates minimum value
 * @private
 */
function validateMinValue(value, min, path, errors) {
  if (value < min) {
    errors.push(`${path} must be at least ${min}`);
  }
}

/**
 * Validates maximum value
 * @private
 */
function validateMaxValue(value, max, path, errors) {
  if (value > max) {
    errors.push(`${path} must not exceed ${max}`);
  }
}

/**
 * Creates a sanitized version of config for logging
 * @private
 */
function sanitizeConfig(config) {
  const sanitized = { ...config };
  if (sanitized.twitterKeys) {
    sanitized.twitterKeys = {
      ...sanitized.twitterKeys,
      consumer_key: '***',
      consumer_secret: '***',
      access_token: '***',
      access_token_secret: '***'
    };
  }
  return sanitized;
}

module.exports = {
  validateConfig,
  ConfigValidationError
};