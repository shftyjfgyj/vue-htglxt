import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './common/logger.js';
import { closePool, pingDb } from './db/pool.js';

async function bootstrap(): Promise<void> {
  try {
    await pingDb();
    logger.info({ host: env.DB_HOST, database: env.DB_DATABASE }, 'MySQL 连接成功');
  } catch (error) {
    logger.error({ error }, 'MySQL 连接失败，请检查 .env 配置与数据库是否启动');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`服务已启动: http://localhost:${env.PORT}  (API 文档: http://localhost:${env.PORT}/docs)`);
  });

  const shutdown = async (signal: string) => {
    logger.warn({ signal }, '收到退出信号，开始优雅关闭');
    server.close(async () => {
      await closePool();
      logger.info('已关闭，进程退出');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
