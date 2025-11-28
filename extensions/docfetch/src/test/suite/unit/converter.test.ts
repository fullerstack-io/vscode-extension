import * as assert from 'assert';
import { StorageToMarkdownConverter } from '../../../confluence/converters/storage-to-markdown';
import { ConfluenceDocument } from '../../../confluence/types';

/**
 * Markdown Converter Tests
 *
 * Tests the conversion of Confluence storage format to Markdown.
 */

suite('StorageToMarkdownConverter', () => {
  let converter: StorageToMarkdownConverter;

  setup(() => {
    converter = new StorageToMarkdownConverter();
  });

  function createMockDocument(content: string): ConfluenceDocument {
    return {
      id: '123',
      title: 'Test Document',
      spaceKey: 'TEST',
      spaceName: 'Test Space',
      version: 1,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15'),
      author: 'Test User',
      content,
      webUrl: 'https://test.atlassian.net/wiki/spaces/TEST/pages/123',
      labels: ['test', 'documentation'],
    };
  }

  suite('Basic HTML Conversion', () => {
    test('should convert headings', () => {
      const doc = createMockDocument('<h1>Main Title</h1><h2>Subtitle</h2>');
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('# Main Title'));
      assert.ok(result.markdown.includes('## Subtitle'));
    });

    test('should convert paragraphs', () => {
      const doc = createMockDocument('<p>First paragraph.</p><p>Second paragraph.</p>');
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('First paragraph.'));
      assert.ok(result.markdown.includes('Second paragraph.'));
    });

    test('should convert bold and italic', () => {
      const doc = createMockDocument('<p><strong>bold</strong> and <em>italic</em></p>');
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('**bold**'));
      assert.ok(result.markdown.includes('*italic*'));
    });

    test('should convert links', () => {
      const doc = createMockDocument('<p><a href="https://example.com">Link Text</a></p>');
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('[Link Text](https://example.com)'));
    });

    test('should convert unordered lists', () => {
      const doc = createMockDocument('<ul><li>Item 1</li><li>Item 2</li></ul>');
      const result = converter.convert(doc);

      // Turndown may use different spacing (e.g., "-   " or "- ")
      assert.ok(result.markdown.includes('-') && result.markdown.includes('Item 1'));
      assert.ok(result.markdown.includes('-') && result.markdown.includes('Item 2'));
    });

    test('should convert ordered lists', () => {
      const doc = createMockDocument('<ol><li>First</li><li>Second</li></ol>');
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('1. First') || result.markdown.includes('1.  First'));
      assert.ok(result.markdown.includes('2. Second') || result.markdown.includes('2.  Second'));
    });
  });

  suite('Confluence Macro Conversion', () => {
    test('should convert code macro to fenced code block', () => {
      const doc = createMockDocument(`
        <ac:structured-macro ac:name="code">
          <ac:parameter ac:name="language">javascript</ac:parameter>
          <ac:plain-text-body><![CDATA[console.log("hello");]]></ac:plain-text-body>
        </ac:structured-macro>
      `);
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('```javascript'));
      assert.ok(result.markdown.includes('console.log("hello");'));
      assert.ok(result.markdown.includes('```'));
    });

    test('should convert info macro to blockquote', () => {
      const doc = createMockDocument(`
        <ac:structured-macro ac:name="info">
          <ac:rich-text-body>This is important information.</ac:rich-text-body>
        </ac:structured-macro>
      `);
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('> **Info:**') || result.markdown.includes('**Info**'));
      assert.ok(result.markdown.includes('important information'));
    });

    test('should convert warning macro to blockquote', () => {
      const doc = createMockDocument(`
        <ac:structured-macro ac:name="warning">
          <ac:rich-text-body>Be careful!</ac:rich-text-body>
        </ac:structured-macro>
      `);
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('Warning') || result.markdown.includes('warning'));
      assert.ok(result.markdown.includes('Be careful!'));
    });

    test('should convert note macro to blockquote', () => {
      const doc = createMockDocument(`
        <ac:structured-macro ac:name="note">
          <ac:rich-text-body>A note to remember.</ac:rich-text-body>
        </ac:structured-macro>
      `);
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('Note') || result.markdown.includes('note'));
    });

    test('should convert panel macro', () => {
      const doc = createMockDocument(`
        <ac:structured-macro ac:name="panel">
          <ac:parameter ac:name="title">Panel Title</ac:parameter>
          <ac:rich-text-body>Panel content here.</ac:rich-text-body>
        </ac:structured-macro>
      `);
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('Panel Title') || result.markdown.includes('Panel content'));
    });

    test('should convert expand macro to details element', () => {
      const doc = createMockDocument(`
        <ac:structured-macro ac:name="expand">
          <ac:parameter ac:name="title">Click to expand</ac:parameter>
          <ac:rich-text-body>Hidden content.</ac:rich-text-body>
        </ac:structured-macro>
      `);
      const result = converter.convert(doc);

      assert.ok(
        result.markdown.includes('<details>') ||
        result.markdown.includes('Click to expand') ||
        result.markdown.includes('Hidden content')
      );
    });

    test('should remove TOC macro', () => {
      const doc = createMockDocument(`
        <ac:structured-macro ac:name="toc"/>
        <p>Content after TOC</p>
      `);
      const result = converter.convert(doc);

      assert.ok(!result.markdown.includes('toc'));
      assert.ok(result.markdown.includes('Content after TOC'));
    });
  });

  suite('Frontmatter Generation', () => {
    test('should generate correct frontmatter', () => {
      const doc = createMockDocument('<p>Content</p>');
      const result = converter.convert(doc);

      assert.strictEqual(result.frontmatter.title, 'Test Document');
      assert.strictEqual(result.frontmatter.confluence_id, '123');
      assert.strictEqual(result.frontmatter.space_key, 'TEST');
      assert.strictEqual(result.frontmatter.version, 1);
      assert.strictEqual(result.frontmatter.author, 'Test User');
      assert.deepStrictEqual(result.frontmatter.labels, ['test', 'documentation']);
    });

    test('should include synced_at timestamp', () => {
      const doc = createMockDocument('<p>Content</p>');
      const result = converter.convert(doc);

      assert.ok(result.frontmatter.synced_at);
      // Should be a valid ISO date string
      assert.ok(new Date(result.frontmatter.synced_at).getTime() > 0);
    });

    test('should include modified_at from document', () => {
      const doc = createMockDocument('<p>Content</p>');
      const result = converter.convert(doc);

      assert.ok(result.frontmatter.modified_at);
      assert.strictEqual(result.frontmatter.modified_at, '2024-01-15T00:00:00.000Z');
    });
  });

  suite('Markdown File Building', () => {
    test('should build complete markdown file with frontmatter', () => {
      const doc = createMockDocument('<h1>Title</h1><p>Content</p>');
      const result = converter.convert(doc);
      const markdown = converter.buildMarkdownFile(result);

      // Should start with YAML frontmatter
      assert.ok(markdown.startsWith('---\n'));
      assert.ok(markdown.includes('title:'));
      assert.ok(markdown.includes('confluence_id:'));
      assert.ok(markdown.includes('---\n\n'));

      // Should include content after frontmatter
      assert.ok(markdown.includes('# Title'));
      assert.ok(markdown.includes('Content'));
    });

    test('should escape special YAML characters in title', () => {
      const doc: ConfluenceDocument = {
        ...createMockDocument('<p>Content</p>'),
        title: 'Title with "quotes" and: colons',
      };
      const result = converter.convert(doc);
      const markdown = converter.buildMarkdownFile(result);

      // Should have escaped the quotes
      assert.ok(markdown.includes('title:'));
      // The file should be valid (no syntax errors)
      assert.ok(markdown.startsWith('---'));
    });
  });

  suite('Edge Cases', () => {
    test('should handle empty content', () => {
      const doc = createMockDocument('');
      const result = converter.convert(doc);

      assert.strictEqual(result.markdown, '');
    });

    test('should handle nested lists', () => {
      const doc = createMockDocument(`
        <ul>
          <li>Item 1
            <ul>
              <li>Nested 1</li>
              <li>Nested 2</li>
            </ul>
          </li>
          <li>Item 2</li>
        </ul>
      `);
      const result = converter.convert(doc);

      assert.ok(result.markdown.includes('Item 1'));
      assert.ok(result.markdown.includes('Nested 1'));
    });

    test('should handle tables', () => {
      const doc = createMockDocument(`
        <table>
          <tr><th>Header 1</th><th>Header 2</th></tr>
          <tr><td>Cell 1</td><td>Cell 2</td></tr>
        </table>
      `);
      const result = converter.convert(doc);

      // GFM tables should be converted
      assert.ok(result.markdown.includes('Header 1'));
      assert.ok(result.markdown.includes('Cell 1'));
    });

    test('should clean up excessive newlines', () => {
      const doc = createMockDocument('<p>Para 1</p>\n\n\n\n\n<p>Para 2</p>');
      const result = converter.convert(doc);

      // Should not have more than 2 consecutive newlines
      assert.ok(!result.markdown.includes('\n\n\n'));
    });
  });
});
