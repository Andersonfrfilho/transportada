/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NOTIFICATION_CATALOG } from '../../src/notification/domain/notification-catalog.constant.js'
import { resolveOccurrenceNotification } from '../../src/trips/domain/occurrence-notification.policy.js'

const CONFIG = [
  { notifies: true, type: 'recusa_total' as const },
  { notifies: false, type: 'item_faltante' as const },
]

const PARAMS = {
  documentLabel: '883658/1',
  occurrenceType: 'Recusa total',
  stopLabel: 'RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP',
  tripId: '00000000-0000-4000-8000-000000000011',
}

describe('notificação por tipo de ocorrência (spec 079)', () => {
  /**
   * ⚠️ **A flag é por tipo, e o padrão é não avisar.** Tipo que ninguém configurou não dispara: um
   * aviso que ninguém pediu vira ruído, e ruído faz o operador ignorar também o que importa.
   */
  test('avisa só o tipo configurado para avisar', () => {
    expect(
      resolveOccurrenceNotification({ parameters: PARAMS, settings: CONFIG, type: 'recusa_total' }),
    ).not.toBeNull()
    expect(
      resolveOccurrenceNotification({
        parameters: PARAMS,
        settings: CONFIG,
        type: 'item_faltante',
      }),
    ).toBeNull()
  })

  test('tipo sem configuração nenhuma não avisa', () => {
    expect(
      resolveOccurrenceNotification({
        parameters: PARAMS,
        settings: CONFIG,
        type: 'avaria_transporte',
      }),
    ).toBeNull()
  })

  /**
   * ⚠️ **Todo marcador do template tem de vir preenchido.** O catálogo declara `placeholders`, e
   * marcador sem valor renderiza um buraco no e-mail — que é pior que não avisar, porque parece
   * defeito do sistema para quem recebe.
   */
  test('preenche todos os marcadores que o template declara', () => {
    const entry = NOTIFICATION_CATALOG.find(
      (candidate) => candidate.templateKey === 'trip.delivery-occurrence',
    )
    expect(entry).toBeDefined()

    const notification = resolveOccurrenceNotification({
      parameters: PARAMS,
      settings: CONFIG,
      type: 'recusa_total',
    })

    for (const placeholder of entry?.placeholders ?? []) {
      expect(Object.keys(notification?.parameters ?? {})).toContain(placeholder)
    }
  })

  /**
   * ⚠️ **Sem PII no aviso.** O texto diz a nota, o tipo e a parada — nunca o nome de quem recebeu
   * nem o telefone que a nota trouxe. A caixa de entrada e o e-mail atravessam log de terceiro; o
   * detalhe fica na tela, atrás de autenticação.
   */
  test('não leva contato nem nome de quem recebeu', () => {
    const notification = resolveOccurrenceNotification({
      parameters: { ...PARAMS },
      settings: CONFIG,
      type: 'recusa_total',
    })
    const serialized = JSON.stringify(notification)

    expect(serialized).not.toInclude('phone')
    expect(serialized).not.toInclude('recipientName')
    expect(serialized).not.toInclude('contact')
  })
})
