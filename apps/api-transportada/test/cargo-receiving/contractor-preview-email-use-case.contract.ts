/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b: o caso de uso gera o token no servidor, entrega ao repositório SÓ o hash, devolve o endereço
 * uma vez, e transforma o que falta (listas, domínio de entrada, contratante) em erro de código estável.
 */
import { describe, expect, test } from 'bun:test'

import type { ContractorPreviewEmailRepositoryPort } from '../../src/cargo-receiving/application/contractor-preview-email.port.js'
import type {
  PreviewEmailSettings,
  RotatePreviewInboundTokenRecordParams,
} from '../../src/cargo-receiving/application/contractor-preview-email.types.js'
import { createContractorPreviewEmailUseCases } from '../../src/cargo-receiving/application/contractor-preview-email.use-case.js'
import { hashPreviewInboundToken } from '../../src/cargo-receiving/domain/preview-inbound-token.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'

const CONTEXT: CompanyContext = {
  companyId: '00000000-0000-4000-8000-000000000c01',
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-000000000c02',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: '00000000-0000-4000-8000-000000000c03',
}
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c04'
const FIXED_TOKEN = 'abcdefghijklmnopqrstuvwxyz'
const SETTINGS: PreviewEmailSettings = {
  contractorId: CONTRACTOR_ID,
  forwarderAllowlist: ['equipe@transportadora.test'],
  hasInboundToken: false,
  inboundTokenSetAt: null,
  senderAllowlist: ['contratante.test'],
}

function createRepository(overrides: Partial<ContractorPreviewEmailRepositoryPort>) {
  const calls: unknown[] = []
  const repository: ContractorPreviewEmailRepositoryPort = {
    async listIntakes(params) {
      calls.push(params)
      return []
    },
    async read(params) {
      calls.push(params)
      return SETTINGS
    },
    async rotateInboundToken(params) {
      calls.push(params)
      return { isRotation: false, replyDomain: 'entrada.exemplo.test', status: 'rotated' }
    },
    async saveAllowlists(params) {
      calls.push(params)
      return { settings: SETTINGS, status: 'saved' }
    },
    ...overrides,
  }
  return { calls, repository }
}

async function failureOf(operation: () => Promise<unknown>): Promise<ApiError> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('a operação deveria ter falhado')
}

const ROTATE_INPUT = {
  context: CONTEXT,
  contractorId: CONTRACTOR_ID,
  correlationId: 'correlacao',
  ipAddress: '203.0.113.9',
}

describe('gerar o endereço de entrada da prévia (spec 237 T4.6b)', () => {
  test('o repositório recebe só o hash; o token volta uma vez, no endereço do domínio de entrada', async () => {
    const { calls, repository } = createRepository({})
    const useCases = createContractorPreviewEmailUseCases({
      generateToken: () => FIXED_TOKEN,
      repository,
    })

    const result = await useCases.rotateInboundToken.execute(ROTATE_INPUT)

    expect(result).toEqual({
      address: `${FIXED_TOKEN}@entrada.exemplo.test`,
      token: FIXED_TOKEN,
    })
    const [call] = calls as RotatePreviewInboundTokenRecordParams[]
    expect(call).toEqual({
      actor: {
        companyId: CONTEXT.companyId,
        correlationId: 'correlacao',
        ipAddress: '203.0.113.9',
        userId: CONTEXT.userId,
      },
      contractorId: CONTRACTOR_ID,
      tokenHash: hashPreviewInboundToken(FIXED_TOKEN),
    })
    expect(JSON.stringify(calls)).not.toContain(FIXED_TOKEN)
  })

  test('cada chamada gera um token novo', async () => {
    const { repository } = createRepository({})
    const useCases = createContractorPreviewEmailUseCases({ repository })

    const first = await useCases.rotateInboundToken.execute(ROTATE_INPUT)
    const second = await useCases.rotateInboundToken.execute(ROTATE_INPUT)

    expect(first.token).not.toBe(second.token)
    expect(first.token).toMatch(/^[a-z2-7]{26}$/u)
  })

  test('sem as duas listas: 422 com código estável, listando o que falta', async () => {
    const { repository } = createRepository({
      async rotateInboundToken() {
        return { missing: ['forwarderAllowlist', 'senderAllowlist'], status: 'allowlists_missing' }
      },
    })
    const useCases = createContractorPreviewEmailUseCases({ repository })

    const error = await failureOf(() => useCases.rotateInboundToken.execute(ROTATE_INPUT))

    expect(error.status).toBe(422)
    expect(error.code).toBe('RECEIVING_PROFILE_ALLOWLISTS_REQUIRED')
    expect(error.details?.map((detail) => detail.field)).toEqual([
      'forwarderAllowlist',
      'senderAllowlist',
    ])
  })

  test('sem domínio de entrada configurado: 409 com código estável', async () => {
    const { repository } = createRepository({
      async rotateInboundToken() {
        return { status: 'domain_not_configured' }
      },
    })
    const useCases = createContractorPreviewEmailUseCases({ repository })

    const error = await failureOf(() => useCases.rotateInboundToken.execute(ROTATE_INPUT))

    expect(error.status).toBe(409)
    expect(error.code).toBe('RECEIVING_PROFILE_INBOUND_DOMAIN_NOT_CONFIGURED')
  })

  test('contratante de outra empresa é 404 nas quatro operações', async () => {
    const { repository } = createRepository({
      async listIntakes() {
        return null
      },
      async read() {
        return null
      },
      async rotateInboundToken() {
        return { status: 'contractor_not_found' }
      },
      async saveAllowlists() {
        return { status: 'contractor_not_found' }
      },
    })
    const useCases = createContractorPreviewEmailUseCases({ repository })
    const base = { context: CONTEXT, contractorId: CONTRACTOR_ID }

    const errors = await Promise.all([
      failureOf(() => useCases.getSettings.execute(base)),
      failureOf(() => useCases.listIntakes.execute({ ...base, limit: 10 })),
      failureOf(() => useCases.rotateInboundToken.execute(ROTATE_INPUT)),
      failureOf(() =>
        useCases.saveAllowlists.execute({
          ...ROTATE_INPUT,
          forwarderAllowlist: [],
          senderAllowlist: [],
        }),
      ),
    ])

    expect(errors.map((error) => [error.status, error.code])).toEqual(
      Array.from({ length: 4 }, () => [404, 'CONTRACTOR_NOT_FOUND']),
    )
  })
})

