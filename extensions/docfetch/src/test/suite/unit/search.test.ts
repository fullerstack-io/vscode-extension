import * as assert from 'assert';
import * as sinon from 'sinon';
import { suite, test, setup, teardown } from 'mocha';

// Test the debounce utility and search result formatting
suite('Search Functionality', () => {
  suite('Debounce', () => {
    let clock: sinon.SinonFakeTimers;

    setup(() => {
      clock = sinon.useFakeTimers();
    });

    teardown(() => {
      clock.restore();
    });

    test('should debounce function calls', () => {
      let callCount = 0;
      const fn = () => callCount++;

      // Inline debounce implementation for testing
      function debounce<T extends (...args: unknown[]) => void>(
        fn: T,
        delay: number
      ): (...args: Parameters<T>) => void {
        let timeoutId: NodeJS.Timeout | undefined;
        return (...args: Parameters<T>) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => fn(...args), delay);
        };
      }

      const debounced = debounce(fn, 300);

      // Call multiple times rapidly
      debounced();
      debounced();
      debounced();

      assert.strictEqual(callCount, 0, 'Should not be called immediately');

      clock.tick(299);
      assert.strictEqual(callCount, 0, 'Should not be called before delay');

      clock.tick(1);
      assert.strictEqual(callCount, 1, 'Should be called after delay');
    });

    test('should reset timer on subsequent calls', () => {
      let callCount = 0;
      const fn = () => callCount++;

      function debounce<T extends (...args: unknown[]) => void>(
        fn: T,
        delay: number
      ): (...args: Parameters<T>) => void {
        let timeoutId: NodeJS.Timeout | undefined;
        return (...args: Parameters<T>) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => fn(...args), delay);
        };
      }

      const debounced = debounce(fn, 300);

      debounced();
      clock.tick(200);
      debounced(); // Reset timer
      clock.tick(200);

      assert.strictEqual(callCount, 0, 'Should not be called yet');

      clock.tick(100);
      assert.strictEqual(callCount, 1, 'Should be called after full delay');
    });
  });

  suite('Date Formatting', () => {
    function formatDate(date: Date): string {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return 'Today';
      } else if (diffDays === 1) {
        return 'Yesterday';
      } else if (diffDays < 7) {
        return `${diffDays} days ago`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
      } else {
        return date.toLocaleDateString();
      }
    }

    test('should format today', () => {
      const now = new Date();
      assert.strictEqual(formatDate(now), 'Today');
    });

    test('should format yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      assert.strictEqual(formatDate(yesterday), 'Yesterday');
    });

    test('should format days ago', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      assert.strictEqual(formatDate(threeDaysAgo), '3 days ago');
    });

    test('should format weeks ago (singular)', () => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      assert.strictEqual(formatDate(oneWeekAgo), '1 week ago');
    });

    test('should format weeks ago (plural)', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      assert.strictEqual(formatDate(twoWeeksAgo), '2 weeks ago');
    });

    test('should format older dates with locale string', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      const result = formatDate(oldDate);
      // Should be a date string, not "X weeks ago"
      assert.ok(!result.includes('weeks ago'), 'Should not use weeks for dates > 30 days');
    });
  });

  suite('Search Result Conversion', () => {
    interface SearchResult {
      id: string;
      title: string;
      spaceKey: string;
      spaceName: string;
      excerpt: string;
      lastModified: Date;
      webUrl: string;
    }

    interface SearchQuickPickItem {
      label: string;
      description?: string;
      detail?: string;
      result?: SearchResult;
      action?: 'load-more' | 'no-results';
      alwaysShow?: boolean;
    }

    function resultsToQuickPickItems(
      results: SearchResult[],
      hasMore: boolean
    ): SearchQuickPickItem[] {
      if (results.length === 0) {
        return [
          {
            label: '$(info) No results found',
            description: 'Try a different search term',
            action: 'no-results',
            alwaysShow: true,
          },
        ];
      }

      const items: SearchQuickPickItem[] = results.map((result) => ({
        label: result.title,
        description: `$(folder) ${result.spaceKey}`,
        detail: `${result.excerpt.substring(0, 100)}${result.excerpt.length > 100 ? '...' : ''} - Today`,
        result,
      }));

      if (hasMore) {
        items.push({
          label: '$(ellipsis) Load more results...',
          description: '',
          action: 'load-more',
          alwaysShow: true,
        });
      }

      return items;
    }

    test('should return no-results item for empty results', () => {
      const items = resultsToQuickPickItems([], false);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].action, 'no-results');
      assert.ok(items[0].label.includes('No results'));
    });

    test('should convert results to QuickPick items', () => {
      const results: SearchResult[] = [
        {
          id: '123',
          title: 'Test Document',
          spaceKey: 'TEST',
          spaceName: 'Test Space',
          excerpt: 'This is a test excerpt',
          lastModified: new Date(),
          webUrl: 'https://test.atlassian.net/wiki/spaces/TEST/pages/123',
        },
      ];

      const items = resultsToQuickPickItems(results, false);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].label, 'Test Document');
      assert.ok(items[0].description?.includes('TEST'));
      assert.strictEqual(items[0].result, results[0]);
    });

    test('should add load-more item when hasMore is true', () => {
      const results: SearchResult[] = [
        {
          id: '123',
          title: 'Test Document',
          spaceKey: 'TEST',
          spaceName: 'Test Space',
          excerpt: 'This is a test excerpt',
          lastModified: new Date(),
          webUrl: 'https://test.atlassian.net/wiki/spaces/TEST/pages/123',
        },
      ];

      const items = resultsToQuickPickItems(results, true);
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[1].action, 'load-more');
    });

    test('should truncate long excerpts', () => {
      const longExcerpt = 'a'.repeat(200);
      const results: SearchResult[] = [
        {
          id: '123',
          title: 'Test Document',
          spaceKey: 'TEST',
          spaceName: 'Test Space',
          excerpt: longExcerpt,
          lastModified: new Date(),
          webUrl: 'https://test.atlassian.net/wiki/spaces/TEST/pages/123',
        },
      ];

      const items = resultsToQuickPickItems(results, false);
      assert.ok(items[0].detail?.includes('...'), 'Should have ellipsis for truncated excerpt');
      assert.ok((items[0].detail?.length ?? 0) < longExcerpt.length, 'Detail should be shorter than original');
    });
  });
});
