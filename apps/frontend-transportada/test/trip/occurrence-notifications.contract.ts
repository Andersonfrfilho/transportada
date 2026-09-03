/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  resolveSettingsDataScope,
  SETTINGS_PANEL_PLACEMENT,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const PANEL = new URL(
  '../../src/modules/trip/components/TripOccurrenceNotifications.component.tsx',
  import.meta.url,
)

/**
 * Spec 079. **Configuração perto do efeito**: o aviso de ocorrência se liga na tela de viagens, que
 * é onde a ocorrência é registrada e onde ela aparece. Numa tela de configurações genérica, quem
 * liga estaria longe do efeito — que é o que a regra evita.
 */
describe('configuração do aviso de ocorrência (spec 079)', () => {
  const source = readFileSync(PANEL, 'utf8')

  it('o painel mora na tela de viagens', () => {
    expect(SETTINGS_PANEL_PLACEMENT.occurrenceNotifications.module).toBe('trip')
  })

  /**
   * ⚠️ É o registro que faz o campo **vir preenchido**: a consulta liga com `enabled` na aba, e
   * abrir a aba busca o que já está gravado em vez de mostrar tudo desligado.
   */
  it('a aba do painel liga a consulta da configuração', () => {
    const scope = resolveSettingsDataScope('trip', 'notifications')

    expect(scope.occurrenceNotifications).toBe(true)
    expect(resolveSettingsDataScope('trip', 'outra').occurrenceNotifications).toBe(false)
  })

  /** Os sete tipos aparecem, agrupados pelo que decide quem registra: galpão e rua. */
  it('separa galpão de rua', () => {
    // A comparação é com a constante do catálogo, não com o literal — cobrar o literal aqui pediria
    // que o componente contornasse o catálogo, que é justamente o que a cópia por valor evita.
    expect(source).toInclude('TRIP_OCCURRENCE_STAGE.separation')
    expect(trip.occurrence.stageSeparation).toBeString()
    expect(trip.occurrence.stageDelivery).toBeString()
  })

  /**
   * ⚠️ O texto diz **quem recebe** e que o padrão é o silêncio. Sem isso, quem liga não sabe para
   * onde o aviso vai — e um aviso cujo destino ninguém conhece é o que faz o operador desligar tudo
   * na primeira dúvida.
   */
  it('diz quem recebe e qual é o padrão', () => {
    expect(trip.occurrence.notificationsHint).toInclude('despachou')
    expect(trip.occurrence.notificationsHint).toInclude('padrão é não avisar')
  })

  /** Ligar é escrita de configuração: sem `settings.manage` o painel não oferece o interruptor. */
  it('não oferece o interruptor sem permissão', () => {
    expect(source).toInclude('canManage')
  })

  /** Componente órfão não é entrega: a aba existe e monta o painel. */
  it('está montado na aba de avisos da tela de viagens', () => {
    const page = readFileSync(
      new URL('../../src/modules/trip/pages/TripWorkspace.page.tsx', import.meta.url),
      'utf8',
    )

    expect(page).toMatch(/<TripOccurrenceNotifications[\s/>]/u)
    expect(page).toInclude("resolveSettingsDataScope('trip', activeTab)")
  })
})
