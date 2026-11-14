import { describe, expect, test } from 'bun:test';
import { ConfigurationError } from '@/app/config';
import { createContainer } from '@/app/container';

describe('createContainer', () => {
  test('validates configuration before building dependencies', () => {
    expect(() => createContainer({ NODE_ENV: 'test' })).toThrow(ConfigurationError);
  });
});
