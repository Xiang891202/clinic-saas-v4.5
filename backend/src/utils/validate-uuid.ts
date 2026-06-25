// backend/src/utils/validate-uuid.ts

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 验证字符串是否为有效的 UUID v4 格式
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}