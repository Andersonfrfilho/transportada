/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  isPagedViewActive,
  neighborStopId,
  parseStopViewMode,
  resolvePageStopId,
} from '@/modules/driver-trip/shared/stopPaging.service'
import type { DriverTripStop } from '@/modules/driver-trip/shared/driverTrip.types'

const stops = ['a', 'b', 'c'].map((id) => ({ id })) as unknown as readonly DriverTripStop[]

describe('uma parada por página (pedido do motorista, 27/10)', () => {
  it('o padrão é a página; só "list" gravado devolve a lista', () => {
    expect(parseStopViewMode(null)).toBe('paged')
    expect(parseStopViewMode(undefined)).toBe('paged')
    expect(parseStopViewMode('lixo')).toBe('paged')
    expect(parseStopViewMode('paged')).toBe('paged')
    expect(parseStopViewMode('list')).toBe('list')
  })

  it('a página é a parada atual, ou a última quando tudo foi resolvido', () => {
    expect(resolvePageStopId({ currentStopId: 'b', override: undefined, stops })).toBe('b')
    expect(resolvePageStopId({ currentStopId: undefined, override: undefined, stops })).toBe('c')
    expect(resolvePageStopId({ currentStopId: undefined, override: undefined, stops: [] })).toBe(
      undefined,
    )
  })

  it('a navegação do motorista vale até a parada atual mudar', () => {
    const override = { stopId: 'a', whenCurrentWas: 'b' }
    expect(resolvePageStopId({ currentStopId: 'b', override, stops })).toBe('a')
    expect(resolvePageStopId({ currentStopId: 'c', override, stops })).toBe('c')
  })

  it('uma sobrescrita para parada que sumiu da viagem é ignorada', () => {
    const override = { stopId: 'zzz', whenCurrentWas: 'b' }
    expect(resolvePageStopId({ currentStopId: 'b', override, stops })).toBe('b')
  })

  it('anterior e próxima andam pela ordem e param nas pontas', () => {
    expect(neighborStopId({ direction: 'next', stopId: 'a', stops })).toBe('b')
    expect(neighborStopId({ direction: 'previous', stopId: 'c', stops })).toBe('b')
    expect(neighborStopId({ direction: 'previous', stopId: 'a', stops })).toBeUndefined()
    expect(neighborStopId({ direction: 'next', stopId: 'c', stops })).toBeUndefined()
    expect(neighborStopId({ direction: 'next', stopId: 'x', stops })).toBeUndefined()
  })

  it('"Ver todas" vale até a parada atual mudar; busca e modo lista sempre mostram a lista', () => {
    const base = { currentStopId: 'b', mode: 'paged', searchTerm: '' } as const
    expect(isPagedViewActive({ ...base, showListWhenCurrentWas: undefined })).toBe(true)
    expect(isPagedViewActive({ ...base, showListWhenCurrentWas: { currentStopId: 'b' } })).toBe(
      false,
    )
    expect(isPagedViewActive({ ...base, showListWhenCurrentWas: { currentStopId: 'a' } })).toBe(
      true,
    )
    expect(isPagedViewActive({ ...base, searchTerm: 'x', showListWhenCurrentWas: undefined })).toBe(
      false,
    )
    expect(isPagedViewActive({ ...base, mode: 'list', showListWhenCurrentWas: undefined })).toBe(
      false,
    )
  })
})
