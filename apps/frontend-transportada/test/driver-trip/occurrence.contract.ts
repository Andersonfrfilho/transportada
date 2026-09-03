/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  DRIVER_RETURN_REASONS,
  driverDocumentOccurrenceTypes,
} from '../../src/modules/driver-trip/shared/driverTrip.types'

const CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)

/**
 * Spec 079. ⚠️ **Havia sobreposição, e ela foi resolvida por escolha, não por acúmulo.**
 *
 * O motorista já dizia o que houve de duas formas: o motivo da **devolução** (`recipient_refused`,
 * `recipient_absent`, `damaged_goods`…) e a ocorrência da **parada** (`long_wait`, `dock_closed`…).
 * O catálogo da 079 traz `recusa_total`, `recusa_parcial`, `avaria_transporte` e
 * `destinatario_ausente` — e três deles dizem a mesma coisa que um motivo de devolução já dizia.
 *
 * Três vocabulários para o mesmo fato, na mesma tela, é o defeito. Então a tela do motorista oferece
 * **só o que a devolução não cobre**: o que aconteceu **sem** a nota voltar.
 */
describe('ocorrência de nota na tela do motorista (spec 079)', () => {
  const source = readFileSync(CARD, 'utf8')

  it('oferece só o que acontece sem a nota voltar', () => {
    expect([...driverDocumentOccurrenceTypes()]).toEqual(['recusa_parcial', 'avaria_transporte'])
  })

  /**
   * ⚠️ `recusa_total` e `destinatario_ausente` **não** aparecem: quem recusa tudo ou não encontra
   * ninguém **devolve a nota**, e ali o motivo já é registrado. Oferecer os dois caminhos para o
   * mesmo fato produz dois registros do mesmo evento, com vocabulários diferentes.
   */
  it('não duplica o que o motivo de devolução já diz', () => {
    const oferecidos = new Set(driverDocumentOccurrenceTypes())

    expect(oferecidos.has('recusa_total')).toBe(false)
    expect(oferecidos.has('destinatario_ausente')).toBe(false)
    expect(DRIVER_RETURN_REASONS).toContain('recipient_refused')
    expect(DRIVER_RETURN_REASONS).toContain('recipient_absent')
  })

  it('a nota tem como registrar a ocorrência', () => {
    expect(source).toInclude('onDocumentOccurrence')
  })

  /** O texto diz que a nota **continua** com ele: é o que separa isto de devolver. */
  it('explica que a carga não volta', () => {
    expect(driverTrip.documentOccurrenceHint.toLowerCase()).toInclude('não volta')
  })
})
