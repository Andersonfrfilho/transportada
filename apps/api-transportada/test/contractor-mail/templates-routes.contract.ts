/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: rotas de modelos de e-mail. O que estas fixam: `settings.manage`, `no-store`,
 * `companyId` só do token (modelo de outra empresa é 404 igual a inexistente, em toda rota), `400`
 * com `details[]` por campo (inclusive variável inválida), nome duplicado `409`, versão velha `409`,
 * troca de padrão, arquivar tira o padrão, a prévia que nunca envia, e nenhum texto de modelo em log.
 */
import { describe, expect, test } from 'bun:test'

import type { ContractorMailTemplate } from '../../src/contractor-mail/application/contractor-mail-template.port.js'
import { MAIL_TEMPLATE_CATALOG } from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'
import {
  COMPANY_CONTEXT,
  READ_ONLY_CONTEXT,
  getRequest,
  jsonRequest,
} from '../fixtures/contractor-mail-http.fixture'
import {
  OTHER_COMPANY_ID,
  createContractorMailTemplatesHttpFixture,
} from '../fixtures/contractor-mail-templates-http.fixture'

const PATH = '/contractor-mail-templates'
const FOREIGN_ID = '00000000-0000-4000-8000-0000000000fa'
const SUGGESTED = MAIL_TEMPLATE_CATALOG.address_correction.suggestedTemplate
const BASE_BODY = {
  closing: SUGGESTED.closing,
  intro: SUGGESTED.intro,
  itemText: SUGGESTED.itemText,
  mailType: 'address_correction',
  name: 'Padrão',
  subject: SUGGESTED.subject,
} as const

type TemplateBody = { readonly data: Record<string, unknown> }
type ErrorBody = {
  readonly error: {
    readonly code: string
    readonly details?: readonly { readonly field: string; readonly message: string }[]
  }
}

function foreignTemplate(): ContractorMailTemplate {
  return {
    actorUserId: null,
    closing: 'Assinatura de fora',
    companyId: OTHER_COMPANY_ID,
    createdAt: new Date('2026-09-15T12:00:00.000Z'),
    id: FOREIGN_ID,
    intro: 'Abertura de fora',
    isDefault: true,
    itemText: '',
    mailType: 'address_correction',
    name: 'Modelo da outra empresa',
    status: 'active',
    subject: 'Assunto de fora',
    updatedAt: new Date('2026-09-15T12:00:00.000Z'),
    version: 1n,
  }
}

async function createTemplate(
  fixture: Awaited<ReturnType<typeof createContractorMailTemplatesHttpFixture>>,
  overrides: Record<string, unknown> = {},
): Promise<{ readonly body: TemplateBody & ErrorBody; readonly response: Response }> {
  const response = await fixture.handle(
    jsonRequest({ body: { ...BASE_BODY, ...overrides }, method: 'POST', path: PATH }),
  )
  return { body: (await response.json()) as TemplateBody & ErrorBody, response }
}

