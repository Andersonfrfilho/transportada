/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { runPreDeploy } from '../../src/database/pre-deploy.service.js'

describe('Pre-deploy da API', () => {
  test('provisiona depois da migration, nunca antes', async () => {
    const order: string[] = []

    await runPreDeploy({
      migrate: async () => {
        order.push('migrate')
      },
      provision: async () => {
        order.push('provision')
        return ['company']
      },
    })

    expect(order).toEqual(['migrate', 'provision'])
  })

  test('ambiente sem empresa declarada migra e reporta o provisionamento pulado', async () => {
    const report = await runPreDeploy({
      migrate: async () => undefined,
      provision: undefined,
    })

    expect(report).toEqual({ migrated: true, provisioning: 'skipped' })
  })

  test('reporta o que foi criado para o deploy virar evidência', async () => {
    const report = await runPreDeploy({
      migrate: async () => undefined,
      provision: async () => ['company'],
    })

    expect(report).toEqual({ created: ['company'], migrated: true, provisioning: 'ensured' })
  })

  // Migration que falha não pode deixar o provisionamento rodar contra schema velho.
  test('migration que falha aborta antes de provisionar', async () => {
    let provisioned = false

    const failure = await runPreDeploy({
      migrate: async () => {
        throw new Error('migration failed')
      },
      provision: async () => {
        provisioned = true
        return []
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(provisioned).toBe(false)
  })
})
