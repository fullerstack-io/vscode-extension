/**
 * Test fixtures for Confluence API responses
 */

export const mockPageResponse = {
  id: '123456789',
  status: 'current',
  title: 'Sample API Documentation',
  spaceId: 'space-123',
  version: {
    number: 5,
    createdAt: '2024-01-15T10:30:00.000Z',
    authorId: 'user-abc123',
    message: 'Updated API endpoints',
  },
  body: {
    storage: {
      value: `
        <h1>API Documentation</h1>
        <p>This document describes the REST API.</p>
        <h2>Endpoints</h2>
        <ac:structured-macro ac:name="code">
          <ac:parameter ac:name="language">http</ac:parameter>
          <ac:plain-text-body><![CDATA[GET /api/users
POST /api/users
GET /api/users/:id]]></ac:plain-text-body>
        </ac:structured-macro>
        <ac:structured-macro ac:name="info">
          <ac:rich-text-body>All endpoints require authentication.</ac:rich-text-body>
        </ac:structured-macro>
      `,
      representation: 'storage',
    },
  },
  _links: {
    webui: '/wiki/spaces/DEV/pages/123456789/Sample+API+Documentation',
    base: 'https://company.atlassian.net',
  },
};

export const mockSearchResponse = {
  results: [
    {
      content: {
        id: '111',
        type: 'page',
        title: 'Getting Started Guide',
        space: {
          key: 'DOCS',
          name: 'Documentation',
        },
        version: {
          when: '2024-01-10T08:00:00.000Z',
        },
        _links: {
          webui: '/wiki/spaces/DOCS/pages/111/Getting+Started+Guide',
        },
      },
      excerpt: 'Learn how to <em>get started</em> with our platform...',
      lastModified: '2024-01-10T08:00:00.000Z',
    },
    {
      content: {
        id: '222',
        type: 'page',
        title: 'API Reference',
        space: {
          key: 'DOCS',
          name: 'Documentation',
        },
        version: {
          when: '2024-01-12T14:30:00.000Z',
        },
        _links: {
          webui: '/wiki/spaces/DOCS/pages/222/API+Reference',
        },
      },
      excerpt: 'Complete <em>API reference</em> documentation...',
      lastModified: '2024-01-12T14:30:00.000Z',
    },
  ],
  totalSize: 42,
  _links: {
    next: '/rest/api/search?cql=text~%22query%22&cursor=eyJjdXJzb3IiOiJuZXh0In0',
  },
};

export const mockSpacesResponse = {
  results: [
    {
      id: 'space-1',
      key: 'DEV',
      name: 'Development',
      type: 'global',
    },
    {
      id: 'space-2',
      key: 'TEAM',
      name: 'Team Space',
      type: 'global',
    },
    {
      id: 'space-3',
      key: '~user123',
      name: 'Personal Space',
      type: 'personal',
    },
  ],
};

export const mockConfluenceStorageFormat = `
<h1>Document Title</h1>
<p>Introduction paragraph with <strong>bold</strong> and <em>italic</em> text.</p>

<h2>Code Example</h2>
<ac:structured-macro ac:name="code">
  <ac:parameter ac:name="language">typescript</ac:parameter>
  <ac:parameter ac:name="title">Example</ac:parameter>
  <ac:plain-text-body><![CDATA[
function hello(name: string): void {
  console.log(\`Hello, \${name}!\`);
}
  ]]></ac:plain-text-body>
</ac:structured-macro>

<h2>Notes</h2>
<ac:structured-macro ac:name="info">
  <ac:rich-text-body>
    <p>This is an informational note.</p>
  </ac:rich-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="warning">
  <ac:rich-text-body>
    <p>This is a warning message.</p>
  </ac:rich-text-body>
</ac:structured-macro>

<h2>Expandable Section</h2>
<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Click to expand</ac:parameter>
  <ac:rich-text-body>
    <p>Hidden content that can be expanded.</p>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
    </ul>
  </ac:rich-text-body>
</ac:structured-macro>

<h2>Links</h2>
<p>See also: <ac:link>
  <ri:page ri:content-title="Related Document"/>
  <ac:link-body>Related Document</ac:link-body>
</ac:link></p>

<h2>Table</h2>
<table>
  <tr>
    <th>Header 1</th>
    <th>Header 2</th>
  </tr>
  <tr>
    <td>Cell 1</td>
    <td>Cell 2</td>
  </tr>
</table>
`;

export const expectedMarkdownOutput = `# Document Title

Introduction paragraph with **bold** and *italic* text.

## Code Example

\`\`\`typescript
function hello(name: string): void {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`

## Notes

> **Info:** This is an informational note.

> **Warning:** This is a warning message.

## Expandable Section

<details>
<summary>Click to expand</summary>

Hidden content that can be expanded.

- Item 1
- Item 2

</details>

## Links

See also: [Related Document](confluence://Related%20Document)

## Table

| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |
`;
