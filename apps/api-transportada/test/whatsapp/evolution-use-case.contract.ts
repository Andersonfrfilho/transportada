/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type {
  WhatsAppEvolutionCredential,
  WhatsAppEvolutionGatewayPort,
  WhatsAppEvolutionRepositoryPort,
  WhatsAppEvolutionSaveRecord,
  WhatsAppEvolutionSummary,
} from '../../src/whatsapp/application/whatsapp-evolution.port.js'
import { createWhatsAppEvolutionSecretService } from '../../src/whatsapp/application/whatsapp-evolution-secret.service.js'
import { createWhatsAppEvolutionUseCase } from '../../src/whatsapp/application/whatsapp-evolution.use-case.js'
import { normalizeEvolutionBaseUrl } from '../../src/whatsapp/domain/evolution-base-url.policy.js'
import {
  WhatsAppEvolutionApiKeyRequiredError,
  WhatsAppEvolutionBaseUrlRejectedError,
  WhatsAppEvolutionDisabledError,
  WhatsAppEvolutionNotConfiguredError,
  WhatsAppEvolutionProviderNotEnabledError,
  WhatsAppEvolutionProvisioningUnavailableError,
  WhatsAppEvolutionRiskNotAcknowledgedError,
  WhatsAppEvolutionUnavailableError,
  WhatsAppEvolutionUnreachableError,
} from '../../src/whatsapp/domain/whatsapp-evolution.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000009'
const SETTINGS_ID = '00000000-0000-4000-8000-000000000040'
const NEW_SETTINGS_ID = '00000000-0000-4000-8000-000000000041'
const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID } as unknown as CompanyContext
const API_KEY = 'chave-secreta-da-instancia'
const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

/** Cofre de mentira que respeita o AAD, como o do canal da Meta. */
function createFakeProvider(): SecretEnvelopeProvider {
  const vault = new Map<string, { aad: string; plaintext: string }>()
  let sequence = 0
  return {
    async decrypt({ additionalAuthenticatedData, envelope }) {
      const stored = vault.get(envelope.ciphertext)
      if (stored === undefined) throw new Error('unknown ciphertext')
      if (stored.aad !== TEXT_DECODER.decode(additionalAuthenticatedData)) {
        throw new Error('aad mismatch')
      }
      return TEXT_ENCODER.encode(stored.plaintext)
    },
    async encrypt({ additionalAuthenticatedData, plaintext }) {
      sequence += 1
      const ciphertext = `cipher-${sequence}`
      vault.set(ciphertext, {
        aad: TEXT_DECODER.decode(additionalAuthenticatedData),
        plaintext: TEXT_DECODER.decode(plaintext),
      })
      return {
        algorithm: 'A256GCM',
        ciphertext,
        keyId: 'key-1',
        nonce: 'nonce-1',
        version: 1,
      } satisfies SecretEnvelopeV1
    },
  }
}

const SUMMARY: WhatsAppEvolutionSummary = {
  apiKeyConfigured: true,
  baseUrl: 'https://evolution.exemplo.com',
  connectionCheckedAt: null,
  connectionState: 'unknown',
  createdAt: '2026-10-27T12:00:00.000Z',
  dailyCap: 50,
  defaultProvider: 'meta',
  id: SETTINGS_ID,
  instanceName: 'transportada',
  minIntervalSeconds: 15,
  riskAcknowledgedAt: null,
  status: 'disabled',
  updatedAt: '2026-10-27T12:00:00.000Z',
  version: '1',
}

const VALUES = {
  acknowledgeRisk: false,
  baseUrl: 'https://evolution.exemplo.com/',
  dailyCap: 50,
  defaultProvider: 'meta' as const,
  instanceName: 'transportada',
  minIntervalSeconds: 15,
  status: 'disabled' as const,
}

