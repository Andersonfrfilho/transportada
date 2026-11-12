/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  CONTRACTOR_AUTOMATION_FAILURE,
  createContractorAutomationClient,
} from '@/modules/company-settings/shared/contractorAutomationClient.service'
import {
  EMPTY_CONTRACTOR_AUTOMATION_FORM,
  type ContractorAutomation,
  parseRecipients,
  toInput,
} from '@/modules/company-settings/shared/contractorAutomation.validation'
import {
  COMPANY_SETTINGS_TAB_IDS,
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
} from '@/modules/company-settings/shared/companySettingsTabs.service'

/** Spec 285: a tela das automações do fluxo semanal. */
const AUTOMATION: ContractorAutomation = {
  billingDueDays: 15,
  enabled: true,
  id: 'a1',
  name: 'Spani',
  nfseCity: null,
  partSize: 100,
  recipients: ['a@spani.com.br'],
  xmlKind: 'cte',
}

function clientWith(respond: (request: Request) => Response) {
  const requests: Request[] = []
  const client = createContractorAutomationClient({
    apiUrl: 'http://api.test',
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(respond(request))
    },
    getAccessToken: () => Promise.resolve('token'),
  })

  return { client, requests }
}

describe('o formulário da automação', () => {
  it('lê um email por linha, em minúsculas e sem repetição', () => {
    expect(parseRecipients('A@Spani.com.br\n a@spani.com.br, b@spani.com.br; ')).toEqual([
      'a@spani.com.br',
      'b@spani.com.br',
    ])
  })

  it('o formulário vazio é uma automação desligada, em 15 dias e partes de 100', () => {
    expect(EMPTY_CONTRACTOR_AUTOMATION_FORM).toMatchObject({
      billingDueDays: '15',
      enabled: false,
      partSize: '100',
    })
  })

  it('valida como a API: nome, prazo, parte, destinatários', () => {
    const base = { ...EMPTY_CONTRACTOR_AUTOMATION_FORM, name: 'Spani' }
    expect(toInput({ ...base, name: '  ' })).toEqual({ error: 'name', ok: false })
    expect(toInput({ ...base, billingDueDays: '0' })).toEqual({
      error: 'billingDueDays',
      ok: false,
    })
    expect(toInput({ ...base, partSize: '101' })).toEqual({ error: 'partSize', ok: false })
    expect(toInput({ ...base, recipients: 'isto-nao-e-email' })).toEqual({
      error: 'recipientFormat',
      ok: false,
    })
    expect(
      toInput({
        ...base,
        recipients: Array.from({ length: 51 }, (_, i) => `u${i}@x.com`).join('\n'),
      }),
    ).toEqual({ error: 'recipientLimit', ok: false })
  })

  it('o corpo enviado leva só CT-e, o interruptor e os destinatários limpos', () => {
    const parsed = toInput({
      ...EMPTY_CONTRACTOR_AUTOMATION_FORM,
      enabled: true,
      name: ' Spani ',
      nfseCity: ' RIBEIRAO PRETO ',
      recipients: 'M@Spani.com.br\nm@spani.com.br',
    })

    expect(parsed).toEqual({
      input: {
        billingDueDays: 15,
        enabled: true,
        name: 'Spani',
        nfseCity: 'RIBEIRAO PRETO',
        partSize: 100,
        recipients: ['m@spani.com.br'],
        xmlKind: 'cte',
      },
      ok: true,
    })
  })
})

describe('o cliente das automações', () => {
  it('lista, cria e edita no caminho da API, com o token', async () => {
    const { client, requests } = clientWith(
      (request) =>
        new Response(
          JSON.stringify({ data: request.method === 'GET' ? [AUTOMATION] : AUTOMATION }),
          {
            status: 200,
          },
        ),
    )
    const input = { ...AUTOMATION, id: undefined }

    expect(await client.list()).toEqual([AUTOMATION])
    await client.create(input)
    await client.update('a1', input)

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        'GET /contractor-automations',
        'POST /contractor-automations',
        'PUT /contractor-automations/a1',
      ],
    )
    expect(
      requests.every((request) => request.headers.get('authorization') === 'Bearer token'),
    ).toBe(true)
  })

  it('traduz o 409 de nome repetido e recusa resposta fora do formato', async () => {
    const conflict = clientWith(() => new Response('{}', { status: 409 }))
    const conflictError = await conflict.client.list().catch((error: unknown) => error)
    expect(conflictError).toMatchObject({ failure: CONTRACTOR_AUTOMATION_FAILURE.CONFLICT })
    const broken = clientWith(
      () => new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 }),
    )
    const brokenError = await broken.client.list().catch((error: unknown) => error)
    expect(brokenError).toMatchObject({ failure: CONTRACTOR_AUTOMATION_FAILURE.FAILED })
  })
})

describe('a aba Automações', () => {
  it('é aba de Configurações e carrega só a própria configuração', () => {
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('automations')
    expect(SETTINGS_PANEL_PLACEMENT.contractorAutomations).toEqual({
      module: 'company-settings',
      source: 'contractorAutomations',
      tab: 'automations',
    })
    expect(resolveSettingsDataScope('company-settings', 'automations').contractorAutomations).toBe(
      true,
    )
    expect(resolveSettingsDataScope('company-settings', 'whatsapp').contractorAutomations).toBe(
      false,
    )
  })
})
