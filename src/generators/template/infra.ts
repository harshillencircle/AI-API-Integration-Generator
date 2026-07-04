import type { NormalizedSpec } from './model';
import type { GeneratedFile } from '../../types';

export function generateClientFile(spec: NormalizedSpec): GeneratedFile {
  const baseUrl = spec.baseUrl ?? 'https://api.example.com';
  const content = `import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '${baseUrl}',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (token) config.headers.Authorization = \`Bearer \${token}\`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export default apiClient;
`;
  return { path: 'api/client.ts', content };
}
