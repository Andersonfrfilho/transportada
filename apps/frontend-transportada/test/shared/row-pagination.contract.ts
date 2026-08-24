/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { paginateRows, parsePageSize } from '@/modules/shared/rowPagination.service'

describe('row pagination contract', () => {
  test('walks the whole list across pages, losing nothing', () => {
    const rows = Array.from({ length: 294 }, (_unused, index) => index + 1)

    const first = paginateRows({ page: 1, pageSize: 200, rows })
    expect(first.rows).toHaveLength(200)
    expect(first.firstShown).toBe(1)
    expect(first.lastShown).toBe(200)
    expect(first.hasNextPage).toBe(true)
    expect(first.canGoToPreviousPage).toBe(false)

    const second = paginateRows({ page: 2, pageSize: 200, rows })
    expect(second.rows).toHaveLength(94)
    expect(second.lastShown).toBe(294)
    expect(second.hasNextPage).toBe(false)

    expect([...first.rows, ...second.rows]).toEqual(rows)
  })

  /** Encolher a página estando na última deixaria a tabela vazia com o total cheio. */
  test('clamps the requested page into what exists', () => {
    const rows = Array.from({ length: 294 }, (_unused, index) => index + 1)

    expect(paginateRows({ page: 99, pageSize: 200, rows }).pageNumber).toBe(2)
    expect(paginateRows({ page: 0, pageSize: 200, rows }).pageNumber).toBe(1)

    const empty = paginateRows({ page: 1, pageSize: 50, rows: [] })
    expect(empty.pageCount).toBe(1)
    expect(empty.firstShown).toBe(0)
    expect(empty.lastShown).toBe(0)
    expect(empty.hasNextPage).toBe(false)
  })

  test('falls back when the stored page size is no longer offered', () => {
    const sizes = [50, 100, 200] as const
    expect(parsePageSize({ fallback: 50, sizes, value: '100' })).toBe(100)
    expect(parsePageSize({ fallback: 50, sizes, value: '7' })).toBe(50)
    expect(parsePageSize({ fallback: 50, sizes, value: '' })).toBe(50)
  })
})
