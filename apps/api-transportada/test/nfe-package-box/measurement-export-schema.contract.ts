/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { parsePackageBoxMeasurementExportList } from '../../src/nfe-documents/presentation/package-box-measurement-export.schema.js'
import { createPackageBoxMeasurementExportRoutes } from '../../src/nfe-documents/presentation/package-box-measurement-export.routes.js'

function url(query: string): URL {
  return new URL(`https://api.example.com/nfe-package-box-measurements${query}`)
}

describe('a rota de export do histórico de medida (spec 152, T5, R8)', () => {
  test('sem filtro nenhum, usa o cursor/limit padrão de `readPaging`', () => {
    expect(parsePackageBoxMeasurementExportList(url(''))).toEqual({
      cursor: null,
      from: undefined,
      limit: 25,
      to: undefined,
    })
  })

  test('aceita `from`/`to` em ISO 8601 e `limit` até o teto', () => {
    expect(
      parsePackageBoxMeasurementExportList(
        url('?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.000Z&limit=100'),
      ),
    ).toEqual({
      cursor: null,
      from: '2026-09-01T00:00:00.000Z',
      limit: 100,
      to: '2026-09-30T23:59:59.000Z',
    })
  })

  test('cursor malformado é 400, nunca ignorado em silêncio', () => {
    expect(() => parsePackageBoxMeasurementExportList(url('?cursor=nao-e-um-cursor'))).toThrow(
      ApiError,
    )
    try {
      parsePackageBoxMeasurementExportList(url('?cursor=nao-e-um-cursor'))
      throw new Error('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(400)
    }
  })

  test('`from`/`to` fora do formato ISO é 400', () => {
    expect(() => parsePackageBoxMeasurementExportList(url('?from=10-09-2026'))).toThrow(ApiError)
    expect(() => parsePackageBoxMeasurementExportList(url('?to=amanha'))).toThrow(ApiError)
  })

  test('`limit` acima de 100 é 400 (mesmo teto de `readPaging`)', () => {
    expect(() => parsePackageBoxMeasurementExportList(url('?limit=101'))).toThrow(ApiError)
  })

  test('parâmetro desconhecido é 400, não silêncio', () => {
    expect(() => parsePackageBoxMeasurementExportList(url('?productDescription=x'))).toThrow(
      ApiError,
    )
  })
})

function unusedDependencies(): never {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler) as never
}

describe('a rota publicada (spec 152, T5, R8)', () => {
  test('GET /nfe-package-box-measurements pede settings.manage no escopo da empresa', () => {
    const routes = createPackageBoxMeasurementExportRoutes(unusedDependencies())
    expect(routes.map((route) => `${route.method} ${route.pathname}`)).toEqual([
      'GET /nfe-package-box-measurements',
    ])
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
  })
})
