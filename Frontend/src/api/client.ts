/**
 * API Client
 *
 * Production-ready HTTP client with error handling, retries, and type safety.
 */

import { API_CONFIG, getDefaultHeaders } from './config';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(status: number, body: unknown): ApiError {
    const error = body as { error?: string; message?: string; code?: string };
    return new ApiError(
      status,
      error?.error || error?.message || 'An unexpected error occurred',
      error?.code
    );
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Request options
 */
interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Core API client class
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Make an HTTP request
   */
  async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      timeout = API_CONFIG.timeout,
      retries = API_CONFIG.retryAttempts,
      retryDelay = API_CONFIG.retryDelay,
      headers: customHeaders,
      ...fetchOptions
    } = options;

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    // Don't add default headers for FormData uploads (browser handles it)
    const headers = fetchOptions.body instanceof FormData
      ? { ...customHeaders } // Only use custom headers, no defaults
      : {
          ...getDefaultHeaders(),
          ...customHeaders,
        };

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        const response = await fetchWithTimeout(
          url,
          { ...fetchOptions, headers },
          timeout
        );

        // Handle non-JSON responses (like health checks)
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          if (!response.ok) {
            throw new ApiError(response.status, await response.text());
          }
          return (await response.text()) as unknown as T;
        }

        const data = await response.json();

        if (!response.ok) {
          throw ApiError.fromResponse(response.status, data);
        }

        return data as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx) except for rate limiting (429)
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }

        // Don't retry on abort
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ApiError(0, 'Request timeout');
        }

        attempt++;
        if (attempt <= retries) {
          await sleep(retryDelay * attempt); // Exponential backoff
        }
      }
    }

    throw lastError || new ApiError(0, 'Unknown error');
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>, options?: RequestOptions): Promise<T> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const queryString = searchParams.toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Upload file (multipart/form-data)
   */
  async upload<T>(
    endpoint: string,
    file: File,
    additionalFields?: Record<string, string>,
    options?: RequestOptions
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalFields) {
      Object.entries(additionalFields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // IMPORTANT: Don't pass any headers for FormData uploads
    // The browser will automatically set Content-Type with boundary
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      // Don't pass headers at all - let browser handle it
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_CONFIG.baseUrl);

// Export for testing with different base URLs
export { ApiClient };
