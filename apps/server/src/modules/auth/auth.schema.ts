import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 位').max(50, '用户名过长'),
  password: z.string().min(6, '密码至少 6 位').max(64, '密码过长')
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(20, 'refreshToken 不合法')
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(6, '原密码至少 6 位').max(64),
  newPassword: z
    .string()
    .min(8, '新密码至少 8 位')
    .max(64, '新密码过长')
    .regex(/[A-Za-z]/, '新密码需包含字母')
    .regex(/\d/, '新密码需包含数字')
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
