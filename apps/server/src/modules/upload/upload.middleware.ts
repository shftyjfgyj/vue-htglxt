import path from 'node:path';
import multer from 'multer';
import type { Express, Request, RequestHandler, Response } from 'express';
import { AppError } from '../../common/errors.js';

/** 图片类型白名单（老系统无任何校验） */
export const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp']
]);

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/**
 * 图片一律先收进内存：图片上限只有 2MB，内存开销可忽略；
 * 关键是存储位置要交给 storage 驱动决定（本地磁盘或对象存储），
 * 不能再像以前那样由 multer 直接写死到本地磁盘。
 */
const instance = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(AppError.badRequest('仅支持 jpg / png / gif / webp 图片'));
      return;
    }
    cb(null, true);
  }
});

/** 单文件上传中间件（字段名 file），并把 multer 错误翻译成业务异常 */
export function imageUpload(field = 'file'): RequestHandler {
  return (req: Request, res: Response, next) => {
    instance.single(field)(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') return next(AppError.badRequest('图片不能超过 2MB'));
        return next(AppError.badRequest('图片上传失败：' + error.code));
      }
      return next(error);
    });
  };
}

/** 取本次上传文件对应的扩展名（白名单优先，回退原始文件名） */
export function extensionOf(file: Express.Multer.File): string {
  return ALLOWED_MIME.get(file.mimetype) ?? path.extname(file.originalname).toLowerCase();
}

const SPREADSHEET_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/octet-stream'
]);

/** 表格导入：内存存储（≤5MB），仅接受 xlsx / csv */
export function spreadsheetUpload(field = 'file'): RequestHandler {
  const instance = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const okExt = /\.(xlsx|csv)$/i.test(file.originalname);
      if (!okExt || !SPREADSHEET_MIME.has(file.mimetype)) {
        cb(AppError.badRequest('仅支持 .xlsx 或 .csv 文件'));
        return;
      }
      cb(null, true);
    }
  });
  return (req: Request, res: Response, next) => {
    instance.single(field)(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(AppError.badRequest('文件不能超过 5MB'));
      }
      return next(error);
    });
  };
}