describe('contractor mail template routes (spec 150 T402)', () => {
  test('serves the closed catalog with variables, descriptions and the suggested template', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()

    const response = await fixture.handle(getRequest(`${PATH}/catalog`))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as {
      readonly data: readonly {
        readonly itemVariables: readonly { readonly name: string }[]
        readonly mailType: string
        readonly mailVariables: readonly { readonly name: string }[]
        readonly suggestedTemplate: Record<string, string>
      }[]
    }
    expect(body.data.map((entry) => entry.mailType)).toEqual(['address_correction'])
    expect(body.data[0]?.mailVariables.map((variable) => variable.name)).toContain('clientes')
    expect(body.data[0]?.itemVariables.map((variable) => variable.name)).toContain('motivo')
    expect(body.data[0]?.suggestedTemplate).toMatchObject({ subject: SUGGESTED.subject })
  })

  test('creates a template (201); the first one of the type becomes the default', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()

    const first = await createTemplate(fixture)
    const second = await createTemplate(fixture, { name: 'Cobrança' })

    expect(first.response.status).toBe(201)
    expect(first.response.headers.get('cache-control')).toBe('no-store')
    expect(Object.keys(first.body.data).sort()).toEqual([
      'closing',
      'id',
      'intro',
      'isDefault',
      'itemText',
      'mailType',
      'name',
      'status',
      'subject',
      'updatedAt',
      'version',
    ])
    expect(first.body.data).toMatchObject({ isDefault: true, status: 'active', version: '1' })
    expect(second.body.data).toMatchObject({ isDefault: false })
    expect(fixture.repository.rows[0]).toMatchObject({
      actorUserId: COMPANY_CONTEXT.userId,
      companyId: COMPANY_CONTEXT.companyId,
    })
  })

  test('refuses an unknown variable with 400 and details on the field', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()

    const { body, response } = await createTemplate(fixture, { subject: 'Oi {desconhecida}' })

    expect(response.status).toBe(400)
    expect(body.error.details).toEqual([
      { field: 'subject', message: '{desconhecida} is not a variable of address_correction' },
    ])
    expect(fixture.repository.rows).toEqual([])
  })

  test('refuses an item variable outside the item text, and a stray brace, all at once', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()

    const { body, response } = await createTemplate(fixture, {
      closing: 'Fim {',
      intro: 'Endereço: {endereco_correto}',
    })

    expect(response.status).toBe(400)
    expect(body.error.details?.map((detail) => detail.field)).toEqual(['intro', 'closing'])
  })

  test('refuses a companyId in the body and an unknown mail type', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()

    const withCompany = await createTemplate(fixture, { companyId: OTHER_COMPANY_ID })
    const withType = await createTemplate(fixture, { mailType: 'occurrence' })

    expect(withCompany.response.status).toBe(400)
    expect(withType.response.status).toBe(400)
    expect(fixture.repository.rows).toEqual([])
  })

  test('a duplicate name of the same type is 409 NAME_TAKEN, regardless of case', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    await createTemplate(fixture)

    const { body, response } = await createTemplate(fixture, { name: 'PADRÃO' })

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('CONTRACTOR_MAIL_TEMPLATE_NAME_TAKEN')
  })

  test('lists only the templates of the company in the token', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture({ seed: [foreignTemplate()] })
    await createTemplate(fixture)

    const response = await fixture.handle(getRequest(`${PATH}?mailType=address_correction`))

    expect(response.status).toBe(200)
    const body = (await response.json()) as { readonly data: readonly { readonly id: string }[] }
    expect(body.data).toHaveLength(1)
    expect(body.data.map((template) => template.id)).not.toContain(FOREIGN_ID)
  })

  test('a template of another company is 404 on read, edit, default and preview', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture({ seed: [foreignTemplate()] })

    const responses = [
      await fixture.handle(getRequest(`${PATH}/${FOREIGN_ID}`)),
      await fixture.handle(
        jsonRequest({
          body: { name: 'Meu', version: '1' },
          method: 'PATCH',
          path: `${PATH}/${FOREIGN_ID}`,
        }),
      ),
      await fixture.handle(
        jsonRequest({
          body: { version: '1' },
          method: 'POST',
          path: `${PATH}/${FOREIGN_ID}/default`,
        }),
      ),
      await fixture.handle(
        jsonRequest({ body: { templateId: FOREIGN_ID }, method: 'POST', path: `${PATH}/preview` }),
      ),
    ]

    for (const response of responses) {
      expect(response.status).toBe(404)
      expect(((await response.json()) as ErrorBody).error.code).toBe(
        'CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND',
      )
    }
    expect(fixture.repository.rows[0]).toEqual(foreignTemplate())
  })

  test('edits with the current version and refuses a stale one with 409', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    const created = await createTemplate(fixture)
    const id = String(created.body.data.id)

    const updated = await fixture.handle(
      jsonRequest({
        body: { subject: 'Novo {clientes}', version: '1' },
        method: 'PATCH',
        path: `${PATH}/${id}`,
      }),
    )
    const stale = await fixture.handle(
      jsonRequest({
        body: { subject: 'Atrasado', version: '1' },
        method: 'PATCH',
        path: `${PATH}/${id}`,
      }),
    )

    expect(updated.status).toBe(200)
    expect(((await updated.json()) as TemplateBody).data).toMatchObject({
      subject: 'Novo {clientes}',
      version: '2',
    })
    expect(stale.status).toBe(409)
    expect(((await stale.json()) as ErrorBody).error.code).toBe(
      'CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT',
    )
  })

  test('an edit that breaks a variable is 400 on the edited field', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    const created = await createTemplate(fixture)

    const response = await fixture.handle(
      jsonRequest({
        body: { closing: 'Até {motivo}', version: '1' },
        method: 'PATCH',
        path: `${PATH}/${String(created.body.data.id)}`,
      }),
    )

    expect(response.status).toBe(400)
    expect(((await response.json()) as ErrorBody).error.details?.[0]?.field).toBe('closing')
  })

  test('archiving the default removes the default; an archived template no longer changes', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    const created = await createTemplate(fixture)
    const id = String(created.body.data.id)

    const archived = await fixture.handle(
      jsonRequest({
        body: { status: 'archived', version: '1' },
        method: 'PATCH',
        path: `${PATH}/${id}`,
      }),
    )
    const afterArchive = await fixture.handle(
      jsonRequest({
        body: { name: 'Volta', version: '2' },
        method: 'PATCH',
        path: `${PATH}/${id}`,
      }),
    )
    const asDefault = await fixture.handle(
      jsonRequest({ body: { version: '2' }, method: 'POST', path: `${PATH}/${id}/default` }),
    )

    expect(((await archived.json()) as TemplateBody).data).toMatchObject({
      isDefault: false,
      status: 'archived',
    })
    for (const response of [afterArchive, asDefault]) {
      expect(response.status).toBe(409)
      expect(((await response.json()) as ErrorBody).error.code).toBe(
        'CONTRACTOR_MAIL_TEMPLATE_ARCHIVED',
      )
    }
  })

  test('refuses reactivating through PATCH and an empty PATCH', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    const created = await createTemplate(fixture)
    const path = `${PATH}/${String(created.body.data.id)}`

    const reactivate = await fixture.handle(
      jsonRequest({ body: { status: 'active', version: '1' }, method: 'PATCH', path }),
    )
    const empty = await fixture.handle(
      jsonRequest({ body: { version: '1' }, method: 'PATCH', path }),
    )

    expect(reactivate.status).toBe(400)
    expect(empty.status).toBe(400)
  })

  test('switching the default moves it: the previous default stops being default', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    const first = await createTemplate(fixture)
    const second = await createTemplate(fixture, { name: 'Cobrança' })

    const response = await fixture.handle(
      jsonRequest({
        body: { version: '1' },
        method: 'POST',
        path: `${PATH}/${String(second.body.data.id)}/default`,
      }),
    )

    expect(response.status).toBe(200)
    expect(((await response.json()) as TemplateBody).data).toMatchObject({ isDefault: true })
    const defaults = fixture.repository.rows.filter((row) => row.isDefault)
    expect(defaults.map((row) => row.id)).toEqual([String(second.body.data.id)])
    expect(fixture.repository.rows.find((row) => row.id === first.body.data.id)?.isDefault).toBe(
      false,
    )
  })

  test('previews an unsaved template with sample data, escaped, without saving it', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    const { closing, itemText, mailType, subject } = BASE_BODY

    const response = await fixture.handle(
      jsonRequest({
        body: { closing, intro: '<b>Olá</b>, {contratante}', itemText, mailType, subject },
        method: 'POST',
        path: `${PATH}/preview`,
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as {
      readonly data: { readonly html: string; readonly subject: string; readonly text: string }
    }
    expect(body.data.subject).toBe('Correção de endereço de entrega — 2 clientes')
    expect(body.data.html).toContain('&lt;b&gt;Olá&lt;/b&gt;, Comercial Exemplo Imp Exp Ltda')
    expect(body.data.text).toContain('Motivo: localizado a 3,2 km do endereço informado.')
    expect(fixture.repository.rows).toEqual([])
  })

  test('previews a saved template by id, and refuses an invalid unsaved one with details', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    const created = await createTemplate(fixture)

    const saved = await fixture.handle(
      jsonRequest({
        body: { templateId: created.body.data.id },
        method: 'POST',
        path: `${PATH}/preview`,
      }),
    )
    const invalid = await fixture.handle(
      jsonRequest({
        body: {
          closing: 'x',
          intro: 'x',
          itemText: '',
          mailType: 'address_correction',
          subject: '{uf}',
        },
        method: 'POST',
        path: `${PATH}/preview`,
      }),
    )
    const mixed = await fixture.handle(
      jsonRequest({
        body: { subject: 'x', templateId: created.body.data.id },
        method: 'POST',
        path: `${PATH}/preview`,
      }),
    )

    expect(saved.status).toBe(200)
    expect(invalid.status).toBe(400)
    expect(((await invalid.json()) as ErrorBody).error.details?.[0]?.field).toBe('subject')
    expect(mixed.status).toBe(400)
  })

  test('refuses an unknown mailType filter and an unknown query key', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()

    expect((await fixture.handle(getRequest(`${PATH}?mailType=occurrence`))).status).toBe(400)
    expect((await fixture.handle(getRequest(`${PATH}?companyId=${OTHER_COMPANY_ID}`))).status).toBe(
      400,
    )
  })

  test('rejects a caller without settings.manage on every route', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const responses = [
      await fixture.handle(getRequest(`${PATH}/catalog`)),
      await fixture.handle(getRequest(PATH)),
      await fixture.handle(jsonRequest({ body: BASE_BODY, method: 'POST', path: PATH })),
    ]

    for (const response of responses) expect(response.status).toBe(403)
    expect(fixture.repository.rows).toEqual([])
  })

  test('never logs template text, even when the request fails', async () => {
    const fixture = await createContractorMailTemplatesHttpFixture()
    await createTemplate(fixture, { subject: 'Assunto sigiloso {clientes}' })
    await createTemplate(fixture, { subject: 'Assunto sigiloso {clientes}' })
    await createTemplate(fixture, { intro: 'Abertura sigilosa {nada}', name: 'Outro' })

    const serialized = JSON.stringify(fixture.logCalls)
    expect(serialized).not.toContain('sigiloso')
    expect(serialized).not.toContain('sigilosa')
  })
})
