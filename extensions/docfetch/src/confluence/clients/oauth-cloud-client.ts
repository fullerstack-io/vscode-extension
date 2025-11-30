import {
  ConfluenceDocument,
  SearchResponse,
  SearchOptions,
  FetchOptions,
  SpaceInfo,
  DocumentNotFoundError,
  DocFetchError,
  AuthenticationError,
  RateLimitError,
} from '../types';
import { IConfluenceClient } from './base-client';
import { OAuth2Provider } from '../auth/oauth2-provider';

// OAuth API base URL
const ATLASSIAN_API_BASE = 'https://api.atlassian.com/ex/confluence';

/**
 * Cloud API v2 response types
 */
interface CloudPageResponse {
  id: string;
  status: string;
  title: string;
  spaceId: string;
  parentId?: string;
  authorId?: string;
  createdAt?: string;
  version?: {
    number: number;
    message?: string;
    minorEdit?: boolean;
    authorId?: string;
    createdAt?: string;
  };
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
  };
  _links: {
    webui: string;
    base?: string;
  };
}

interface CloudSpaceResponse {
  id: string;
  key: string;
  name: string;
  type: string;
}

interface CloudSearchResult {
  content: {
    id: string;
    type: string;
    title: string;
    space?: {
      key: string;
      name: string;
    };
    version?: {
      when: string;
    };
    _links: {
      webui: string;
    };
  };
  excerpt: string;
  lastModified: string;
}

interface CloudSearchResponse {
  results: CloudSearchResult[];
  totalSize: number;
  _links?: {
    next?: string;
  };
}

/**
 * Legacy (v1) API response types - compatible with v1 OAuth scopes
 */
interface LegacyPageResponse {
  id: string;
  type: string;
  status: string;
  title: string;
  space: {
    key: string;
    name: string;
  };
  version: {
    number: number;
    when: string;
    by: {
      displayName: string;
    };
  };
  body?: {
    storage?: {
      value: string;
    };
  };
  _links: {
    webui: string;
    base: string;
  };
}

interface LegacySpaceResponse {
  key: string;
  name: string;
  type: string;
}

/**
 * Confluence Cloud client for OAuth 2.0 authentication.
 * Uses the api.atlassian.com endpoint with Cloud ID.
 */
export class OAuthCloudConfluenceClient implements IConfluenceClient {
  private cloudId?: string;

  constructor(
    private readonly siteUrl: string,
    private readonly authProvider: OAuth2Provider
  ) {}

  /**
   * Get the API base URL with Cloud ID.
   */
  private async getApiBaseUrl(): Promise<string> {
    if (!this.cloudId) {
      this.cloudId = await this.authProvider.getCloudId();
    }
    return `${ATLASSIAN_API_BASE}/${this.cloudId}`;
  }

  /**
   * Make an authenticated API request.
   */
  private async request<T>(
    method: string,
    path: string,
    options?: { params?: Record<string, string>; body?: unknown }
  ): Promise<T> {
    const baseUrl = await this.getApiBaseUrl();
    const url = new URL(`${baseUrl}${path}`);

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const headers = await this.authProvider.getAuthHeaders();

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Handle error responses.
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let message = `HTTP ${response.status}`;

    try {
      const body = await response.json() as { message?: string; errorMessage?: string };
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
        throw new RateLimitError(message, 60);
      default:
        throw new DocFetchError(message, 'REQUEST_FAILED', response.status);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('DocFetch: Testing OAuth connection...');
      const baseUrl = await this.getApiBaseUrl();
      console.log('DocFetch: API base URL:', baseUrl);

      // Use v2 API for connection test - requires granular scopes
      await this.request<{ results: unknown[] }>('GET', '/wiki/api/v2/spaces', {
        params: { limit: '1' },
      });
      console.log('DocFetch: Connection test successful!');
      return true;
    } catch (error) {
      console.error('DocFetch: Connection test failed:', error);
      return false;
    }
  }

  async getDocumentById(id: string, options?: FetchOptions): Promise<ConfluenceDocument> {
    const params: Record<string, string> = {
      'body-format': 'storage',
      'include-version': 'true',
    };

    // Use v2 API for pages
    const response = await this.request<CloudPageResponse>('GET', `/wiki/api/v2/pages/${id}`, { params });

    return this.transformCloudPageResponse(response);
  }

