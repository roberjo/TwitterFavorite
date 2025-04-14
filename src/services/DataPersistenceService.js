const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');
const errorReporting = require('./ErrorReportingService');

/**
 * Service for persisting application data to disk
 */
class DataPersistenceService {
  constructor(config = {}) {
    this.config = {
      dataDir: path.join(process.cwd(), 'data'),
      metricsFileName: 'metrics.json',
      errorStatsFileName: 'error_stats.json',
      rotationInterval: 24 * 60 * 60 * 1000, // 24 hours
      keepFiles: 7, // Keep 7 days of history by default
      ...config
    };

    this.setupDataDirectory();
  }

  /**
   * Initialize data directory
   * @private
   */
  async setupDataDirectory() {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      logger.info('Data directory initialized', { path: this.config.dataDir });
    } catch (error) {
      errorReporting.reportError(error, { phase: 'data-dir-setup' });
      throw error;
    }
  }

  /**
   * Save metrics data to disk
   * @param {Object} metrics - Metrics data to save
   */
  async saveMetrics(metrics) {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `${timestamp}-${this.config.metricsFileName}`;
      const filePath = path.join(this.config.dataDir, fileName);

      await fs.writeFile(filePath, JSON.stringify(metrics, null, 2));
      logger.info('Metrics saved to disk', { filePath });

      await this.cleanupOldFiles('metrics');
    } catch (error) {
      errorReporting.reportError(error, { phase: 'metrics-save' });
      logger.error('Failed to save metrics', { error: error.message });
    }
  }

  /**
   * Load historical metrics data
   * @returns {Promise<Array>} Array of historical metrics
   */
  async loadHistoricalMetrics() {
    try {
      const files = await fs.readdir(this.config.dataDir);
      const metricsFiles = files
        .filter(file => file.includes(this.config.metricsFileName))
        .sort((a, b) => b.localeCompare(a)); // Sort descending

      const metrics = [];
      for (const file of metricsFiles) {
        try {
          const filePath = path.join(this.config.dataDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          metrics.push({
            date: file.split('-')[0],
            data: JSON.parse(data)
          });
        } catch (error) {
          errorReporting.reportError(error, {
            phase: 'metrics-file-read',
            file
          });
        }
      }

      return metrics.slice(0, 2); // Return only most recent 2 files
    } catch (error) {
      errorReporting.reportError(error, { phase: 'metrics-load' });
      return [];
    }
  }

  /**
   * Save error statistics to disk
   * @param {Object} errorStats - Error statistics to save
   */
  async saveErrorStats(errorStats) {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `${timestamp}-${this.config.errorStatsFileName}`;
      const filePath = path.join(this.config.dataDir, fileName);

      await fs.writeFile(filePath, JSON.stringify(errorStats, null, 2));
      logger.info('Error statistics saved to disk', { filePath });

      await this.cleanupOldFiles('errors');
    } catch (error) {
      errorReporting.reportError(error, { phase: 'error-stats-save' });
      logger.error('Failed to save error statistics', { error: error.message });
    }
  }

  /**
   * Load historical error statistics
   * @returns {Promise<Array>} Array of historical error statistics
   */
  async loadHistoricalErrorStats() {
    try {
      const files = await fs.readdir(this.config.dataDir);
      const errorFiles = files
        .filter(file => file.includes(this.config.errorStatsFileName))
        .sort((a, b) => b.localeCompare(a)); // Sort descending

      const errorStats = [];
      for (const file of errorFiles) {
        try {
          const filePath = path.join(this.config.dataDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          errorStats.push({
            date: file.split('-')[0],
            data: JSON.parse(data)
          });
        } catch (error) {
          errorReporting.reportError(error, {
            phase: 'error-stats-file-read',
            file
          });
        }
      }

      return errorStats.slice(0, 2); // Return only most recent 2 files
    } catch (error) {
      errorReporting.reportError(error, { phase: 'error-stats-load' });
      return [];
    }
  }

  /**
   * Clean up old data files
   * @param {string} type - Type of files to clean up ('metrics' or 'errors')
   * @private
   */
  async cleanupOldFiles(type) {
    try {
      const pattern = type === 'metrics' 
        ? this.config.metricsFileName 
        : this.config.errorStatsFileName;
      
      const files = await fs.readdir(this.config.dataDir);
      const typeFiles = files
        .filter(file => file.includes(pattern))
        .sort()
        .reverse();

      if (typeFiles.length > this.config.keepFiles) {
        const filesToRemove = typeFiles.slice(this.config.keepFiles);
        for (const file of filesToRemove) {
          const filePath = path.join(this.config.dataDir, file);
          await fs.unlink(filePath);
          logger.info('Removed old data file', { filePath });
        }
      }
    } catch (error) {
      errorReporting.reportError(error, { phase: 'file-cleanup', fileType: type });
      logger.error('Failed to clean up old files', { error: error.message });
    }
  }
}

// Export the class directly instead of a singleton instance
module.exports = DataPersistenceService;