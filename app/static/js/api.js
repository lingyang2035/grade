const BASE = document.querySelector('meta[name="app-base"]')?.content || '/';
let csrfToken = '';

export class ApiError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function setCsrfToken(token) {
  csrfToken = token || '';
}

export async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const options = { method, credentials: 'same-origin', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  let response;
  try {
    response = await fetch(BASE + path, options);
  } catch {
    throw new ApiError('网络连接失败，请稍后重试。');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    window.location.href = BASE + 'login';
    throw new ApiError(payload?.error || '登录已失效，请重新登录。', 'login_required');
  }
  if (response.status === 403 && payload?.code === 'password_change_required') {
    window.location.href = BASE + 'password';
    throw new ApiError(payload?.error || '请先修改密码。', 'password_change_required');
  }
  if (!response.ok) {
    throw new ApiError(payload?.error || `请求失败（${response.status}）`, payload?.code || null);
  }
  return payload;
}

export const get = (path) => request(path);
export const post = (path, body) => request(path, { method: 'POST', body });
export const put = (path, body) => request(path, { method: 'PUT', body });
export const patch = (path, body) => request(path, { method: 'PATCH', body });
export const del = (path) => request(path, { method: 'DELETE' });
