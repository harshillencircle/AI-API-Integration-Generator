import type { NormalizedSpec } from './model';
import type { GeneratedFile } from '../types';

export function generateErrorFile(): GeneratedFile {
  const content = `export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status?: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
`;
  return { path: 'api/errors.ts', content };
}

export function generateAuthFile(): GeneratedFile {
  const content = `const AUTH_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(access: string, refresh?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearAuthTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Override this to call your refresh endpoint. Return the new access token, or null on failure.
 * The client 401 interceptor calls this automatically before rejecting.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  // TODO: implement — e.g. POST /auth/refresh with { refreshToken: refresh }
  return null;
}
`;
  return { path: 'api/auth.ts', content };
}

export function generateClientFile(spec: NormalizedSpec): GeneratedFile {
  const baseUrl = spec.baseUrl ?? 'https://api.example.com';
  const content = `import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './errors';
import { getAccessToken, clearAuthTokens, refreshAccessToken } from './auth';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options', 'put', 'delete']);

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _authRetry?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: AxiosError, config: RetryConfig): boolean {
  const retryCount = config._retryCount ?? 0;
  if (retryCount >= MAX_RETRIES) return false;
  const method = (config.method ?? 'get').toLowerCase();
  if (!IDEMPOTENT_METHODS.has(method)) return false;
  if (!error.response) return true;
  return error.response.status >= 500;
}

function toApiError(error: AxiosError): ApiError {
  const status = error.response?.status;
  const data = error.response?.data as Record<string, unknown> | undefined;
  const message =
    (typeof data?.message === 'string' && data.message) ||
    (typeof data?.error === 'string' && data.error) ||
    error.message ||
    'Request failed';
  const code = typeof data?.code === 'string' ? data.code : error.code;
  return new ApiError(message, status, code, data);
}

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '${baseUrl}',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = \`Bearer \${token}\`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    if (!config) return Promise.reject(toApiError(error));

    const status = error.response?.status;

    if (status === 401 && !config._authRetry) {
      config._authRetry = true;
      try {
        const newToken = await refreshAccessToken();
        if (newToken) {
          config.headers.Authorization = \`Bearer \${newToken}\`;
          return apiClient.request(config);
        }
      } catch {
        // refresh failed — fall through to clear + reject
      }
      clearAuthTokens();
      return Promise.reject(new ApiError('Unauthorized — please sign in again.', 401, 'UNAUTHORIZED'));
    }

    if (shouldRetry(error, config)) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      const delay = RETRY_DELAY_MS * 2 ** (config._retryCount - 1);
      await sleep(delay);
      return apiClient.request(config);
    }

    return Promise.reject(toApiError(error));
  }
);

export default apiClient;
`;
  return { path: 'api/client.ts', content };
}
