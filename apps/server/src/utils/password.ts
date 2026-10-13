import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

/** 密码强度：至少 8 位，包含字母与数字 */
export function isStrongPassword(plain: string): boolean {
  return typeof plain === 'string' && plain.length >= 8 && /[A-Za-z]/.test(plain) && /\d/.test(plain);
}
