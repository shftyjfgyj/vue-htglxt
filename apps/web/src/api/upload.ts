import { http } from './http';
import type { UploadResult } from '../types/content';

/** 富文本 / 封面图上传：走后端 /api/v1/upload/image（类型白名单 + 2MB 限制） */
export async function uploadImage(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const response = await http.post<{ data: UploadResult }>('/api/v1/upload/image', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}
