import * as assert from 'assert';

/**
 * URL Parser Tests
 *
 * Tests the parsing of various Confluence URL formats.
 * These are unit tests that don't require VS Code APIs.
 */

// URL parsing logic extracted for testing
function parseCloudUrl(url: string): {
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

  throw new Error(`Cannot parse Confluence URL: ${url}`);
}

function parseDataCenterUrl(url: string): {
  pageId?: string;
  spaceKey?: string;
  pageTitle?: string;
} {
  // Pattern: /display/SPACE/Page+Title
  const displayMatch = url.match(/\/display\/([^/]+)\/([^?]+)/);
  if (displayMatch) {
    return {
      spaceKey: displayMatch[1],
      pageTitle: decodeURIComponent(displayMatch[2].replace(/\+/g, ' ')),
    };
  }

  // Pattern: /pages/viewpage.action?pageId=123456
  const viewPageMatch = url.match(/pageId=(\d+)/);
  if (viewPageMatch) {
    return { pageId: viewPageMatch[1] };
  }

  throw new Error(`Cannot parse Confluence URL: ${url}`);
}

suite('URL Parser', () => {
  suite('Cloud URLs', () => {
    test('should parse standard Cloud page URL with title', () => {
      const url = 'https://company.atlassian.net/wiki/spaces/DEV/pages/123456789/My+Page+Title';
      const result = parseCloudUrl(url);

      assert.strictEqual(result.spaceKey, 'DEV');
      assert.strictEqual(result.pageId, '123456789');
      assert.strictEqual(result.pageTitle, 'My Page Title');
    });

    test('should parse Cloud page URL without title', () => {
      const url = 'https://company.atlassian.net/wiki/spaces/TEAM/pages/987654321';
      const result = parseCloudUrl(url);

      assert.strictEqual(result.spaceKey, 'TEAM');
      assert.strictEqual(result.pageId, '987654321');
      assert.strictEqual(result.pageTitle, undefined);
    });

    test('should parse viewpage.action URL', () => {
      const url = 'https://company.atlassian.net/wiki/pages/viewpage.action?pageId=555555';
      const result = parseCloudUrl(url);

      assert.strictEqual(result.pageId, '555555');
    });

    test('should parse legacy display URL', () => {
      const url = 'https://company.atlassian.net/wiki/display/DOCS/Getting+Started';
      const result = parseCloudUrl(url);

      assert.strictEqual(result.spaceKey, 'DOCS');
      assert.strictEqual(result.pageTitle, 'Getting Started');
    });

    test('should handle URL-encoded characters', () => {
      const url = 'https://company.atlassian.net/wiki/spaces/DEV/pages/123/API%20Documentation%20%26%20Guide';
      const result = parseCloudUrl(url);

      assert.strictEqual(result.pageTitle, 'API Documentation & Guide');
    });

    test('should handle spaces with hyphens', () => {
      const url = 'https://company.atlassian.net/wiki/spaces/my-space/pages/123/Title';
      const result = parseCloudUrl(url);

      assert.strictEqual(result.spaceKey, 'my-space');
    });

    test('should throw on invalid URL', () => {
      const url = 'https://company.atlassian.net/not-a-valid-path';

      assert.throws(() => parseCloudUrl(url), /Cannot parse/);
    });
  });

  suite('Data Center URLs', () => {
    test('should parse display URL', () => {
      const url = 'https://confluence.company.com/display/TEAM/Project+Documentation';
      const result = parseDataCenterUrl(url);

      assert.strictEqual(result.spaceKey, 'TEAM');
      assert.strictEqual(result.pageTitle, 'Project Documentation');
    });

    test('should parse viewpage.action URL', () => {
      const url = 'https://confluence.company.com/pages/viewpage.action?pageId=12345';
      const result = parseDataCenterUrl(url);

      assert.strictEqual(result.pageId, '12345');
    });

    test('should parse URL with context path', () => {
      const url = 'https://company.com/confluence/display/DEV/Setup+Guide';
      const result = parseDataCenterUrl(url);

      assert.strictEqual(result.spaceKey, 'DEV');
      assert.strictEqual(result.pageTitle, 'Setup Guide');
    });

    test('should throw on invalid URL', () => {
      const url = 'https://confluence.company.com/unknown/path';

      assert.throws(() => parseDataCenterUrl(url), /Cannot parse/);
    });
  });

  suite('Deployment Type Detection', () => {
    test('should detect Cloud from atlassian.net domain', () => {
      const url = 'https://mycompany.atlassian.net/wiki/spaces/X/pages/1';
      const isCloud = url.includes('.atlassian.net');

      assert.strictEqual(isCloud, true);
    });

    test('should detect Data Center from custom domain', () => {
      const url = 'https://confluence.mycompany.com/display/X/Page';
      const isCloud = url.includes('.atlassian.net');

      assert.strictEqual(isCloud, false);
    });
  });
});
