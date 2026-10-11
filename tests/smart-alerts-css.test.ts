import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Smart Alerts theme styles', () => {
  it('provides readable dark/light tokens, focus indicators, and reduced-motion support', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/smart-alerts.css'), 'utf8');
    expect(css).toContain('--alerts-text:#e6efeb');
    expect(css).toContain('--alerts-text:#20332e');
    expect(css).toContain('--alerts-bg:#0b1117');
    expect(css).toContain('--alerts-bg:#f4f7f5');
    expect(css).toContain('.smart-alerts-page :is(a,button,input,summary):focus-visible');
    expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  });
});
