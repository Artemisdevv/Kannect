import type React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/native', () => ({ isNativeApp: () => native.value }));
vi.mock('@/components/shopper-shell', () => ({ useShopper: () => ({ area: 'Kaloor', setLocationOpen: () => {} }) }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }));
import { Route } from '@/routes/settings';

afterEach(cleanup);
const Settings = (Route as unknown as { component: () => React.ReactElement }).component;

describe('Settings install section', () => {
  it('offers "Add to home screen" in a browser', () => {
    native.value = false;
    render(<Settings />);
    expect(screen.getByText(/Add to home screen/i)).toBeTruthy();
  });
  it('is hidden inside the Android app', () => {
    native.value = true;
    render(<Settings />);
    expect(screen.queryByText(/Add to home screen/i)).toBeNull();
    expect(screen.queryByText(/on your home screen/i)).toBeNull();
    expect(screen.getByText(/Settings & privacy/i)).toBeTruthy(); // the rest of the page is still there
  });
});
