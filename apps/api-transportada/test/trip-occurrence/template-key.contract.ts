/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O tipo de ocorrência passa a **selecionar** um template do módulo de notificações
 * (`email_template_key`), em vez de carregar o próprio assunto/corpo. A linha legada — só
 * `emailSubject`/`emailBody` — continua funcionando exatamente como antes.
 */
import { describe, expect, test } from 'bun:test'

import { NOTIFICATION_TEMPLATE_KEY } from '../../src/notification/domain/notification-catalog.constant.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { saveOccurrenceTypeWithTemplate } from '../../src/trips/application/save-occurrence-type.use-case.js'
import { OccurrenceEmailTemplateNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const TIPO = '00000000-0000-4000-8000-0000000000e1'

const BASE_VALUES = {
  active: true,
  emailBody: 'corpo digitado',
  emailSubject: 'assunto digitado',
  emailTemplateKey: null as null | string,
  name: 'Recusa total',
  notifies: true,
  occurrenceTypeId: null,
  stage: 'delivery' as const,
}

function buildType(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TIPO,
    name: 'Recusa total',
    notifies: true,
    stage: 'delivery',
    ...overrides,
  }
}

function buildRepository(type: OccurrenceTypeRecord) {
  return {
    async findOccurrenceType() {
      return type
    },
    async listDocumentProducts() {
      return []
    },
    async listOccurrences() {
      return []
    },
    async readTemplateValues() {
      return {
        contractorName: '',
        documentLabel: '883658/1',
        driverName: '',
        itemCode: '',
        itemLabel: '',
        itemQuantity: '',
        note: '',
        occurredOn: '03/09/2026',
        recipientName: '',
        stopLabel: '',
        totalValue: '',
      }
    },
    async saveOccurrence(saved: { readonly typeName: string }) {
      return {
        createdAt: '2026-09-03T12:00:00.000Z',
        id: '00000000-0000-4000-8000-0000000000c1',
        note: '',
        occurrenceTypeId: TIPO,
        productCode: '',
        stage: 'delivery' as const,
        typeName: saved.typeName,
      }
    },
  }
}

async function registrar(type: OccurrenceTypeRecord, notify: (call: object) => void) {
  return registerTripOccurrence({
    actorUserId: '00000000-0000-4000-8000-00000000000f',
    companyId: COMPANY,
    documentId: '00000000-0000-4000-8000-000000000017',
    note: '',
    notificationParameters: {
      documentLabel: '883658/1',
      occurrenceType: '',
      stopLabel: 'RUA MIGUEL PETRONI, 1166',
      tripId: '00000000-0000-4000-8000-000000000011',
    },
    notifier: {
      async notify(call) {
        notify(call)
      },
    },
    occurredOn: '03/09/2026',
    occurrenceTypeId: TIPO,
    productCode: '',
    repository: buildRepository(type),
    tripId: '00000000-0000-4000-8000-000000000011',
  })
}

describe('gravação do tipo com template do módulo', () => {
  test('key válida grava a key e zera assunto/corpo — o template manda', async () => {
    let savedValues: Record<string, unknown> = {}
    const saved = await saveOccurrenceTypeWithTemplate({
      companyId: COMPANY,
      save: async (values) => {
        savedValues = values
        return buildType({ emailTemplateKey: 'billing.invoice-due' })
      },
      templates: { hasActiveEmailTemplate: async () => true },
      values: { ...BASE_VALUES, emailTemplateKey: 'billing.invoice-due' },
    })

    expect(savedValues.emailTemplateKey).toBe('billing.invoice-due')
    expect(savedValues.emailSubject).toBe('')
    expect(savedValues.emailBody).toBe('')
    expect(saved.emailTemplateKey).toBe('billing.invoice-due')
  })

  test('key sem template ativo de e-mail é recusada com código estável', async () => {
    expect(
      saveOccurrenceTypeWithTemplate({
        companyId: COMPANY,
        save: async () => buildType({}),
        templates: { hasActiveEmailTemplate: async () => false },
        values: { ...BASE_VALUES, emailTemplateKey: 'key.inexistente' },
      }),
    ).rejects.toBeInstanceOf(OccurrenceEmailTemplateNotFoundError)

    const error = new OccurrenceEmailTemplateNotFoundError()
    expect(error.code).toBe('OCCURRENCE_EMAIL_TEMPLATE_NOT_FOUND')
    expect(error.status).toBe(422)
  })

  test('sem key o legado segue intacto: assunto/corpo gravados e catálogo não consultado', async () => {
    let savedValues: Record<string, unknown> = {}
    let consulted = false
    await saveOccurrenceTypeWithTemplate({
      companyId: COMPANY,
      save: async (values) => {
        savedValues = values
        return buildType({ emailBody: 'corpo digitado', emailSubject: 'assunto digitado' })
      },
      templates: {
        hasActiveEmailTemplate: async () => {
          consulted = true
          return true
        },
      },
      values: { ...BASE_VALUES },
    })

    expect(consulted).toBe(false)
    expect(savedValues.emailTemplateKey).toBeNull()
    expect(savedValues.emailSubject).toBe('assunto digitado')
    expect(savedValues.emailBody).toBe('corpo digitado')
  })
})

describe('aviso da ocorrência com template do módulo', () => {
  test('tipo com key avisa pelo template escolhido', async () => {
    const calls: { templateKey?: string }[] = []
    await registrar(buildType({ emailTemplateKey: 'trip.ocorrencia-personalizada' }), (call) =>
      calls.push(call),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.templateKey).toBe('trip.ocorrencia-personalizada')
  })

  test('tipo sem key mantém o trilho legado', async () => {
    const calls: { templateKey?: string }[] = []
    await registrar(buildType({}), (call) => calls.push(call))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.templateKey).toBe(NOTIFICATION_TEMPLATE_KEY.TRIP_DELIVERY_OCCURRENCE)
  })

  /** Com o template no módulo, o e-mail pronto do registro não sai do assunto/corpo do tipo. */
  test('tipo com key não devolve e-mail montado do legado', async () => {
    const registered = await registrar(
      buildType({
        emailBody: 'sobra legada',
        emailSubject: 'sobra legada',
        emailTemplateKey: 'trip.ocorrencia-personalizada',
      }),
      () => undefined,
    )

    expect(registered.email).toBeNull()
  })
})
