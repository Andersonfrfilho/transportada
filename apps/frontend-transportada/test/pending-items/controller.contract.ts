/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createPendingItemsController } from '../../src/modules/pending-items/hooks/usePendingItems.hook'

describe('pending items controller contract', () => {
  test('reads pending items only with fleet.read', () => {
    expect(createPendingItemsController({ permissions: [] }).canReadPendingItems).toBe(false)
    expect(createPendingItemsController({ permissions: ['fleet.read'] }).canReadPendingItems).toBe(
      true,
    )
    expect(
      createPendingItemsController({ permissions: ['fleet.manage'] }).canReadPendingItems,
    ).toBe(false)
  })
})
