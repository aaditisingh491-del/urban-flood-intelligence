import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('theme safety advice styles', () => {
  it('defines contrasting light and dark colors plus visible keyboard and hover states', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/themes.css'), 'utf8');
    expect(css).toContain('--advice-background: #e8f5e9');
    expect(css).toContain('--advice-text: #1b4332');
    expect(css).toContain('--advice-background: #111b23');
    expect(css).toContain('.home-safety-panel .advice summary:focus-visible');
    expect(css).toContain('.home-safety-panel .advice:hover');
    const routeCss = readFileSync(resolve(process.cwd(), 'src/themes.css'), 'utf8');
    expect(routeCss).toContain('html[data-theme=\"light\"] .route-option.selected');
    expect(routeCss).toContain('html[data-theme=\"dark\"] .route-result strong');
  });
});
