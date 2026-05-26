import type { Config } from './config.interface';

const config: Config = {
  nest: {
    port: 3000,
  },
  cors: {
    enabled: true,
  },
  swagger: {
    enabled: true,
    title: 'Nestjs FTW',
    description: 'The nestjs API description',
    version: '1.5',
    path: 'api',
  },
  security: {
    expiresIn: '8h',
    refreshIn: '7d',
    bcryptSaltOrRound: 10,
  },
  wintourRetry: {
    enabled: process.env.WINTOUR_RETRY_ENABLED === 'true',
    maxRetries: parseInt(process.env.WINTOUR_RETRY_MAX_RETRIES ?? '5', 10),
    maxSalesPerCycle: parseInt(
      process.env.WINTOUR_RETRY_MAX_SALES_PER_CYCLE ?? '10',
      10,
    ),
  },
};

export default (): Config => config;