async function buildFixture(
  input: {
    readonly existing?: WhatsAppEvolutionSummary | null
    readonly emptyQrs?: number
    readonly gatewayFails?: boolean
    readonly owner?: string
    readonly provisioner?: 'fails' | 'ok'
    readonly state?: 'close' | 'connecting' | 'open'
    readonly status?: 'active' | 'disabled'
  } = {},
) {
  const secrets = createWhatsAppEvolutionSecretService({ envelopeProvider: createFakeProvider() })
  const sealed = await secrets.encrypt({
    apiKey: API_KEY,
    companyId: COMPANY_ID,
    settingsId: SETTINGS_ID,
  })
  const saved: WhatsAppEvolutionSaveRecord[] = []
  const recorded: { audited: boolean; state: string }[] = []
  const qrAudits: string[] = []
  const provisioned: string[] = []
  const warnings: string[] = []
  const gatewayCalls: { apiKey: string; baseUrl: string; instanceName: string; method: string }[] =
    []

  const repository: WhatsAppEvolutionRepositoryPort = {
    find: async () => (input.existing === undefined ? SUMMARY : input.existing),
    findCredential: async ({ companyId }): Promise<WhatsAppEvolutionCredential | null> =>
      input.existing === null || companyId !== COMPANY_ID
        ? null
        : {
            baseUrl: SUMMARY.baseUrl,
            companyId,
            envelope: sealed,
            instanceName: SUMMARY.instanceName,
            settingsId: SETTINGS_ID,
            status: input.status ?? 'active',
          },
    recordConnection: async (request) => {
      recorded.push({ audited: request.audit !== undefined, state: request.state })
      return SUMMARY
    },
    recordQrRequest: async (request) => {
      qrAudits.push(request.audit.action)
    },
    save: async (record) => {
      saved.push(record)
      return SUMMARY
    },
  }
  const gateway: WhatsAppEvolutionGatewayPort = {
    getConnectionState: async (request) => {
      gatewayCalls.push({ ...request, method: 'state' })
      if (input.gatewayFails === true) throw new Error('boom: https://evolution/secret')
      return input.state ?? 'close'
    },
    getQrCode: async (request) => {
      gatewayCalls.push({ ...request, method: 'qr' })
      if (gatewayCalls.filter((call) => call.method === 'qr').length <= (input.emptyQrs ?? 0)) {
        return { pairingCode: null, qrBase64: null }
      }
      return { pairingCode: 'ABCD-1234', qrBase64: 'iVBORw0KGgo=' }
    },
    getOwnerNumber: async (request) => {
      gatewayCalls.push({ ...request, method: 'owner' })
      return input.owner ?? null
    },
    logout: async (request) => {
      gatewayCalls.push({ ...request, method: 'logout' })
      if (input.gatewayFails === true) throw new Error('boom: https://evolution/secret')
    },
  }
  const useCase = createWhatsAppEvolutionUseCase({
    gateway,
    logger: { warn: (message) => warnings.push(message) },
    newSettingsId: () => NEW_SETTINGS_ID,
    now: () => new Date('2026-10-27T12:00:00.000Z'),
    sleep: async () => {},
    ...(input.provisioner === undefined
      ? {}
      : {
          provisioner: {
            baseUrl: 'https://evolution.exemplo.com',
            createInstance: async (request: { readonly instanceName: string }) => {
              provisioned.push(request.instanceName)
              if (input.provisioner === 'fails') throw new Error('boom: chave-global')
              return { token: 'token-da-instancia' }
            },
          },
        }),
    repository,
    secrets,
  })

  return {
    gatewayCalls,
    provisioned,
    warnings,
    qrAudits,
    recorded,
    saved,
    secrets,
    sealed,
    useCase,
  }
}

