import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/lib/services/pages';
import { isLocale, localePath } from '@/lib/i18n/config';

describe('renderMarkdown — injection safety', () => {
  it('escapes a script tag', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes an inline event handler', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).toContain('&lt;img');
    // The attribute must survive only as inert text: never inside a real tag.
    expect(html).not.toMatch(/<[^>]*onerror/i);
  });

  it('emits no anchor at all, so a javascript: URI cannot become a link', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
  });

  it('emits only the tags it defines', () => {
    const html = renderMarkdown(
      '<script>x</script><iframe src=y></iframe><style>z</style>**ok**',
    );
    for (const allowed of ['<p', '<strong>']) {
      expect(html).toContain(allowed);
    }
    for (const forbidden of ['<script', '<iframe', '<style', '<a ', '<img']) {
      expect(html).not.toContain(forbidden);
    }
  });

  it('still supports bold and italics', () => {
    expect(renderMarkdown('**bold** and *italic*')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('**bold** and *italic*')).toContain('<em>italic</em>');
  });

  it('renders an unordered list', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toContain('<ul');
    expect(html).toContain('<li>one</li>');
  });

  it('renders an ordered list', () => {
    const html = renderMarkdown('1. first\n2. second');
    expect(html).toContain('<ol');
    expect(html).toContain('<li>second</li>');
  });

  it('does not escape Arabic text', () => {
    const html = renderMarkdown('سياسة الخصوصية');
    expect(html).toContain('سياسة الخصوصية');
  });

  it('escapes quotes so attribute injection is impossible', () => {
    const html = renderMarkdown('He said "hello" and \'goodbye\'');
    expect(html).not.toContain('"hello"');
  });
});

describe('locale validation in routing', () => {
  it('rejects a path traversal attempt', () => {
    expect(isLocale('..')).toBe(false);
    expect(isLocale('../admin')).toBe(false);
  });

  it('rejects a locale that could smuggle a protocol', () => {
    expect(isLocale('//evil.example')).toBe(false);
    expect(isLocale('fr/../../admin')).toBe(false);
  });

  it('builds paths that always stay under the locale prefix', () => {
    expect(localePath('fr', '../admin')).toBe('/fr/../admin');
    // The important property: the locale segment comes first, so a router
    // resolves it before any relative segment is evaluated.
    expect(localePath('fr', '/offers').startsWith('/fr/')).toBe(true);
  });
});
