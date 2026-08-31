/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { seedNotificationTemplates } from '../../src/notification/application/notification-template-seed.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

type Upsert = { readonly channel: string; readonly key: string; readonly locale: string }

function createModule(existing: readonly Upsert[]) {
  const upserts: Upsert[] = []

  return {
    module: {
      useCases: {
        listTemplates: { execute: () => Promise.resolve([...existing]) },
        upsertTemplate: {
          execute: (input: Upsert) => {
            upserts.push(input)
            return Promise.resolve(input)
          },
        },
      },
    },
    upserts,
  }
}

function seed(existing: readonly Upsert[]) {
  const fake = createModule(existing)
  return seedNotificationTemplates({
    companyId: COMPANY_ID,
    module: fake.module as unknown as Parameters<typeof seedNotificationTemplates>[0]['module'],
  }).then((count) => ({ count, upserts: fake.upserts }))
}

/**
 * O catálogo é o texto de partida, não a fonte da verdade. Antes, todo deploy publicava a versão do
 * código por cima — o texto ajustado no painel voltava ao original na subida seguinte, sem aviso.
 * Com o painel de edição isso deixa de ser proteção e vira perda de trabalho.
 */
describe('o seed de template só preenche o que falta', () => {
  test('base vazia recebe o catálogo inteiro', async () => {
    const { count, upserts } = await seed([])

    expect(count).toBeGreaterThan(0)
    expect(upserts).toHaveLength(count)
  })

  test('o que já existe não é reescrito', async () => {
    const { upserts: all } = await seed([])
    const { count, upserts } = await seed(all)

    expect(count).toBe(0)
    expect(upserts).toEqual([])
  })

  /** Template novo no catálogo continua nascendo sozinho: só o já existente é preservado. */
  test('aviso novo no catálogo nasce mesmo com os outros já gravados', async () => {
    const { upserts: all } = await seed([])
    const { count, upserts } = await seed(all.slice(1))

    expect(count).toBe(1)
    expect(upserts[0]).toMatchObject({ key: all[0]?.key })
  })

  /** A chave é `(key, channel, locale)`: o mesmo aviso em canal diferente é outro template. */
  test('o mesmo aviso em outro canal não é confundido', async () => {
    const { upserts: all } = await seed([])
    const other = all.map((entry) => ({ ...entry, channel: 'canal-que-nao-existe' }))
    const { count } = await seed(other)

    expect(count).toBe(all.length)
  })
})
