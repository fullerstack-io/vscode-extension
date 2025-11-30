import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gfm } = require('turndown-plugin-gfm');
import { ConfluenceDocument, DocumentFrontmatter } from '../types';

export interface ConversionResult {
  markdown: string;
  frontmatter: DocumentFrontmatter;
}

/**
 * Converts Confluence storage format (XHTML) to Markdown.
 */
export class StorageToMarkdownConverter {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
    });

    // Add GitHub Flavored Markdown support (tables, strikethrough, etc.)
    this.turndown.use(gfm);

    // Remove all HTML tags that Turndown doesn't handle - extract text content only
    this.turndown.remove(['script', 'style', 'noscript']);

    // Keep these elements but let Turndown process their content
    this.turndown.keep([]);

    // Add custom rules for Confluence-specific elements
    this.addConfluenceRules();
  }

  /**
   * Convert a Confluence document to Markdown with frontmatter.
   */
  convert(document: ConfluenceDocument): ConversionResult {
    // Pre-process Confluence storage format
    const preprocessed = this.preprocess(document.content);

    // Convert to Markdown
    const markdown = this.turndown.turndown(preprocessed);

    // Post-process the Markdown
    const cleanedMarkdown = this.postprocess(markdown);

    // Generate frontmatter
    const frontmatter = this.generateFrontmatter(document);

    return {
      markdown: cleanedMarkdown,
      frontmatter,
    };
  }

  /**
   * Build the final Markdown file content with frontmatter.
   */
  buildMarkdownFile(result: ConversionResult): string {
    const yaml = this.frontmatterToYaml(result.frontmatter);
    return `---\n${yaml}---\n\n${result.markdown}`;
  }

  /**
   * Pre-process Confluence storage format before Turndown conversion.
   * Handles Confluence-specific macros and elements.
   */
  private preprocess(storage: string): string {
    const $ = cheerio.load(storage, { xml: true });

    // Convert code macro
    $('ac\\:structured-macro[ac\\:name="code"], structured-macro[name="code"]').each((_, el) => {
      const $el = $(el);
      const language = $el.find('ac\\:parameter[ac\\:name="language"], parameter[name="language"]').text() || '';
      const code = $el.find('ac\\:plain-text-body, plain-text-body').text();
      $el.replaceWith(`<pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>`);
    });

    // Convert info/note/warning/tip panels
    const panelTypes = ['info', 'note', 'warning', 'tip'];
    panelTypes.forEach((type) => {
      $(`ac\\:structured-macro[ac\\:name="${type}"], structured-macro[name="${type}"]`).each((_, el) => {
        const $el = $(el);
        const content = $el.find('ac\\:rich-text-body, rich-text-body').html() || '';
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        $el.replaceWith(`<blockquote><strong>${label}:</strong> ${content}</blockquote>`);
      });
    });

    // Convert panel macro
    $('ac\\:structured-macro[ac\\:name="panel"], structured-macro[name="panel"]').each((_, el) => {
      const $el = $(el);
      const title = $el.find('ac\\:parameter[ac\\:name="title"], parameter[name="title"]').text();
      const content = $el.find('ac\\:rich-text-body, rich-text-body').html() || '';
      const titleHtml = title ? `<strong>${title}</strong><br/>` : '';
      $el.replaceWith(`<blockquote>${titleHtml}${content}</blockquote>`);
    });

    // Convert expand macro (collapsible sections) - use blockquote with title
    $('ac\\:structured-macro[ac\\:name="expand"], structured-macro[name="expand"]').each((_, el) => {
      const $el = $(el);
      const title = $el.find('ac\\:parameter[ac\\:name="title"], parameter[name="title"]').text() || 'Details';
      const content = $el.find('ac\\:rich-text-body, rich-text-body').html() || '';
      $el.replaceWith(`<blockquote><strong>${title}</strong><br/>${content}</blockquote>`);
    });

    // Convert status macro - output as plain text badge
    $('ac\\:structured-macro[ac\\:name="status"], structured-macro[name="status"]').each((_, el) => {
      const $el = $(el);
      const title = $el.find('ac\\:parameter[ac\\:name="title"], parameter[name="title"]').text();
      $el.replaceWith(`**[${title}]**`);
    });

    // Convert Confluence links to standard links
    $('ac\\:link, link').each((_, el) => {
      const $el = $(el);
      const pageTitle = $el.find('ri\\:page, page').attr('ri:content-title') ||
                        $el.find('ri\\:page, page').attr('content-title');
      const linkBody = $el.find('ac\\:link-body, link-body').text() || pageTitle;
      if (pageTitle) {
        $el.replaceWith(`<a href="confluence://${encodeURIComponent(pageTitle)}">${linkBody}</a>`);
      }
    });

    // Convert Confluence images
    $('ac\\:image, image').each((_, el) => {
      const $el = $(el);
      const filename = $el.find('ri\\:attachment, attachment').attr('ri:filename') ||
                       $el.find('ri\\:attachment, attachment').attr('filename');
      if (filename) {
        $el.replaceWith(`<img src="attachment://${encodeURIComponent(filename)}" alt="${filename}" />`);
      }
    });

    // Convert emoticons
    $('ac\\:emoticon, emoticon').each((_, el) => {
      const $el = $(el);
      const name = $el.attr('ac:name') || $el.attr('name');
      const emoji = this.emoticonToEmoji(name || '');
      $el.replaceWith(emoji);
    });

    // Remove TOC macro (not useful in local markdown)
    $('ac\\:structured-macro[ac\\:name="toc"], structured-macro[name="toc"]').remove();

    // Remove other Confluence macros we can't convert
    $('ac\\:structured-macro, structured-macro').each((_, el) => {
      const $el = $(el);
      const content = $el.find('ac\\:rich-text-body, rich-text-body').html() || '';
      if (content) {
        $el.replaceWith(content);
      } else {
        $el.remove();
      }
    });

    return $.html();
  }

  /**
   * Post-process the converted Markdown.
   */
  private postprocess(markdown: string): string {
    let result = markdown;

    // Convert HTML entities to their actual characters
    result = result.replace(/&nbsp;/g, ' ');
    result = result.replace(/&amp;/g, '&');
    result = result.replace(/&lt;/g, '<');
    result = result.replace(/&gt;/g, '>');
    result = result.replace(/&quot;/g, '"');
    result = result.replace(/&#39;/g, "'");
    result = result.replace(/&apos;/g, "'");
    result = result.replace(/&hellip;/g, '...');
    result = result.replace(/&mdash;/g, '—');
    result = result.replace(/&ndash;/g, '–');
    result = result.replace(/&lsquo;/g, "'");
    result = result.replace(/&rsquo;/g, "'");
    result = result.replace(/&ldquo;/g, '"');
    result = result.replace(/&rdquo;/g, '"');
    result = result.replace(/&bull;/g, '•');
    result = result.replace(/&copy;/g, '©');
    result = result.replace(/&reg;/g, '®');
    result = result.replace(/&trade;/g, '™');
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

    // Remove any remaining HTML tags (but keep their content)
    // This catches any tags that Turndown didn't handle
    result = result.replace(/<(?!\/?(a|img)\b)[^>]+>/gi, (match) => {
      // Keep <a> and <img> tags, remove everything else
      if (match.startsWith('<a ') || match.startsWith('<img ') || match === '</a>') {
        return match;
      }
      return '';
    });

    // Clean up empty links and images with special protocols
    result = result.replace(/\[([^\]]*)\]\(confluence:\/\/[^)]+\)/g, '$1');
    result = result.replace(/!\[([^\]]*)\]\(attachment:\/\/[^)]+\)/g, '[$1]');

    // Remove excessive newlines (more than 2)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Fix escaped characters that don't need escaping in our context
    result = result.replace(/\\([_*])/g, '$1');

    // Trim whitespace
    return result.trim();
  }

  /**
   * Generate frontmatter from document metadata.
   */
  private generateFrontmatter(document: ConfluenceDocument): DocumentFrontmatter {
    return {
      title: document.title,
      confluence_id: document.id,
      confluence_url: document.webUrl,
      space_key: document.spaceKey,
      version: document.version,
      synced_at: new Date().toISOString(),
      modified_at: document.updatedAt.toISOString(),
      author: document.author,
      labels: document.labels,
    };
  }

  /**
   * Convert frontmatter object to YAML string.
   */
  private frontmatterToYaml(frontmatter: DocumentFrontmatter): string {
    const lines: string[] = [];

    lines.push(`title: "${this.escapeYamlString(frontmatter.title)}"`);
    lines.push(`confluence_id: "${frontmatter.confluence_id}"`);
    lines.push(`confluence_url: "${frontmatter.confluence_url}"`);
    lines.push(`space_key: "${frontmatter.space_key}"`);
    lines.push(`version: ${frontmatter.version}`);
    lines.push(`synced_at: "${frontmatter.synced_at}"`);
    lines.push(`modified_at: "${frontmatter.modified_at}"`);
    lines.push(`author: "${this.escapeYamlString(frontmatter.author)}"`);

    if (frontmatter.labels.length > 0) {
      lines.push('labels:');
      frontmatter.labels.forEach((label) => {
        lines.push(`  - "${this.escapeYamlString(label)}"`);
      });
    } else {
      lines.push('labels: []');
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Escape special characters for YAML strings.
   */
  private escapeYamlString(str: string): string {
    return str.replace(/["\\]/g, '\\$&');
  }

  /**
   * Escape HTML special characters.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Add custom Turndown rules for Confluence elements.
   */
  private addConfluenceRules(): void {
    // Handle <details> elements (from expand macro) - convert to bold heading + content
    this.turndown.addRule('details', {
      filter: 'details',
      replacement: (content, node) => {
        const details = node as Element;
        const summary = details.querySelector('summary');
        const summaryText = summary ? summary.textContent || 'Details' : 'Details';
        const bodyContent = content.replace(summaryText, '').trim();
        return `\n**${summaryText}**\n\n${bodyContent}\n`;
      },
    });

    // Handle <summary> elements - just return the text
    this.turndown.addRule('summary', {
      filter: 'summary',
      replacement: (content) => content,
    });

    // Handle status spans - convert to text badge
    this.turndown.addRule('status', {
      filter: (node) => {
        return node.nodeName === 'SPAN' &&
          (node.classList?.contains('status') || /^\[.*\]$/.test(node.textContent || ''));
      },
      replacement: (content) => content,
    });

    // Handle table cells - ensure proper spacing
    this.turndown.addRule('tableCell', {
      filter: ['th', 'td'],
      replacement: (content, node) => {
        const cell = node as Element;
        const trimmedContent = content.trim().replace(/\n/g, ' ');
        // Return cell content with pipe delimiter
        // The GFM plugin will handle the overall table structure
        return ` ${trimmedContent} |`;
      },
    });

    // Handle table rows
    this.turndown.addRule('tableRow', {
      filter: 'tr',
      replacement: (content, node) => {
        const row = node as Element;
        const parent = row.parentElement;
        const isInHeader = parent?.nodeName === 'THEAD';
        const hasThCells = row.querySelector('th') !== null;
        const isFirstRow = parent?.firstElementChild === row;

        // Only add separator after the first header row
        const isHeaderRow = isInHeader || (hasThCells && isFirstRow);

        let result = '|' + content + '\n';

        // Add separator row only after the header row (first row with th cells)
        if (isHeaderRow && isFirstRow) {
          const cellCount = row.querySelectorAll('th, td').length;
          const separator = '|' + ' --- |'.repeat(cellCount);
          result += separator + '\n';
        }

        return result;
      },
    });

    // Handle table elements
    this.turndown.addRule('table', {
      filter: 'table',
      replacement: (content) => {
        return '\n\n' + content.trim() + '\n\n';
      },
    });

    // Handle tbody/thead - just pass through content
    this.turndown.addRule('tableBody', {
      filter: ['thead', 'tbody', 'tfoot'],
      replacement: (content) => content,
    });

    // Handle any remaining divs - just return content
    this.turndown.addRule('div', {
      filter: 'div',
      replacement: (content) => content + '\n',
    });

    // Handle any remaining spans - just return content
    this.turndown.addRule('span', {
      filter: 'span',
      replacement: (content) => content,
    });
  }

  /**
   * Convert Confluence emoticon names to emoji.
   */
  private emoticonToEmoji(name: string): string {
    const emoticons: Record<string, string> = {
      'smile': ':slightly_smiling_face:',
      'sad': ':slightly_frowning_face:',
      'wink': ':wink:',
      'thumbs-up': ':+1:',
      'thumbs-down': ':-1:',
      'information': ':information_source:',
      'tick': ':white_check_mark:',
      'cross': ':x:',
      'warning': ':warning:',
      'plus': ':heavy_plus_sign:',
      'minus': ':heavy_minus_sign:',
      'question': ':question:',
      'light-on': ':bulb:',
      'light-off': ':bulb:',
      'yellow-star': ':star:',
      'red-star': ':star:',
      'green-star': ':star:',
      'blue-star': ':star:',
    };

    return emoticons[name] || '';
  }
}
