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

describe('as rotas da medição de caixa (spec 085 G005, spec 155 G003/G004)', () => {
  test('publica a fila, a exportação, o interruptor, a gravação da medida e da unidade, as irmãs e a réplica', () => {
    expect(ROUTES.map((route) => `${route.method} ${route.pathname}`).sort()).toEqual([
      'GET /nfe-package-boxes',
      'GET /nfe-package-boxes/:id/siblings',
      'GET /nfe-package-boxes/measurement-settings',
      'GET /nfe-package-boxes/pending-export',
      'POST /nfe-package-boxes/:id/replicate',
      'PUT /nfe-package-boxes/:id',
      'PUT /nfe-package-boxes/:id/unit',
    ])
  })

  /**
   * ⚠️ `cargo.measure`, nunca `settings.manage`: quem confere caixa no galpão receberia de carona o
   * preço do combustível, a tabela de frete e a credencial da prefeitura. Vale também para a leitura
   * do interruptor (spec 152 D14) e para as duas rotas novas da spec 155: é o conferente que decide
   * a família e replica, não quem administra configurações.
   */
  test('as sete pedem cargo.measure no escopo da empresa (spec 163: a unidade também)', () => {
    for (const route of ROUTES) {
      expect(route.policy).toEqual({ permission: 'cargo.measure', scope: 'company' })
    }
  })

  test('a fila, a exportação, o interruptor e as irmãs são leitura; a medida e a réplica são escrita', () => {
    expect(routeOf('GET', '/nfe-package-boxes')).toBeDefined()
    expect(routeOf('GET', '/nfe-package-boxes/measurement-settings')).toBeDefined()
    expect(routeOf('GET', '/nfe-package-boxes/pending-export')).toBeDefined()
    expect(routeOf('GET', '/nfe-package-boxes/:id/siblings')).toBeDefined()
    expect(routeOf('PUT', '/nfe-package-boxes/:id')).toBeDefined()
    expect(routeOf('POST', '/nfe-package-boxes/:id/replicate')).toBeDefined()
  })
})