describe('a configuração do Evolution (spec 281 T4)', () => {
  test('cadastro novo exige a chave da instância', async () => {
    const fixture = await buildFixture({ existing: null })

    await expect(
      fixture.useCase.save({ context: CONTEXT, correlationId: 'c1', values: VALUES }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionApiKeyRequiredError)
    expect(fixture.saved).toEqual([])
  })

  test('sela a chave para a linha nova, normaliza o endereço e audita sem valores', async () => {
    const fixture = await buildFixture({ existing: null })

    await fixture.useCase.save({
      context: CONTEXT,
      correlationId: 'c1',
      values: { ...VALUES, apiKey: API_KEY },
    })

    const record = fixture.saved[0] as WhatsAppEvolutionSaveRecord
    expect(record.settingsId).toBe(NEW_SETTINGS_ID)
    expect(record.baseUrl).toBe('https://evolution.exemplo.com')
    expect(record.resetConnection).toBe(true)
    const opened = await fixture.secrets.decrypt({
      companyId: COMPANY_ID,
      envelope: record.secretEnvelope as SecretEnvelopeV1,
      settingsId: NEW_SETTINGS_ID,
    })
    expect(opened.apiKey).toBe(API_KEY)
    expect(JSON.stringify(record.audit)).not.toContain(API_KEY)
    expect(JSON.stringify(record.audit)).not.toContain('evolution.exemplo.com')
    expect(record.audit.afterSnapshot.changedFields).toContain('apiKey')
  })

  test('atualiza sem chave: o envelope fica como está e a conexão não é zerada', async () => {
    const fixture = await buildFixture()

    await fixture.useCase.save({
      context: CONTEXT,
      correlationId: 'c1',
      values: { ...VALUES, dailyCap: 80 },
    })

    const record = fixture.saved[0] as WhatsAppEvolutionSaveRecord
    expect(record.secretEnvelope).toBeUndefined()
    expect(record.settingsId).toBe(SETTINGS_ID)
    expect(record.resetConnection).toBe(false)
    expect(record.audit.afterSnapshot.changedFields).toEqual(['dailyCap'])
  })

  test('ligar exige o aviso de risco, uma vez só (RF7)', async () => {
    const fixture = await buildFixture()

    await expect(
      fixture.useCase.save({
        context: CONTEXT,
        correlationId: 'c1',
        values: { ...VALUES, status: 'active' },
      }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionRiskNotAcknowledgedError)

    await fixture.useCase.save({
      context: CONTEXT,
      correlationId: 'c1',
      values: { ...VALUES, acknowledgeRisk: true, status: 'active' },
    })
    expect((fixture.saved[0] as WhatsAppEvolutionSaveRecord).riskAcknowledgedBy).toBe(USER_ID)

    const acknowledged = await buildFixture({
      existing: { ...SUMMARY, riskAcknowledgedAt: '2026-10-27T11:00:00.000Z' },
    })
    await acknowledged.useCase.save({
      context: CONTEXT,
      correlationId: 'c1',
      values: { ...VALUES, status: 'active' },
    })
    expect(
      (acknowledged.saved[0] as WhatsAppEvolutionSaveRecord).riskAcknowledgedBy,
    ).toBeUndefined()
  })

  test('o Evolution só é provedor padrão com a configuração ligada', async () => {
    const fixture = await buildFixture()

    await expect(
      fixture.useCase.save({
        context: CONTEXT,
        correlationId: 'c1',
        values: { ...VALUES, defaultProvider: 'evolution' },
      }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionProviderNotEnabledError)
  })
})

describe('o QR e o estado da conexão (spec 281 T4)', () => {
  test('sem configuração, estado e QR dizem que falta configurar', async () => {
    const fixture = await buildFixture({ existing: null })

    await expect(
      fixture.useCase.connection({ context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionNotConfiguredError)
    await expect(
      fixture.useCase.qr({ context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionNotConfiguredError)
    expect(fixture.gatewayCalls).toEqual([])
  })

  test('o estado vai ao Evolution com a chave aberta e grava o que ele respondeu', async () => {
    const fixture = await buildFixture({ state: 'open' })

    const result = await fixture.useCase.connection({ context: CONTEXT, correlationId: 'c1' })

    expect(result).toEqual({ checkedAt: '2026-10-27T12:00:00.000Z', state: 'open' })
    expect(fixture.gatewayCalls.map((call) => call.method)).toEqual(['state', 'owner'])
    expect(fixture.gatewayCalls[0]).toEqual({
      apiKey: API_KEY,
      baseUrl: SUMMARY.baseUrl,
      instanceName: 'transportada',
      method: 'state',
    })
    expect(fixture.recorded).toEqual([{ audited: true, state: 'open' }])
    expect(JSON.stringify(result)).not.toContain(API_KEY)
  })

  test('conectado, mostra o número do chip mascarado, nunca inteiro', async () => {
    const fixture = await buildFixture({ owner: '5516993056772', state: 'open' })

    const result = await fixture.useCase.connection({ context: CONTEXT, correlationId: 'c1' })

    expect(result.ownerMasked).toBe('+55 ••••6772')
    expect(JSON.stringify(result)).not.toContain('993056772')
  })

  test('sem conexão não pergunta o número', async () => {
    const fixture = await buildFixture({ owner: '5516993056772', state: 'close' })

    const result = await fixture.useCase.connection({ context: CONTEXT, correlationId: 'c1' })

    expect(result.ownerMasked).toBeUndefined()
    expect(fixture.gatewayCalls.map((call) => call.method)).toEqual(['state'])
  })

  test('desconectar faz o logout com a chave aberta, grava "close" e audita', async () => {
    const fixture = await buildFixture({ state: 'open' })

    const result = await fixture.useCase.disconnect({ context: CONTEXT, correlationId: 'c1' })

    expect(result).toEqual({ checkedAt: '2026-10-27T12:00:00.000Z', state: 'close' })
    expect(fixture.gatewayCalls).toEqual([
      { apiKey: API_KEY, baseUrl: SUMMARY.baseUrl, instanceName: 'transportada', method: 'logout' },
    ])
    expect(fixture.recorded).toEqual([{ audited: true, state: 'close' }])
  })

  test('desconectar sem configuração diz que falta configurar, sem chamar o Evolution', async () => {
    const fixture = await buildFixture({ existing: null })

    await expect(
      fixture.useCase.disconnect({ context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionNotConfiguredError)
    expect(fixture.gatewayCalls).toEqual([])
  })

  test('falha do logout vira erro tipado e não grava estado', async () => {
    const fixture = await buildFixture({ gatewayFails: true })

    await expect(
      fixture.useCase.disconnect({ context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionUnreachableError)
    expect(fixture.recorded).toEqual([])
  })

  test('o QR vem como imagem pronta, com a renovação, e o pedido é auditado sem o QR', async () => {
    const fixture = await buildFixture({ state: 'connecting' })

    const result = await fixture.useCase.qr({ context: CONTEXT, correlationId: 'c1' })

    expect(result).toEqual({
      pairingCode: 'ABCD-1234',
      qrCode: 'data:image/png;base64,iVBORw0KGgo=',
      refreshAfterSeconds: 20,
      state: 'connecting',
    })
    expect(fixture.qrAudits).toEqual(['whatsapp-evolution.qr.requested'])
  })

  test('instância já conectada não gera QR', async () => {
    const fixture = await buildFixture({ state: 'open' })

    const result = await fixture.useCase.qr({ context: CONTEXT, correlationId: 'c1' })

    expect(result).toEqual({
      pairingCode: null,
      qrCode: null,
      refreshAfterSeconds: 0,
      state: 'open',
    })
    expect(fixture.gatewayCalls.map((call) => call.method)).toEqual(['state'])
    expect(fixture.qrAudits).toEqual([])
  })

  test('configuração desligada não entrega QR', async () => {
    const fixture = await buildFixture({ status: 'disabled' })

    await expect(
      fixture.useCase.qr({ context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionDisabledError)
    expect(fixture.gatewayCalls).toEqual([])
  })

  test('falha do Evolution vira erro tipado sem a mensagem do provedor', async () => {
    const fixture = await buildFixture({ gatewayFails: true })

    const error = await fixture.useCase
      .connection({ context: CONTEXT, correlationId: 'c1' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WhatsAppEvolutionUnreachableError)
    expect((error as Error).message).not.toContain('secret')
  })
})

describe('a chave selada e o endereço (spec 281 T4)', () => {
  test('o envelope de uma empresa não abre em outra', async () => {
    const fixture = await buildFixture()

    await expect(
      fixture.secrets.decrypt({
        companyId: OTHER_COMPANY_ID,
        envelope: fixture.sealed,
        settingsId: SETTINGS_ID,
      }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionUnavailableError)
    expect(JSON.stringify(fixture.sealed)).not.toContain(API_KEY)
  })

  test('aceita só origem pública em https, ou http na rede privada do Railway', () => {
    expect(normalizeEvolutionBaseUrl(' https://Evolution.Exemplo.com:8443/ ')).toBe(
      'https://evolution.exemplo.com:8443',
    )
    expect(normalizeEvolutionBaseUrl('http://evolution.railway.internal:8080')).toBe(
      'http://evolution.railway.internal:8080',
    )
  })

  test.each([
    'http://evolution.exemplo.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://10.0.0.5',
    'https://[::1]',
    'https://servidor',
    'https://user:pass@evolution.exemplo.com',
    'https://evolution.exemplo.com/api',
    'https://evolution.exemplo.com/?x=1',
    'ftp://evolution.exemplo.com',
    'não é url',
  ])('recusa %s', (raw) => {
    expect(() => normalizeEvolutionBaseUrl(raw)).toThrow(WhatsAppEvolutionBaseUrlRejectedError)
  })
})

describe('o QR que o Evolution ainda não gerou (spec 281 T4c)', () => {
  test('tenta de novo até o QR existir', async () => {
    const fixture = await buildFixture({ emptyQrs: 2, state: 'connecting' })

    const result = await fixture.useCase.qr({ context: CONTEXT, correlationId: 'c1' })

    expect(result.qrCode).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(fixture.gatewayCalls.filter((call) => call.method === 'qr')).toHaveLength(3)
    expect(fixture.warnings).toEqual([])
  })

  test('sem QR depois das tentativas, devolve vazio e registra no log', async () => {
    const fixture = await buildFixture({ emptyQrs: 9, state: 'connecting' })

    const result = await fixture.useCase.qr({ context: CONTEXT, correlationId: 'c1' })

    expect(result.qrCode).toBeNull()
    expect(fixture.warnings).toEqual(['whatsapp_evolution.qr_empty'])
  })
})

describe('criar a instância pelo portal (spec 281 T4b)', () => {
  test('sem o Evolution do ambiente, a API não cria e a tela cai na digitação', async () => {
    const fixture = await buildFixture({ existing: null })

    expect(fixture.useCase.provisioningAvailable).toBe(false)
    await expect(
      fixture.useCase.provision({ acknowledgeRisk: true, context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionProvisioningUnavailableError)
  })

  test('cria a instância, sela o token como chave da empresa e liga o canal', async () => {
    const fixture = await buildFixture({ existing: null, provisioner: 'ok' })

    await fixture.useCase.provision({
      acknowledgeRisk: true,
      context: CONTEXT,
      correlationId: 'c1',
    })

    expect(fixture.provisioned).toEqual(['transportada-000000000000'])
    const record = fixture.saved[0] as WhatsAppEvolutionSaveRecord
    expect(record.status).toBe('active')
    expect(record.baseUrl).toBe('https://evolution.exemplo.com')
    const opened = await fixture.secrets.decrypt({
      companyId: COMPANY_ID,
      envelope: record.secretEnvelope as SecretEnvelopeV1,
      settingsId: NEW_SETTINGS_ID,
    })
    expect(opened.apiKey).toBe('token-da-instancia')
    expect(JSON.stringify(record.audit)).not.toContain('token-da-instancia')
  })

  test('exige o aviso de risco antes de criar qualquer coisa no Evolution', async () => {
    const fixture = await buildFixture({ existing: null, provisioner: 'ok' })

    await expect(
      fixture.useCase.provision({ acknowledgeRisk: false, context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionRiskNotAcknowledgedError)
    expect(fixture.provisioned).toEqual([])
  })

  test('falha do Evolution vira 502 sem vazar a chave global', async () => {
    const fixture = await buildFixture({ existing: null, provisioner: 'fails' })

    await expect(
      fixture.useCase.provision({ acknowledgeRisk: true, context: CONTEXT, correlationId: 'c1' }),
    ).rejects.toBeInstanceOf(WhatsAppEvolutionUnreachableError)
    expect(fixture.saved).toEqual([])
  })

  test('já criada no mesmo Evolution: religa sem criar outra instância nem trocar a chave', async () => {
    const fixture = await buildFixture({ provisioner: 'ok' })

    await fixture.useCase.provision({
      acknowledgeRisk: true,
      context: CONTEXT,
      correlationId: 'c1',
    })

    expect(fixture.provisioned).toEqual([])
    expect(fixture.saved[0]?.status).toBe('active')
    expect(fixture.saved[0]?.secretEnvelope).toBeUndefined()
  })
})
