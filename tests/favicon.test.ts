import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
describe('FloodSense favicon', () => {
  it('references local SVG and PNG assets through the configured Vite base path', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('href="%BASE_URL%favicon.svg"');
    expect(html).toContain('href="%BASE_URL%favicon-32.png"');
    expect(html).toContain('<title>FloodSense');
    expect(existsSync(resolve(root, 'public/favicon.svg'))).toBe(true);
    expect(existsSync(resolve(root, 'public/favicon-32.png'))).toBe(true);
  });
});
