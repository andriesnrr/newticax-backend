import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export class RedisConfig {
  private static instance: Redis | null = null;
  private static isConnected = false;

  static getInstance(): Redis | null {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance;
  }

  static initialize(): void {
    if (this.instance) {
      return;
    }

    try {
      const redisOptions: Redis.RedisOptions = {
        host: this.parseRedisUrl().host,
        port: this.parseRedisUrl().port,
        password: this.parseRedisUrl().password,
        db: this.parseRedisUrl().db,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        connectTimeout: 10000,
        commandTimeout: 5000,
        keyPrefix: 'newticax:',
      };

      this.instance = new Redis(redisOptions);

      this.instance.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully', {
          host: redisOptions.host,
          port: redisOptions.port,
          db: redisOptions.db,
        });
      });

      this.instance.on('error', (error) => {
        this.isConnected = false;
        logger.error('Redis connection error', { error: error.message });
      });

      this.instance.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });

      this.instance.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });

      this.instance.on('ready', () => {
        this.isConnected = true;
        logger.info('Redis is ready');
      });

    } catch (error) {
      logger.error('Redis initialization failed', { error });
      this.instance = null;
    }
  }

  private static parseRedisUrl(): {
    host: string;
    port: number;
    password?: string;
    db: number;
  } {
    try {
      const url = new URL(env.REDIS_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        db: parseInt(url.pathname.slice(1)) || 0,
      };
    } catch (error) {
      logger.warn('Invalid Redis URL, using defaults', { url: env.REDIS_URL });
      return {
        host: 'localhost',
        port: 6379,
        db: 0,
      };
    }
  }

  static async healthCheck(): Promise<boolean> {
    if (!this.instance) {
      return false;
    }

    try {
      await this.instance.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed', { error });
      return false;
    }
  }

  static getConnectionStatus(): boolean {
    return this.isConnected;
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.quit();
      this.instance = null;
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }

  // Utility methods
  static async flushAll(): Promise<void> {
    if (this.instance) {
      await this.instance.flushall();
      logger.warn('Redis: All keys flushed');
    }
  }

  static async getStats(): Promise<any> {
    if (!this.instance) {
      return null;
    }

    try {
      const info = await this.instance.info();
      const keyCount = await this.instance.dbsize();
      
      return {
        connected: this.isConnected,
        keyCount,
        info: this.parseRedisInfo(info),
      };
    } catch (error) {
      logger.error('Failed to get Redis stats', { error });
      return null;
    }
  }

  private static parseRedisInfo(info: string): any {
    const lines = info.split('\r\n');
    const result: any = {};
    
    lines.forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    });
    
    return result;
  }
}

// Initialize Redis on module load
RedisConfig.initialize();

export default RedisConfig;