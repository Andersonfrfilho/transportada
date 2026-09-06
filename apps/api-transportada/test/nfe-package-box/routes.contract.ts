/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createPackageBoxRoutes } from '../../src/nfe-documents/presentation/package-box.routes.js'

function unusedDependencies(): never {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler) as never
}

const ROUTES = createPackageBoxRoutes(unusedDependencies())

function routeOf(method: string, pathname: string) {
  return ROUTES.find((route) => route.method === method && route.pathname === pathname)
}

describe('as rotas da medição de caixa (spec 085 G005)', () => {
  test('publica a fila e a gravação da medida', () => {
    expect(ROUTES.map((route) => `${route.method} ${route.pathname}`).sort()).toEqual([
      'GET /nfe-package-boxes',
      'PUT /nfe-package-boxes/:id',
    ])
  })

  /**
   * ⚠️ `cargo.measure`, nunca `settings.manage`: quem confere caixa no galpão receberia de carona o
   * preço do combustível, a tabela de frete e a credencial da prefeitura.
   */
  test('as duas pedem cargo.measure no escopo da empresa', () => {
    for (const route of ROUTES) {
      expect(route.policy).toEqual({ permission: 'cargo.measure', scope: 'company' })
    }
  })

  test('a fila é leitura e a medida é escrita idempotente', () => {
    expect(routeOf('GET', '/nfe-package-boxes')).toBeDefined()
    expect(routeOf('PUT', '/nfe-package-boxes/:id')).toBeDefined()
  })
})
