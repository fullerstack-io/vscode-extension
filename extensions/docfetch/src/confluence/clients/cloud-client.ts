import { BaseConfluenceClient } from './base-client';
import {
  ConfluenceDocument,
  SearchResponse,
  SearchOptions,
  FetchOptions,
  SpaceInfo,
  DocumentNotFoundError,
} from '../types';
import { AuthProvider } from '../auth/api-token-provider';

/**
 * Cloud API response types
 */
interface CloudPageResponse {
  id: string;
  status: string;
  title: string;
  spaceId: string;
  version: {
    number: number;
    createdAt: string;
    authorId: string;
  };
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
  };
  _links: {
    webui: string;
    base: string;
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
 * Confluence Cloud REST API v2 client.
 */
export class CloudConfluenceClient extends BaseConfluenceClient {
  constructor(baseUrl: string, authProvider: AuthProvider) {
    super(baseUrl, authProvider);
  }

  protected getApiBasePath(): string {
    return '/wiki/api/v2';
  }

  /**
   * Get the legacy API path (for search, which isn't in v2 yet).
   */
  private getLegacyApiPath(): string {
    return '/wiki/rest/api';
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request<{ results: unknown[] }>('GET', '/spaces', {
        params: { limit: '1' },
      });
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  async getDocumentById(id: string, options?: FetchOptions): Promise<ConfluenceDocument> {
    const params: Record<string, string> = {
      'body-format': 'storage',
    };

    const response = await this.request<CloudPageResponse>('GET', `/pages/${id}`, { params });

    return this.transformPageResponse(response);
  }

  async getDocumentByUrl(url: string, options?: FetchOptions): Promise<ConfluenceDocument> {
    const parsed = this.parseConfluenceUrl(url);

    if (parsed.pageId) {
      return this.getDocumentById(parsed.pageId, options);
    }

    if (parsed.spaceKey && parsed.pageTitle) {
      // Search for the page by title and space
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
    // Search uses the legacy v1 API with CQL
    const cql = this.buildCql(query, options);

    const params: Record<string, string> = {
      cql,
      limit: String(options?.limit ?? 25),
      expand: 'content.space,content.version',
    };

    if (options?.cursor) {
      params.cursor = options.cursor;
    }

    // Use legacy API for search
    const url = `${this.baseUrl}${this.getLegacyApiPath()}/search?${new URLSearchParams(params)}`;

    const authHeaders = await this.authProvider.getAuthHeaders();
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        ...authHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
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
        webUrl: `${this.baseUrl}/wiki${r.content._links.webui}`,
      })),
      totalCount: data.totalSize,
      hasMore: !!data._links?.next,
      cursor: data._links?.next ? this.extractCursor(data._links.next) : undefined,
    };
  }

  async getSpaces(): Promise<SpaceInfo[]> {
    const response = await this.request<{ results: CloudSpaceResponse[] }>('GET', '/spaces', {
      params: { limit: '100' },
    });

    return response.results.map((s) => ({
      key: s.key,
      name: s.name,
      type: s.type === 'personal' ? 'personal' : 'global',
    }));
  }

  /**
   * Transform Cloud API response to our document format.
   */
  private transformPageResponse(response: CloudPageResponse): ConfluenceDocument {
    return {
      id: response.id,
      title: response.title,
      spaceKey: '', // Would need additional API call
      spaceName: '',
      version: response.version.number,
      createdAt: new Date(response.version.createdAt),
      updatedAt: new Date(response.version.createdAt),
      author: response.version.authorId,
      content: response.body?.storage?.value || '',
      webUrl: `${this.baseUrl}/wiki${response._links.webui}`,
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

    // Check if query is already CQL
    if (this.isCql(query)) {
      parts.push(query);
    } else {
      // Text search
      parts.push(`text ~ "${this.escapeCqlValue(query)}"`);
    }

    // Filter by space
    if (options?.spaceKey) {
      parts.push(`space = "${options.spaceKey}"`);
    }

    // Only include pages (not blog posts, etc.)
    parts.push('type = page');

    return parts.join(' AND ');
  }

  /**
   * Check if a string is already a CQL query.
   */
  private isCql(query: string): boolean {
    const cqlOperators = ['=', '~', 'AND', 'OR', 'NOT', 'IN', 'space', 'type', 'title', 'text'];
    return cqlOperators.some((op) => query.includes(op));
  }

  /**
   * Escape special characters in CQL values.
   */
  private escapeCqlValue(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
  }

  /**
   * Strip HTML tags from excerpt.
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Extract cursor from next link.
   */
  private extractCursor(nextLink: string): string | undefined {
    const match = nextLink.match(/cursor=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}
