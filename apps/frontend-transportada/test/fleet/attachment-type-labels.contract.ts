/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import fleetLocale from '../../src/modules/fleet/locales/fleet.locale.json'

/**
 * Spec 071: a fila de revisão aceita os tipos novos **sem rótulo cru**. O componente monta a chave
 * por interpolação (`applications.attachments.types.${type}`), então tipo sem entrada aqui não
 * quebra o build nem o teste de tela — ele chega ao operador como a própria chave, e é isso que
 * este contrato impede.
 *
 * ⚠️ Cópia por valor de `AGGREGATE_APPLICATION_ATTACHMENT_TYPES` da api: o bundle não carrega código
 * dela. Tipo novo lá é tipo novo aqui.
 */
const ATTACHMENT_TYPES = [
  'address_proof',
  'ccmei',
  'cnh',
  'company_document',
  'crlv',
  'other',
] as const

describe('rótulos dos tipos de anexo da candidatura', () => {
  const labels = fleetLocale.applications.attachments.types as Readonly<Record<string, string>>

  test('todo tipo de anexo tem rótulo, e nenhum é a própria chave', () => {
    for (const type of ATTACHMENT_TYPES) {
      const label = labels[type]
      expect(label).toBeDefined()
      expect(label?.trim().length ?? 0).toBeGreaterThan(0)
      expect(label).not.toBe(type)
    }
  })

  /** Rótulo a mais é tipo que a api não aceita mais — ou tipo que alguém esqueceu de acrescentar lá. */
  test('não há rótulo para tipo que não existe', () => {
    expect(Object.keys(labels).sort()).toEqual([...ATTACHMENT_TYPES].sort())
  })
})
