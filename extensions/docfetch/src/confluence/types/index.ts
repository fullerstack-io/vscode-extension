/**
 * Confluence API Types
 */

// Deployment types
export type ConfluenceDeploymentType = 'cloud' | 'datacenter';

// Authentication methods
export type AuthMethod = 'apiToken' | 'oauth2' | 'pat';

// Connection configuration (stored in VS Code settings)
export interface ConnectionConfig {
  id: string;
  name: string;
  baseUrl: string;
  type: ConfluenceDeploymentType;
  authMethod: AuthMethod;
}

// Credentials (stored in SecretStorage)
export interface ApiTokenCredentials {
  method: 'apiToken';
  email: string;
  token: string;
}

export interface OAuth2Credentials {
  method: 'oauth2';
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudId: string;
}

export interface PatCredentials {
  method: 'pat';
  token: string;
}

export type Credentials = ApiTokenCredentials | OAuth2Credentials | PatCredentials;

// Document types
export interface ConfluenceDocument {
  id: string;
  title: string;
  spaceKey: string;
  spaceName: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  author: string;
  content: string; // Storage format (XHTML)
  webUrl: string;
  labels: string[];
}

export interface SearchResult {
  id: string;
  title: string;
  spaceKey: string;
  spaceName: string;
  excerpt: string;
  lastModified: Date;
  webUrl: string;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  hasMore: boolean;
  cursor?: string;
}

// Local document metadata
export interface DocumentMetadata {
  id: string;                    // Local UUID
  confluenceId: string;          // Confluence page ID
  connectionId: string;          // Which connection this came from
  relativePath: string;          // Path within .docs
  title: string;
  confluenceUrl: string;
  spaceKey: string;
  version: number;               // Confluence version at last sync
  syncedAt: string;              // ISO date string
  checksum: string;              // Content hash
  category: string;              // Subdirectory category
  labels: string[];
}

export interface MetadataIndex {
  version: string;
  documents: DocumentMetadata[];
}

// Frontmatter for markdown files
export interface DocumentFrontmatter {
  title: string;
  confluence_id: string;
  confluence_url: string;
  space_key: string;
  version: number;
  synced_at: string;
  modified_at: string;
  author: string;
  labels: string[];
}

// Client options
export interface FetchOptions {
  includeContent?: boolean;
}

export interface SearchOptions {
  limit?: number;
  cursor?: string;
  spaceKey?: string;
}

// Space info
export interface SpaceInfo {
  key: string;
  name: string;
  type: 'global' | 'personal';
}

// Error types
export class DocFetchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'DocFetchError';
  }
}

export class AuthenticationError extends DocFetchError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', 401, false);
    this.name = 'AuthenticationError';
  }
}

export class DocumentNotFoundError extends DocFetchError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404, false);
    this.name = 'DocumentNotFoundError';
  }
}

export class RateLimitError extends DocFetchError {
  constructor(message: string, public readonly retryAfter: number) {
    super(message, 'RATE_LIMITED', 429, true);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends DocFetchError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR', undefined, true);
    this.name = 'NetworkError';
  }
}
