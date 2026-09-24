/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  acceptsOccurrenceType,
  resolveOccurrencePermission,
} from '../../src/trips/domain/occurrence.policy.js'
import { OccurrenceTypeNotSeparationError } from '../../src/trips/domain/trip.error.js'

/**
 * Spec 079 T020. ⚠️ **A permissão sai do tipo, não da rota.** Uma rota só, com a autorização
 * decidida pelo corpo, seria o buraco: quem tem `trip.manage` mandaria `recusa_total` e registraria
 * ocorrência de rua sem nunca ter estado nela.
 */
describe('quem registra a ocorrência (spec 079 T020)', () => {
  test('separação é do galpão, e o galpão é trip.manage', () => {
    expect(resolveOccurrencePermission('item_faltante')).toBe('trip.manage')
    expect(resolveOccurrencePermission('item_avariado')).toBe('trip.manage')
  })

  test('entrega é da rua, e a rua é trip.report', () => {
    expect(resolveOccurrencePermission('recusa_total')).toBe('trip.report')
    expect(resolveOccurrencePermission('avaria_transporte')).toBe('trip.report')
  })

  /**
   * Tipo fora do catálogo **não vira permissão nenhuma**. Cair num padrão — a mais frouxa, ou a
   * mais estrita — seria decidir autorização por omissão; a fronteira recusa o corpo antes.
   */
  test('tipo desconhecido não produz permissão', () => {
    expect(resolveOccurrencePermission('inventado')).toBeNull()
  })

  /**
   * ⚠️ A rota é **por grupo**, não uma só autorizada por `trip.manage`: assim o router decide a
   * autorização estaticamente, do jeito que decide todas as outras, e o corpo nunca escolhe quem
   * pode gravar. O handler ainda recusa tipo do grupo errado — senão a rota do galpão gravaria
   * ocorrência de rua com a permissão do galpão.
   */
  test('cada grupo aceita só os seus tipos', () => {
    expect(acceptsOccurrenceType({ stage: 'separation', type: 'item_faltante' })).toBe(true)
    expect(acceptsOccurrenceType({ stage: 'separation', type: 'recusa_total' })).toBe(false)
    expect(acceptsOccurrenceType({ stage: 'delivery', type: 'recusa_total' })).toBe(true)
    expect(acceptsOccurrenceType({ stage: 'delivery', type: 'item_faltante' })).toBe(false)
  })

  test('tipo desconhecido não é aceito por grupo nenhum', () => {
    expect(acceptsOccurrenceType({ stage: 'separation', type: 'inventado' })).toBe(false)
    expect(acceptsOccurrenceType({ stage: 'delivery', type: 'inventado' })).toBe(false)
  })

  /**
   * Spec 157: a regra da spec 079 que dava ao escritório os dois grupos pela rota do galpão foi
   * superada. `company-admin` e `operator` registram a de rua em nome do motorista
   * (`POST /trips/:id/documents/field-occurrences`, `trip.report-on-behalf`, spec 156); pela rota
   * do galpão, com `trip.manage`, só o `separator` ganharia algo — a ocorrência de rua que ele
   * nunca viu. Os casos de `registerTripOccurrence` abaixo prendem isso.
   */
  test('cada grupo recusa o tipo do outro', () => {
    expect(acceptsOccurrenceType({ stage: 'delivery', type: 'recusa_total' })).toBe(true)
    expect(acceptsOccurrenceType({ stage: 'separation', type: 'avaria_transporte' })).toBe(false)
  })
})

/**
 * Spec 157 RF4: a rota do galpão (`POST /trips/:id/documents/:documentId/occurrences`, `trip.manage`)
 * e o fluxo WhatsApp do operador gravam **só** tipo de separação. A etapa sai do cadastro do tipo,
 * nunca do corpo, e a recusa vem antes de gravar e de avisar.
 */
describe('a rota do galpão só grava tipo de galpão (spec 157)', () => {
  const TIPO = '00000000-0000-4000-8000-0000000000e1'

  function registrar(stage: 'delivery' | 'separation') {
    const calls = { notified: 0, saved: 0 }
    const promise = registerTripOccurrence({
      actorUserId: '00000000-0000-4000-8000-00000000000f',
      attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      companyId: '00000000-0000-4000-8000-000000000001',
      documentId: '00000000-0000-4000-8000-000000000017',
      note: '',
      notificationParameters: {
        documentId: '00000000-0000-4000-8000-000000000017',
        documentLabel: '883658/1',
        occurrenceType: '',
        stopLabel: '',
        tripId: '00000000-0000-4000-8000-000000000011',
      },
      notifier: {
        async notify() {
          calls.notified += 1
        },
      },
      occurredOn: '18/09/2026',
      occurrenceTypeId: TIPO,
      productCode: '',
      repository: {
        async findOccurrenceType() {
          return {
            active: true,
            allowsMultipleItems: true,
            emailBody: '',
            emailSubject: '',
            emailTemplateKey: null,
            id: TIPO,
            name: stage === 'delivery' ? 'Recusa total' : 'Item faltante',
            notifies: true,
            stage,
          }
        },
        async listDocumentProducts() {
          return []
        },
        async listOccurrences() {
          return []
        },
        async readTemplateValues() {
          throw new Error('TEMPLATE_NOT_EXPECTED')
        },
        async saveOccurrence(saved) {
          calls.saved += 1
          return {
            createdAt: '2026-09-18T12:00:00.000Z',
            id: '00000000-0000-4000-8000-0000000000c1',
            note: '',
            occurrenceTypeId: TIPO,
            productCode: '',
            stage: saved.stage,
            typeName: saved.typeName,
          }
        },
      },
      tripId: '00000000-0000-4000-8000-000000000011',
    })
    return { calls, promise }
  }

  test('tipo de rua responde 422 OCCURRENCE_TYPE_NOT_SEPARATION e não grava nem avisa', async () => {
    const { calls, promise } = registrar('delivery')

    const error = await promise.catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OccurrenceTypeNotSeparationError)
    expect(error).toMatchObject({ code: 'OCCURRENCE_TYPE_NOT_SEPARATION', status: 422 })
    expect(calls).toEqual({ notified: 0, saved: 0 })
  })

  test('tipo de galpão grava e avisa', async () => {
    const { calls, promise } = registrar('separation')

    expect((await promise).stage).toBe('separation')
    expect(calls).toEqual({ notified: 1, saved: 1 })
  })
})
