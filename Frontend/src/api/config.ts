/**
 * API Configuration
 *
 * Centralized configuration for API endpoints and settings.
 */

export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  version: process.env.NEXT_PUBLIC_API_VERSION || 'v1',
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
} as const;

/**
 * Get the full API URL for a given path
 */
export function getApiUrl(path: string): string {
  const base = API_CONFIG.baseUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Get versioned API URL
 */
export function getVersionedApiUrl(path: string): string {
  return getApiUrl(`/api/${API_CONFIG.version}${path.startsWith('/') ? path : `/${path}`}`);
}

/**
 * Default headers for API requests
 */
export function getDefaultHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add auth token if available
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

/**
 * Default tenant ID (for single-tenant mode or development)
 */
export function getDefaultTenantId(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'jx763x0zjyhwfc0mr39h107zyd7zgyjt';
}
