import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Emergency Mode theme and accessibility styles', () => {
  it('keeps the trigger white and readable only in light mode and defines interactive states', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/emergency-mode.css'), 'utf8');
    expect(css).toContain('html[data-theme="light"] .emergency-mode-trigger{--emergency-trigger-bg:#fff;--emergency-trigger-fg:#20332e');
    expect(css).toContain('html[data-theme="light"] .emergency-mode-trigger:hover');
    expect(css).toContain('html[data-theme="light"] .emergency-mode-trigger:active');
    expect(css).toContain('.emergency-mode-trigger:disabled');
    expect(css).toContain('.emergency-mode-trigger:focus-visible');
    expect(css).toContain('--emergency-trigger-bg:#8f3826;--emergency-trigger-fg:#fff');
    expect(css).toContain('.emergency-mode-trigger svg{color:inherit}');
  });

  it('defines readable text, backgrounds, focus indicators, and reduced-motion behavior', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/emergency-mode.css'), 'utf8');
    expect(css).toContain('--emergency-text:#f0f5f2');
    expect(css).toContain('--emergency-text:#172c25');
    expect(css).toContain('--emergency-muted:#c0cfcc');
    expect(css).toContain('--emergency-muted:#41594f');
    expect(css).toContain('.emergency-dialog :is(a,button,input,[tabindex]):focus-visible');
    expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  });
});
