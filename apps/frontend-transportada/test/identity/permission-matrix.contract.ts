/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  groupPermissions,
  OTHER_PERMISSION_GROUP,
  PERMISSION_GROUPS,
} from '../../src/modules/identity/shared/permissionGroups.constant'

const LOCALE_PATH = new URL(
  '../../src/modules/identity/locales/identity.locale.json',
  import.meta.url,
)

const POLICY_PATH = new URL(
  '../../../api-transportada/src/identity/domain/authorization.policy.ts',
  import.meta.url,
)

/** `companies.manage` é reservada e sem consumidor (ADR-0021): a API não a serve, e a tela não a mostra. */
const PLATFORM_PERMISSION = 'companies.manage'

async function readApiPermissions(): Promise<readonly string[]> {
  const source = await readFile(POLICY_PATH, 'utf8')
  const catalog = source.slice(
    source.indexOf('TRANSPORTADA_PERMISSIONS'),
    source.indexOf('export type TransportadaPermission'),
  )
  return [...catalog.matchAll(/'([a-z.-]+)',/gu)]
    .map((match) => match[1] ?? '')
    .filter((permission) => permission !== PLATFORM_PERMISSION)
}

/**
 * O agrupamento é de apresentação; a fonte da verdade é a API. O risco desta tela é ela **esconder**
 * poder concedido — uma permissão nova na API que o mapa daqui não conheça sumiria da matriz sem
 * ninguém notar, e a tela existe justamente para tornar visível o que era invisível.
 */
describe('agrupamento das permissões', () => {
  test('permissão desconhecida cai em "Outras" em vez de sumir', () => {
    const groups = groupPermissions(['users.manage', 'coisa.nova'])
    const other = groups.find((group) => group.key === OTHER_PERMISSION_GROUP)

    expect(other?.permissions).toEqual(['coisa.nova'])
  })

  test('nenhuma permissão servida se perde no caminho', () => {
    const served = [...PERMISSION_GROUPS.flatMap((group) => [...group.permissions]), 'coisa.nova']
    const grouped = groupPermissions(served).flatMap((group) => group.permissions)

    expect([...grouped].sort()).toEqual([...served].sort())
  })

  test('grupo sem permissão servida não vira cabeçalho vazio', () => {
    const groups = groupPermissions(['users.manage'])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.key).toBe('identity')
  })

  test('a mesma permissão não aparece em dois grupos', () => {
    const all = PERMISSION_GROUPS.flatMap((group) => [...group.permissions])

    expect(new Set(all).size).toBe(all.length)
  })
})

/**
 * Rótulo é o que transforma a grade de códigos em resposta. Permissão sem texto cairia no
 * `defaultValue` e mostraria `trip.financials` a quem precisa decidir se concede o papel.
 */
describe('rótulos das permissões', () => {
  test('toda permissão agrupada tem nome e diz o que guarda', async () => {
    const locale = JSON.parse(await readFile(LOCALE_PATH, 'utf8')) as {
      users: { permission: Record<string, { label: string; where: string }> }
    }

    for (const group of PERMISSION_GROUPS) {
      for (const permission of group.permissions) {
        expect(locale.users.permission[permission]?.label ?? '').not.toBe('')
        expect(locale.users.permission[permission]?.where ?? '').not.toBe('')
      }
    }
  })
})

/**
 * O modo de falha desta tela é silencioso: permissão nova na API sem rótulo aqui aparece como
 * `trip.financials` cru para quem precisa decidir se concede o papel — e permissão nova fora do
 * agrupamento cai em "Outras", que é visível mas não explica nada.
 */
describe('paridade com o catálogo da API', () => {
  test('toda permissão que a API concede está agrupada e nomeada aqui', async () => {
    const apiPermissions = await readApiPermissions()
    const grouped = new Set<string>(PERMISSION_GROUPS.flatMap((group) => [...group.permissions]))
    const locale = JSON.parse(await readFile(LOCALE_PATH, 'utf8')) as {
      users: { permission: Record<string, { label: string; where: string }> }
    }

    expect(apiPermissions.length).toBeGreaterThan(0)
    for (const permission of apiPermissions) {
      expect({ grouped: grouped.has(permission), permission }).toEqual({
        grouped: true,
        permission,
      })
      expect(locale.users.permission[permission]?.label ?? '').not.toBe('')
    }
  })

  test('não inventa permissão que a API não concede', async () => {
    const apiPermissions = new Set<string>(await readApiPermissions())

    for (const group of PERMISSION_GROUPS) {
      for (const permission of group.permissions) {
        expect({ permission, served: apiPermissions.has(permission) }).toEqual({
          permission,
          served: true,
        })
      }
    }
  })
})
