/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ContractorAutomation,
  ContractorAutomationPort,
} from '../../src/contractor-automations/application/contractor-automation.port.js'
import {
  createCreateContractorAutomationUseCase,
  createListContractorAutomationsUseCase,
  createUpdateContractorAutomationUseCase,
} from '../../src/contractor-automations/application/contractor-automation.use-case.js'
import { createContractorAutomationRoutes } from '../../src/contractor-automations/presentation/contractor-automation.routes.js'
import { parseContractorAutomationBody } from '../../src/contractor-automations/presentation/contractor-automation.schema.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_CONTRACTOR_AUTOMATIONS_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'

/**
 * Spec 285: a automação do fluxo semanal é configuração da empresa. Nasce desligada, só aceita XML de
 * CT-e, normaliza os destinatários e nunca lê a empresa do corpo. Auditoria, unicidade do nome e FK são
 * do repositório e do banco.
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const AUTOMATION_ID = '55555555-5555-4555-8555-555555555555'
const NOW = new Date('2026-10-28T12:00:00.000Z')
const RESOLVED_IP = '10.0.0.9'

const CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

type Call = Record<string, unknown>

function fakePort() {
  const calls: Call[] = []
  const toAutomation = (fields: Call): ContractorAutomation => ({
    billingDueDays: fields.billingDueDays as number,
    createdAt: NOW,
    enabled: fields.enabled as boolean,
    id: AUTOMATION_ID,
    name: fields.name as string,
    nfseCity: fields.nfseCity as string | null,
    partSize: fields.partSize as number,
    recipients: fields.recipients as readonly string[],
    updatedAt: NOW,
    xmlKind: 'cte',
  })
  const port: ContractorAutomationPort = {
    create: async (params) => {
      calls.push(params)
      return toAutomation(params.fields)
    },
    list: async (params) => {
      calls.push(params)
      return []
    },
    update: async (params) => {
      calls.push(params)
      return toAutomation(params.fields)
    },
  }

  return { calls, port }
}

function routesFor(port: ContractorAutomationPort) {
  const dependencies = { automations: port }
  return createContractorAutomationRoutes({
    create: createCreateContractorAutomationUseCase(dependencies),
    list: createListContractorAutomationsUseCase(dependencies),
    resolveClientIp: () => RESOLVED_IP,
    update: createUpdateContractorAutomationUseCase(dependencies),
  })
}

function callRoute(params: {
  readonly body?: unknown
  readonly method: 'GET' | 'POST' | 'PUT'
  readonly port: ContractorAutomationPort
}): Promise<Response> {
  const route = routesFor(params.port).find((candidate) => candidate.method === params.method)
  if (route === undefined) throw new Error(`missing ${params.method}`)

  return route.execute({
    context: { identity: undefined, scope: CONTEXT } as never,
    correlationId: 'contractor-automation-contract',
    pathParameters: params.method === 'PUT' ? { id: AUTOMATION_ID } : {},
    request: new Request(`http://api.test${API_CONTRACTOR_AUTOMATIONS_PATH}`, {
      ...(params.body === undefined
        ? {}
        : { body: JSON.stringify(params.body), headers: { 'content-type': 'application/json' } }),
      method: params.method,
    }),
  })
}

function bodyRequest(value: unknown): Request {
  return new Request(`http://api.test${API_CONTRACTOR_AUTOMATIONS_PATH}`, {
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

async function rejection(attempt: () => Promise<unknown>): Promise<ApiError> {
  try {
    await attempt()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected the attempt to be rejected')
}

describe('a automação do fluxo semanal é configuração da empresa (spec 285)', () => {
  test('o corpo mínimo nasce desligado, em 15 dias, só CT-e e partes de 100', async () => {
    const body = await parseContractorAutomationBody(
      bodyRequest({ name: 'Spani', recipients: ['a@spani.com.br'] }),
    )

    expect(body).toEqual({
      billingDueDays: 15,
      enabled: false,
      name: 'Spani',
      nfseCity: null,
      partSize: 100,
      recipients: ['a@spani.com.br'],
      xmlKind: 'cte',
    })
  })

  test('recusa XML que não seja de CT-e, parte acima de 100 e campo da empresa no corpo', async () => {
    const base = { name: 'Spani', recipients: [] }
    for (const invalid of [
      { ...base, xmlKind: 'nfe' },
      { ...base, partSize: 101 },
      { ...base, partSize: 0 },
      { ...base, billingDueDays: 0 },
      { ...base, companyId: COMPANY_ID },
      { ...base, recipients: ['isto não é e-mail'] },
      { name: '   ', recipients: [] },
    ]) {
      expect(
        (await rejection(() => parseContractorAutomationBody(bodyRequest(invalid)))).status,
      ).toBe(400)
    }
  })

  test('destinatários saem em minúsculas e sem repetição, e o interruptor é do corpo', async () => {
    const { calls, port } = fakePort()
    const response = await callRoute({
      body: {
        enabled: true,
        name: ' Spani ',
        recipients: ['Michele@Spani.com.br', 'michele@spani.com.br', 'vitor@spani.com.br'],
      },
      method: 'POST',
      port,
    })

    expect(response.status).toBe(201)
    const [call] = calls
    expect(call).toMatchObject({
      companyId: COMPANY_ID,
      ipAddress: RESOLVED_IP,
      userId: USER_ID,
      fields: {
        enabled: true,
        name: 'Spani',
        recipients: ['michele@spani.com.br', 'vitor@spani.com.br'],
      },
    })
    const { data } = (await response.json()) as { data: Record<string, unknown> }
    expect(data).toMatchObject({ enabled: true, id: AUTOMATION_ID, xmlKind: 'cte' })
    expect(Object.keys(data)).not.toContain('companyId')
  })

  test('editar passa o id do caminho e liga ou desliga a automação', async () => {
    const { calls, port } = fakePort()
    const response = await callRoute({
      body: { enabled: false, name: 'Spani', recipients: [] },
      method: 'PUT',
      port,
    })

    expect(response.status).toBe(200)
    expect(calls[0]).toMatchObject({
      companyId: COMPANY_ID,
      fields: { enabled: false },
      id: AUTOMATION_ID,
    })
  })

  test('listar lê só a empresa do contexto', async () => {
    const { calls, port } = fakePort()
    const response = await callRoute({ method: 'GET', port })

    expect(response.status).toBe(200)
    expect(calls[0]).toEqual({ companyId: COMPANY_ID })
  })

  test('todas as rotas exigem settings.manage', () => {
    const { port } = fakePort()
    for (const route of routesFor(port)) {
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
  })
})
