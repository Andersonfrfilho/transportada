/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NOTIFICATION_CATALOG } from '../../src/notification/domain/notification-catalog.constant.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { resolveOccurrenceNotification } from '../../src/trips/domain/occurrence-notification.policy.js'

const ACTOR = '00000000-0000-4000-8000-00000000000f'
const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const TRIP = '00000000-0000-4000-8000-000000000011'
const TIPO = '00000000-0000-4000-8000-0000000000e1'

const PARAMS = {
  documentLabel: '883658/1',
  occurrenceType: '',
  stopLabel: 'RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP',
  tripId: TRIP,
}

function repository(notifies: boolean) {
  return {
    async findOccurrenceType() {
      return { active: true, id: TIPO, name: 'Recusa total', notifies, stage: 'delivery' as const }
    },
    async listDocumentProducts() {
      return []
    },
    async listOccurrences() {
      return []
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

function registrar(notifies: boolean, notify: (call: object) => void) {
  return registerTripOccurrence({
    actorUserId: ACTOR,
    companyId: COMPANY,
    documentId: DOCUMENT,
    note: '',
    notificationParameters: PARAMS,
    notifier: {
      async notify(call) {
        notify(call)
      },
    },
    occurrenceTypeId: TIPO,
    productCode: '',
    repository: repository(notifies),
    tripId: TRIP,
  })
}

describe('notificação por tipo de ocorrência (spec 079)', () => {
  /**
   * ⚠️ **A flag mora no próprio tipo** desde 2026-09-03: eram a mesma decisão chaveada pelo mesmo
   * valor, e a tabela ao lado obrigava a tela a casar duas listas para mostrar uma.
   */
  test('avisa só o tipo cadastrado para avisar', async () => {
    const ligado: object[] = []
    const desligado: object[] = []

    await registrar(true, (call) => ligado.push(call))
    await registrar(false, (call) => desligado.push(call))

    expect(ligado).toHaveLength(1)
    expect(desligado).toEqual([])
  })

  /** O nome do tipo vai no aviso, e ele é **o que a empresa cadastrou** — não um id nem um enum. */
  test('o aviso leva o nome que a empresa deu ao tipo', async () => {
    const calls: { readonly parameters: { readonly occurrenceType: string } }[] = []

    await registrar(true, (call) =>
      calls.push(call as { readonly parameters: { readonly occurrenceType: string } }),
    )

    expect(calls[0]?.parameters.occurrenceType).toBe('Recusa total')
  })

  /**
   * ⚠️ Todo marcador do template vem preenchido: marcador sem valor renderiza um buraco no e-mail,
   * que é pior que não avisar — parece defeito do sistema para quem recebe.
   */
  test('preenche todos os marcadores que o template declara', async () => {
    const entry = NOTIFICATION_CATALOG.find(
      (candidate) => candidate.templateKey === 'trip.delivery-occurrence',
    )
    expect(entry).toBeDefined()

    const calls: { readonly parameters: Record<string, string> }[] = []
    await registrar(true, (call) =>
      calls.push(call as { readonly parameters: Record<string, string> }),
    )

    for (const placeholder of entry?.placeholders ?? []) {
      expect(Object.keys(calls[0]?.parameters ?? {})).toContain(placeholder)
    }
  })

  /**
   * ⚠️ **Sem PII.** O texto diz a nota, o tipo e a parada — nunca o nome de quem recebeu nem o
   * telefone que a nota trouxe. Caixa de entrada e e-mail atravessam log de terceiro.
   */
  test('não leva contato nem nome de quem recebeu', async () => {
    const calls: object[] = []
    await registrar(true, (call) => calls.push(call))
    const serialized = JSON.stringify(calls)

    expect(serialized).not.toInclude('phone')
    expect(serialized).not.toInclude('recipientName')
    expect(serialized).not.toInclude('contact')
  })

  /**
   * ⚠️ **O aviso nunca derruba o registro.** A ocorrência é o fato; o aviso é conveniência. Uma
   * fila fora do ar não pode fazer o operador perder o que acabou de registrar.
   */
  test('falha no aviso não desfaz a ocorrência', async () => {
    const saved = await registerTripOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      note: '',
      notificationParameters: PARAMS,
      notifier: {
        async notify() {
          throw new Error('fila fora do ar')
        },
      },
      occurrenceTypeId: TIPO,
      productCode: '',
      repository: repository(true),
      tripId: TRIP,
    })

    expect(saved.typeName).toBe('Recusa total')
  })

  /** A política pura continua sendo o lugar da decisão, e ela ignora o que não foi configurado. */
  test('tipo sem configuração não avisa', () => {
    expect(
      resolveOccurrenceNotification({ parameters: PARAMS, settings: [], type: TIPO }),
    ).toBeNull()
  })
})
