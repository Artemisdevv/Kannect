import { describe, expect, it } from 'vitest';
import { textElement } from '@/lib/safe-dom';

describe('textElement', () => {
  it('shows markup as text instead of running it', () => {
    const name = '<img src=x onerror="window.__pwned = true"><b>Shop</b>';
    const el = textElement(name);
    document.body.appendChild(el);
    expect(el.textContent).toBe(name);
    expect(el.querySelector('img')).toBeNull();
    expect(el.children.length).toBe(0);
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    el.remove();
  });

  it('keeps ordinary names, including Malayalam, unchanged', () => {
    expect(textElement("Mary Matha Provision").textContent).toBe('Mary Matha Provision');
    expect(textElement('അദ്നാൻ സ്റ്റോഴ്സ്').textContent).toBe('അദ്നാൻ സ്റ്റോഴ്സ്');
  });
});
