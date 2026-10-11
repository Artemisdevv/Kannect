import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }));
import { isNativeApp } from '@/lib/native';

describe('isNativeApp', () => {
  beforeEach(() => { native.value = false; });
  it('is false in a normal browser', () => expect(isNativeApp()).toBe(false));
  it('is true inside the Android app', () => { native.value = true; expect(isNativeApp()).toBe(true); });
});
