import type { Method } from 'axios';
import { AxiosInstance, AxiosResponse } from 'axios';

export interface HttpRequestConfig {
  method: Method;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
}

export interface HttpResponse<T = unknown> {
  data: T;
  headers: Record<string, string>;
  status: number;
}

export interface HttpTransport {
  request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
}

export class AxiosHttpTransport implements HttpTransport {
  constructor(private readonly client: AxiosInstance) {}

  async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const response: AxiosResponse<T> = await this.client.request({
      method: config.method,
      url: config.url,
      data: config.data,
      headers: config.headers,
      params: config.params,
    });

    const normalizedHeaders: Record<string, string> = {};
    Object.entries(response.headers ?? {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        normalizedHeaders[key] = value.join(', ');
      } else if (value !== undefined) {
        normalizedHeaders[key] = String(value);
      }
    });

    return {
      data: response.data,
      headers: normalizedHeaders,
      status: response.status,
    };
  }
}
