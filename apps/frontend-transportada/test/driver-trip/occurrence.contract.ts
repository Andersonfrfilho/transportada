/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  DRIVER_RETURN_REASONS,
  driverSelectableOccurrenceTypes,
} from '../../src/modules/driver-trip/shared/driverTrip.types'

const CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)

const TIPOS = [
  { active: true, id: 'a', name: 'Recebeu parte', stage: 'delivery' as const },
  { active: true, id: 'b', name: 'Item faltante', stage: 'separation' as const },
  { active: false, id: 'c', name: 'Aposentado', stage: 'delivery' as const },
]

/**
 * Spec 079. Os tipos viraram **cadastro da empresa**, e a tela do motorista escolhe entre eles.
 */
describe('ocorrência de nota na tela do motorista (spec 079)', () => {
  const source = readFileSync(CARD, 'utf8')

  /**
   * ⚠️ **Só rua, e só ativo.** O galpão não é dele — ele não separou a carga —, e tipo aposentado
   * sai da escolha sem apagar o que já foi registrado sob ele.
   */
  it('oferece só tipo de rua ativo', () => {
    expect(driverSelectableOccurrenceTypes(TIPOS).map((type) => type.id)).toEqual(['a'])
  })

  it('a nota tem como registrar a ocorrência', () => {
    expect(source).toInclude('onDocumentOccurrence')
    expect(source).toInclude('driverSelectableOccurrenceTypes')
  })

  /**
   * ⚠️ **A sobreposição que a 079 resolveu continua resolvida.** O motorista já dizia o que houve
   * pelo motivo da devolução; o que esta tela acrescenta é o que aconteceu **sem a carga voltar**,
   * e o texto diz isso. Se um dia ela passar a oferecer "recusou tudo", volta a haver dois caminhos
   * para o mesmo fato — e é o texto abaixo que deixa de fazer sentido primeiro.
   */
  it('explica que a carga não volta', () => {
    expect(driverTrip.documentOccurrenceHint.toLowerCase()).toInclude('não volta')
    expect(DRIVER_RETURN_REASONS).toContain('recipient_refused')
  })

  /** Falhar aqui não muda o estado da nota, e o aviso diz isso. */
  it('avisa sem assustar quando o registro falha', () => {
    expect(driverTrip.documentOccurrenceFailed.toLowerCase()).toInclude('continua como estava')
  })
})
