import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { UPLOAD_ROOT, UPLOAD_URL_PREFIX } from './config/paths.js';
import { logger } from './common/logger.js';
import { ok } from './common/http.js';
import { requestId } from './middleware/requestId.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { renderMetrics } from './common/metrics.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { pingDb } from './db/pool.js';
import { openApiDocument } from './docs/openapi.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/user/user.routes.js';
import roleRoutes from './modules/role/role.routes.js';
import menuRoutes from './modules/menu/menu.routes.js';
import logRoutes from './modules/log/log.routes.js';
import categoryRoutes from './modules/category/category.routes.js';
import tagRoutes from './modules/tag/tag.routes.js';
import articleRoutes from './modules/article/article.routes.js';
import commentRoutes from './modules/comment/comment.routes.js';
import interactionRoutes from './modules/interaction/interaction.routes.js';
import uploadRoutes from './modules/upload/upload.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import notificationRoutes from './modules/notification/notification.routes.js';
import sensitiveWordRoutes from './modules/sensitive-word/sensitive-word.routes.js';
import growthRoutes from './modules/growth/growth.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
      credentials: true,
      exposedHeaders: ['X-Trace-Id']
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (_req, res) => res.locals.traceId as string }));
  app.use(metricsMiddleware);

  // 上传文件静态访问（仅图片类型可上传，见 modules/upload）
  app.use(UPLOAD_URL_PREFIX, express.static(UPLOAD_ROOT, { maxAge: '7d', fallthrough: true }));
  void path;

  // 存活探针：只看进程是否活着（不查库），供容器 livenessProbe 使用
  app.get('/health/live', (_req, res) => ok(res, { status: 'up', uptime: Math.round(process.uptime()) }));

  // Prometheus 指标：设置 METRICS_TOKEN 后需带 x-metrics-token 请求头
  app.get('/metrics', (req, res) => {
    const token = process.env.METRICS_TOKEN;
    if (token && req.header('x-metrics-token') !== token) {
      return res.status(401).json({ code: 401, message: '缺少 x-metrics-token', data: null, traceId: res.locals.traceId });
    }
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(renderMetrics());
  });

  // 健康检查：带数据库探活，供容器编排与监控使用
  app.get('/health', async (_req, res) => {
    try {
      await pingDb();
      return ok(res, { status: 'up', db: 'up', uptime: Math.round(process.uptime()) });
    } catch (error) {
      logger.error({ error }, '健康检查失败');
      return res.status(503).json({ code: 503, message: '数据库不可用', data: { status: 'degraded', db: 'down' }, traceId: res.locals.traceId });
    }
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument as unknown as Record<string, unknown>, { customSiteTitle: '后台管理系统 API 文档' }));
  app.get('/docs.json', (_req, res) => { res.json(openApiDocument); });

  // 认证与权限（M2）
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/roles', roleRoutes);
  app.use('/api/v1/menus', menuRoutes);
  app.use('/api/v1/logs', logRoutes);

  // 内容域（M3）
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/tags', tagRoutes);
  app.use('/api/v1/articles', articleRoutes);
  app.use('/api/v1/comments', commentRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/upload', uploadRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/sensitive-words', sensitiveWordRoutes);
  // 个人成长（热力图 / 成就），数据边界为本人
  app.use('/api/v1/growth', growthRoutes);
  // 运营分析（审核效能 / 标签图谱 / 兴趣画像 / 作者排行）
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1', interactionRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
