// 字段映射工具：前端驼峰 ↔ 后端下划线

/**
 * 将下划线命名转换为驼峰命名
 */
export function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * 将驼峰命名转换为下划线命名
 */
export function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * 转换对象的键名：下划线 -> 驼峰
 */
export function keysToCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(keysToCamel);

  const result = {};
  for (const key in obj) {
    const camelKey = toCamelCase(key);
    result[camelKey] = typeof obj[key] === 'object' ? keysToCamel(obj[key]) : obj[key];
  }
  return result;
}

/**
 * 转换对象的键名：驼峰 -> 下划线
 */
export function keysToSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const result = {};
  for (const key in obj) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = obj[key];
  }
  return result;
}

/**
 * 供应商字段映射配置
 */
export const supplierFieldMap = {
  // 前端 -> 后端
  toBackend: {
    shortName: 'short_name',
    businessScope: 'business_scope',
  },
  // 后端 -> 前端
  toFrontend: {
    short_name: 'shortName',
    business_scope: 'businessScope',
  }
};

/**
 * 公司文件字段映射配置
 */
export const documentFieldMap = {
  toBackend: {
    distributeScope: 'distribute_scope',
    authorId: 'author_id',
    docFlow: 'doc_flow',
    readCount: 'read_count',
  },
  toFrontend: {
    distribute_scope: 'distributeScope',
    author_id: 'authorId',
    doc_flow: 'docFlow',
    read_count: 'readCount',
  }
};

/**
 * 后勤管理字段映射配置
 */
export const logisticsFieldMap = {
  toBackend: {
    applicantId: 'applicant_id',
  },
  toFrontend: {
    applicant_id: 'applicantId',
  }
};