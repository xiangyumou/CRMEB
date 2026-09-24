import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetOpenGuard } from '@/platform/nav';
import { taroFake } from './taro-fake/taro';

afterEach(() => {
  cleanup();
  taroFake.reset();
  // A test opening the page the previous one just opened is not a double tap.
  resetOpenGuard();
});
