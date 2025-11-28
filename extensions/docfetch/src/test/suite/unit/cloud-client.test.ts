import * as assert from 'assert';
import * as sinon from 'sinon';
import { CloudConfluenceClient } from '../../../confluence/clients/cloud-client';
import { AuthProvider } from '../../../confluence/auth/api-token-provider';
import {
  AuthenticationError,
  DocumentNotFoundError,
  RateLimitError,
} from '../../../confluence/types';

/**
 * Cloud Confluence Client Tests
 *
 * Tests the Confluence Cloud API client with mocked HTTP responses.
 */

suite('CloudConfluenceClient', () => {
  let fetchStub: sinon.SinonStub;
  let mockAuthProvider: AuthProvider;

  setup(() => {
    // Mock the global fetch function
    fetchStub = sinon.stub(global, 'fetch' as keyof typeof global);

    // Create a mock auth provider
    mockAuthProvider = {
      getAuthHeaders: async () => ({
        'Authorization': 'Basic dGVzdEB0ZXN0LmNvbTp0ZXN0LXRva2Vu',
      }),
      isAuthenticated: async () => true,
      authenticate: async () => true,
      logout: async () => {},
    };
  });

  teardown(() => {
    fetchStub.restore();
  });

  function createMockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  }

  suite('testConnection', () => {
    test('should return true for successful connection', async () => {
      fetchStub.resolves(createMockResponse({ results: [] }));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const result = await client.testConnection();

      assert.strictEqual(result, true);
      assert.ok(fetchStub.calledOnce);
    });

    test('should return false for failed connection', async () => {
      fetchStub.rejects(new Error('Network error'));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const result = await client.testConnection();

      assert.strictEqual(result, false);
    });

    test('should return false for 401 response', async () => {
      fetchStub.resolves(createMockResponse({ message: 'Unauthorized' }, 401));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const result = await client.testConnection();

      assert.strictEqual(result, false);
    });
  });

  suite('getDocumentById', () => {
    test('should fetch document successfully', async () => {
      const mockPage = {
        id: '123456',
        title: 'Test Page',
        spaceId: 'space-1',
        version: {
          number: 5,
          createdAt: '2024-01-15T10:30:00Z',
          authorId: 'user-1',
        },
        body: {
          storage: {
            value: '<p>Page content</p>',
            representation: 'storage',
          },
        },
        _links: {
          webui: '/wiki/spaces/TEST/pages/123456/Test+Page',
          base: 'https://test.atlassian.net',
        },
      };

      fetchStub.resolves(createMockResponse(mockPage));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const doc = await client.getDocumentById('123456');

      assert.strictEqual(doc.id, '123456');
      assert.strictEqual(doc.title, 'Test Page');
      assert.strictEqual(doc.version, 5);
      assert.strictEqual(doc.content, '<p>Page content</p>');
    });

    test('should include auth headers in request', async () => {
      fetchStub.resolves(createMockResponse({
        id: '123',
        title: 'Test',
        version: { number: 1, createdAt: '2024-01-01' },
        _links: { webui: '/x', base: '' },
      }));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      await client.getDocumentById('123');

      const [url, options] = fetchStub.firstCall.args;
      assert.ok(options.headers['Authorization']);
      assert.ok(options.headers['Authorization'].startsWith('Basic '));
    });

    test('should throw AuthenticationError on 401', async () => {
      fetchStub.resolves(createMockResponse({ message: 'Invalid credentials' }, 401));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);

      await assert.rejects(
        () => client.getDocumentById('123'),
        AuthenticationError
      );
    });

    test('should throw DocumentNotFoundError on 404', async () => {
      fetchStub.resolves(createMockResponse({ message: 'Page not found' }, 404));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);

      await assert.rejects(
        () => client.getDocumentById('nonexistent'),
        DocumentNotFoundError
      );
    });

    test('should throw RateLimitError on 429', async () => {
      fetchStub.resolves(createMockResponse(
        { message: 'Rate limited' },
        429,
        { 'Retry-After': '30' }
      ));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);

      try {
        await client.getDocumentById('123');
        assert.fail('Should have thrown RateLimitError');
      } catch (error) {
        assert.ok(error instanceof RateLimitError);
        assert.strictEqual((error as RateLimitError).retryAfter, 30);
      }
    });
  });

  suite('search', () => {
    test('should search and return results', async () => {
      const mockSearchResponse = {
        results: [
          {
            content: {
              id: '111',
              type: 'page',
              title: 'Result 1',
              space: { key: 'DEV', name: 'Development' },
              version: { when: '2024-01-10' },
              _links: { webui: '/wiki/spaces/DEV/pages/111' },
            },
            excerpt: 'This is a preview...',
            lastModified: '2024-01-10T12:00:00Z',
          },
          {
            content: {
              id: '222',
              type: 'page',
              title: 'Result 2',
              space: { key: 'DEV', name: 'Development' },
              version: { when: '2024-01-11' },
              _links: { webui: '/wiki/spaces/DEV/pages/222' },
            },
            excerpt: 'Another preview...',
            lastModified: '2024-01-11T12:00:00Z',
          },
        ],
        totalSize: 2,
        _links: {},
      };

      fetchStub.resolves(createMockResponse(mockSearchResponse));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const results = await client.search('test query');

      assert.strictEqual(results.results.length, 2);
      assert.strictEqual(results.totalCount, 2);
      assert.strictEqual(results.results[0].title, 'Result 1');
      assert.strictEqual(results.results[1].title, 'Result 2');
      assert.strictEqual(results.hasMore, false);
    });

    test('should handle pagination cursor', async () => {
      const mockSearchResponse = {
        results: [{ content: { id: '1', type: 'page', title: 'Page', _links: { webui: '/x' } } }],
        totalSize: 100,
        _links: {
          next: '/rest/api/search?cql=...&cursor=next-page-token',
        },
      };

      fetchStub.resolves(createMockResponse(mockSearchResponse));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const results = await client.search('query');

      assert.strictEqual(results.hasMore, true);
      assert.ok(results.cursor);
    });

    test('should include search limit in request', async () => {
      fetchStub.resolves(createMockResponse({ results: [], totalSize: 0 }));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      await client.search('query', { limit: 10 });

      const [url] = fetchStub.firstCall.args;
      assert.ok(url.includes('limit=10'));
    });
  });

  suite('getDocumentByUrl', () => {
    test('should fetch document by URL with page ID', async () => {
      const mockPage = {
        id: '999',
        title: 'Found Page',
        version: { number: 1, createdAt: '2024-01-01' },
        body: { storage: { value: '<p>content</p>' } },
        _links: { webui: '/x', base: '' },
      };

      fetchStub.resolves(createMockResponse(mockPage));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const doc = await client.getDocumentByUrl(
        'https://test.atlassian.net/wiki/spaces/DEV/pages/999/My+Page'
      );

      assert.strictEqual(doc.id, '999');
      assert.strictEqual(doc.title, 'Found Page');
    });

    test('should throw on invalid URL', async () => {
      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);

      await assert.rejects(
        () => client.getDocumentByUrl('https://test.atlassian.net/invalid'),
        /Cannot parse/
      );
    });
  });

  suite('getSpaces', () => {
    test('should fetch spaces', async () => {
      const mockSpaces = {
        results: [
          { id: '1', key: 'DEV', name: 'Development', type: 'global' },
          { id: '2', key: 'TEAM', name: 'Team Space', type: 'personal' },
        ],
      };

      fetchStub.resolves(createMockResponse(mockSpaces));

      const client = new CloudConfluenceClient('https://test.atlassian.net', mockAuthProvider);
      const spaces = await client.getSpaces();

      assert.strictEqual(spaces.length, 2);
      assert.strictEqual(spaces[0].key, 'DEV');
      assert.strictEqual(spaces[0].type, 'global');
      assert.strictEqual(spaces[1].type, 'personal');
    });
  });

  suite('URL normalization', () => {
    test('should remove trailing slash from base URL', async () => {
      fetchStub.resolves(createMockResponse({ results: [] }));

      const client = new CloudConfluenceClient('https://test.atlassian.net/', mockAuthProvider);
      await client.testConnection();

      const [url] = fetchStub.firstCall.args;
      assert.ok(!url.includes('atlassian.net//'));
    });
  });
});
