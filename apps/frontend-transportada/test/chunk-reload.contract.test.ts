/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CHUNK_RELOAD_COOLDOWN_MILLISECONDS,
  shouldReloadAfterChunkError,
} from '../src/modules/shared/chunkReload.service'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  } as unknown as Storage
}

describe('chunkReload', () => {
  test('recarrega na primeira falha e trava dentro da janela', () => {
    const storage = memoryStorage()
    expect(shouldReloadAfterChunkError(storage, 1_000_000)).toBe(true)
    expect(shouldReloadAfterChunkError(storage, 1_000_000 + 1_000)).toBe(false)
    expect(
      shouldReloadAfterChunkError(storage, 1_000_000 + CHUNK_RELOAD_COOLDOWN_MILLISECONDS + 1),
    ).toBe(true)
  })
  test('sem storage não recarrega', () => {
    expect(shouldReloadAfterChunkError(null, 1)).toBe(false)
  })
})