describe('editar as listas da prévia por e-mail (spec 237 T4.6b)', () => {
  test('remover uma lista com endereço ativo é 422, nomeando a lista', async () => {
    const { repository } = createRepository({
      async saveAllowlists() {
        return { missing: ['senderAllowlist'], status: 'allowlists_required' }
      },
    })
    const useCases = createContractorPreviewEmailUseCases({ repository })

    const error = await failureOf(() =>
      useCases.saveAllowlists.execute({
        ...ROTATE_INPUT,
        forwarderAllowlist: ['equipe@transportadora.test'],
        senderAllowlist: [],
      }),
    )

    expect(error.status).toBe(422)
    expect(error.code).toBe('RECEIVING_PROFILE_ALLOWLISTS_REQUIRED')
    expect(error.details?.map((detail) => detail.field)).toEqual(['senderAllowlist'])
  })

  /** Revisão de segurança (L1): o CHECK do banco recusou o que a política deixou passar — 422 estável, nunca 500. */
  test('lista que o CHECK do banco recusa é 422 com código estável', async () => {
    const { repository } = createRepository({
      async saveAllowlists() {
        return { status: 'allowlists_invalid' }
      },
    })
    const useCases = createContractorPreviewEmailUseCases({ repository })

    const error = await failureOf(() =>
      useCases.saveAllowlists.execute({
        ...ROTATE_INPUT,
        forwarderAllowlist: ['equipe@transportadora.test'],
        senderAllowlist: ['contratante.test'],
      }),
    )

    expect(error.status).toBe(422)
    expect(error.code).toBe('RECEIVING_PROFILE_ALLOWLISTS_INVALID')
  })

  test('grava com o ator e o IP do contexto e devolve o que o repositório devolveu', async () => {
    const { calls, repository } = createRepository({})
    const useCases = createContractorPreviewEmailUseCases({ repository })

    const saved = await useCases.saveAllowlists.execute({
      ...ROTATE_INPUT,
      forwarderAllowlist: ['equipe@transportadora.test'],
      senderAllowlist: ['contratante.test'],
    })

    expect(saved).toEqual(SETTINGS)
    expect(calls).toEqual([
      {
        actor: {
          companyId: CONTEXT.companyId,
          correlationId: 'correlacao',
          ipAddress: '203.0.113.9',
          userId: CONTEXT.userId,
        },
        contractorId: CONTRACTOR_ID,
        forwarderAllowlist: ['equipe@transportadora.test'],
        senderAllowlist: ['contratante.test'],
      },
    ])
  })
})
