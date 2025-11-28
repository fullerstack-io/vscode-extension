import {
  ConfluenceDocument,
  SearchResponse,
  SearchOptions,
  FetchOptions,
  SpaceInfo,
  AuthenticationError,
  NetworkError,
  DocumentNotFoundError,
  RateLimitError,
  DocFetchError,
} from '../types';
import { AuthProvider } from '../auth/api-token-provider';

/**
 * Abstract interface for Confluence API clients.
 * Implemented by CloudClient and DataCenterClient.
 */
export interface IConfluenceClient {
  /**
   * Test the connection and authentication.
   */
  testConnection(): Promise<boolean>;

  /**
   * Get a document by its Confluence page ID.
   */
  getDocumentById(id: string, options?: FetchOptions): Promise<ConfluenceDocument>;

  /**
   * Get a document by its Confluence URL.
   */
  getDocumentByUrl(url: string, options?: FetchOptions): Promise<ConfluenceDocument>;

  /**
   * Search for documents.
   */
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;

  /**
   * Get available spaces.
   */
  getSpaces(): Promise<SpaceInfo[]>;
}

/**
 * Base HTTP client functionality shared by Cloud and DC clients.
 */
export abstract class BaseConfluenceClient implements IConfluenceClient {
  protected readonly baseUrl: string;
  protected readonly authProvider: AuthProvider;

  constructor(baseUrl: string, authProvider: AuthProvider) {
    // Normalize base URL (remove trailing slash)
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.authProvider = authProvider;
  }

  /**
   * Get the API base path for this client type.
   */
  protected abstract getApiBasePath(): string;

  /**
   * Make an authenticated HTTP request.
   */
  protected async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      params?: Record<string, string>;
      body?: unknown;
    }
  ): Promise<T> {
    const authHeaders = await this.authProvider.getAuthHeaders();

    // Build URL with query parameters
    let url = `${this.baseUrl}${this.getApiBasePath()}${path}`;
    if (options?.params) {
      const searchParams = new URLSearchParams(options.params);
      url += `?${searchParams.toString()}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authHeaders,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof DocFetchError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError(`Network error: ${error.message}`);
      }

      throw new DocFetchError(
        `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REQUEST_FAILED'
      );
    }
  }

  /**
   * Handle non-2xx responses.
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let message = `HTTP ${response.status}`;

    try {
      const body = await response.json();
      message = body.message || body.errorMessage || message;
    } catch {
      // Ignore JSON parse errors
    }

    switch (response.status) {
      case 401:
        throw new AuthenticationError(message);
      case 403:
        throw new AuthenticationError(`Access denied: ${message}`);
      case 404:
        throw new DocumentNotFoundError(message);
      case 429:
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        throw new RateLimitError(message, retryAfter);
      default:
        throw new DocFetchError(
          message,
          'API_ERROR',
          response.status,
          response.status >= 500
        );
    }
  }

  // Abstract methods to be implemented by subclasses
  abstract testConnection(): Promise<boolean>;
  abstract getDocumentById(id: string, options?: FetchOptions): Promise<ConfluenceDocument>;
  abstract getDocumentByUrl(url: string, options?: FetchOptions): Promise<ConfluenceDocument>;
  abstract search(query: string, options?: SearchOptions): Promise<SearchResponse>;
  abstract getSpaces(): Promise<SpaceInfo[]>;
}