  async getDocumentByUrl(url: string, options?: FetchOptions): Promise<ConfluenceDocument> {
    const parsed = this.parseConfluenceUrl(url);

    if (parsed.pageId) {
      return this.getDocumentById(parsed.pageId, options);
    }

    if (parsed.spaceKey && parsed.pageTitle) {
      const searchResults = await this.search(
        `title = "${parsed.pageTitle}" AND space = "${parsed.spaceKey}"`,
        { limit: 1 }
      );

      if (searchResults.results.length > 0) {
        return this.getDocumentById(searchResults.results[0].id, options);
      }
    }

    throw new DocumentNotFoundError(`Could not find document for URL: ${url}`);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const cql = this.buildCql(query, options);

    const params: Record<string, string> = {
      cql,
      limit: String(options?.limit ?? 25),
      expand: 'content.space,content.version',
    };

    if (options?.cursor) {
      params.cursor = options.cursor;
    }

    // Search uses legacy API
    const baseUrl = await this.getApiBaseUrl();
    const url = `${baseUrl}/wiki/rest/api/search?${new URLSearchParams(params)}`;

    const headers = await this.authProvider.getAuthHeaders();
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        ...headers,
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json() as CloudSearchResponse;

    return {
      results: data.results.map((r) => ({
        id: r.content.id,
        title: r.content.title,
        spaceKey: r.content.space?.key || '',
        spaceName: r.content.space?.name || '',
        excerpt: this.stripHtml(r.excerpt || ''),
        lastModified: new Date(r.lastModified || r.content.version?.when || Date.now()),
        webUrl: `${this.siteUrl}/wiki${r.content._links.webui}`,
      })),
      totalCount: data.totalSize,
      hasMore: !!data._links?.next,
      cursor: data._links?.next ? this.extractCursor(data._links.next) : undefined,
    };
  }

  async getSpaces(): Promise<SpaceInfo[]> {
    // Use v2 API for spaces
    const response = await this.request<{ results: CloudSpaceResponse[] }>('GET', '/wiki/api/v2/spaces', {
      params: { limit: '100' },
    });

    return response.results.map((s) => ({
      key: s.key,
      name: s.name,
      type: s.type === 'personal' ? 'personal' : 'global',
    }));
  }

  /**
   * Transform Cloud v2 API response to our document format.
   */
  private transformCloudPageResponse(response: CloudPageResponse): ConfluenceDocument {
    const createdAt = response.createdAt ? new Date(response.createdAt) : new Date();
    const updatedAt = response.version?.createdAt ? new Date(response.version.createdAt) : createdAt;

    return {
      id: response.id,
      title: response.title,
      spaceKey: response.spaceId || '',
      spaceName: '', // v2 API doesn't include space name in page response
      version: response.version?.number || 1,
      createdAt,
      updatedAt,
      author: response.authorId || '',
      content: response.body?.storage?.value || '',
      webUrl: `${this.siteUrl}/wiki${response._links.webui}`,
      labels: [],
    };
  }

  /**
   * Transform Legacy (v1) API response to our document format.
   */
  private transformLegacyPageResponse(response: LegacyPageResponse): ConfluenceDocument {
    return {
      id: response.id,
      title: response.title,
      spaceKey: response.space?.key || '',
      spaceName: response.space?.name || '',
      version: response.version.number,
      createdAt: new Date(response.version.when),
      updatedAt: new Date(response.version.when),
      author: response.version.by?.displayName || '',
      content: response.body?.storage?.value || '',
      webUrl: `${this.siteUrl}/wiki${response._links.webui}`,
      labels: [],
    };
  }

  /**
   * Parse a Confluence Cloud URL to extract page ID or space/title.
   */
  private parseConfluenceUrl(url: string): {
    pageId?: string;
    spaceKey?: string;
    pageTitle?: string;
  } {
    // Pattern: /wiki/spaces/SPACE/pages/123456/Page+Title
    const pagesMatch = url.match(/\/wiki\/spaces\/([^/]+)\/pages\/(\d+)(?:\/([^?]+))?/);
    if (pagesMatch) {
      return {
        spaceKey: pagesMatch[1],
        pageId: pagesMatch[2],
        pageTitle: pagesMatch[3] ? decodeURIComponent(pagesMatch[3].replace(/\+/g, ' ')) : undefined,
      };
    }

    // Pattern: /wiki/pages/viewpage.action?pageId=123456
    const viewPageMatch = url.match(/pageId=(\d+)/);
    if (viewPageMatch) {
      return { pageId: viewPageMatch[1] };
    }

    // Pattern: /wiki/display/SPACE/Page+Title (legacy)
    const displayMatch = url.match(/\/wiki\/display\/([^/]+)\/([^?]+)/);
    if (displayMatch) {
      return {
        spaceKey: displayMatch[1],
        pageTitle: decodeURIComponent(displayMatch[2].replace(/\+/g, ' ')),
      };
    }

    throw new DocumentNotFoundError(`Cannot parse Confluence URL: ${url}`);
  }

  /**
   * Build CQL query string.
   */
  private buildCql(query: string, options?: SearchOptions): string {
    const parts: string[] = [];

    if (this.isCql(query)) {
      parts.push(query);
    } else {
      parts.push(`text ~ "${this.escapeCqlValue(query)}"`);
    }

    if (options?.spaceKey) {
      parts.push(`space = "${options.spaceKey}"`);
    }

    parts.push('type = page');

    let cql = parts.join(' AND ');

    // Add ORDER BY clause based on sortBy option
    if (options?.sortBy === 'lastModified') {
      cql += ' order by lastmodified desc';
    } else if (options?.sortBy === 'title') {
      cql += ' order by title asc';
    }
    // 'relevance' is the default, no order by needed

    return cql;
  }

  private isCql(query: string): boolean {
    const cqlOperators = ['=', '~', 'AND', 'OR', 'NOT', 'IN', 'space', 'type', 'title', 'text'];
    return cqlOperators.some((op) => query.includes(op));
  }

  private escapeCqlValue(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  private extractCursor(nextLink: string): string | undefined {
    const match = nextLink.match(/cursor=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}
