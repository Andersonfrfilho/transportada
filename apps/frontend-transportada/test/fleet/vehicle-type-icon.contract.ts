/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { VEHICLE_TYPES } from '../../src/modules/shared/vehicleType.constant'
import { VEHICLE_TYPE_ICONS } from '../../src/modules/shared/vehicleTypeIcon.service'

const ICON = new URL('../../src/components/ui/icon.tsx', import.meta.url)
const FIELDS = new URL(
  '../../src/modules/fleet/components/VehicleIdentityFields.component.tsx',
  import.meta.url,
)

/**
 * Spec 075 RF5 / CA9. O mapa é total por construção (`Record<VehicleType, IconName>` não compila
 * incompleto), mas o desenho **existir** é outra coisa: um nome no tipo sem caminho no `icon.tsx`
 * renderiza um SVG vazio — some da tela sem erro nenhum.
 */
describe('ilustração por tipo de veículo (spec 075 T012)', () => {
  const iconSource = readFileSync(ICON, 'utf8')

  it('todo tipo do catálogo tem ícone mapeado', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      expect(VEHICLE_TYPE_ICONS[vehicleType]).toBeTruthy()
    }
  })

  /** ⚠️ Nome no tipo sem caminho no mapa do `icon.tsx` desenha nada, e nada não dá erro. */
  it('todo ícone mapeado tem caminho desenhado', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      expect(iconSource).toInclude(`'${VEHICLE_TYPE_ICONS[vehicleType]}': [`)
    }
  })

  /** Cada tipo tem desenho próprio: dois tipos com o mesmo ícone não são uma ilustração, são ruído. */
  it('nenhum tipo divide o desenho com outro', () => {
    const nomes = VEHICLE_TYPES.map((vehicleType) => VEHICLE_TYPE_ICONS[vehicleType])

    expect(new Set(nomes).size).toBe(VEHICLE_TYPES.length)
  })

  /** O ícone acompanha rótulo, então é decorativo: o leitor de tela não pode anunciar duas vezes. */
  it('é decorativo ao lado do rótulo', () => {
    const source = readFileSync(FIELDS, 'utf8')

    expect(source).toInclude('aria-hidden="true"')
    expect(source).toInclude('VEHICLE_TYPE_ICONS[state.vehicleType]')
  })

  /** `<svg>` cru no módulo é proibido — o desenho vem do design system (web.md §9). */
  it('não desenha svg dentro do módulo', () => {
    expect(readFileSync(FIELDS, 'utf8')).not.toInclude('<svg')
  })
})
