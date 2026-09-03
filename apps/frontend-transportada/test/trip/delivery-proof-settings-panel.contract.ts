/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  resolveSettingsDataScope,
  SETTINGS_PANEL_PLACEMENT,
  settingsPanelsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  DELIVERY_PROOF_FIELD_MODES,
  DELIVERY_PROOF_FIELDS,
} from '../../src/modules/trip/shared/deliveryProofSettings.service'

const PANEL = new URL(
  '../../src/modules/trip/components/TripDeliveryProofSettingsPanel.component.tsx',
  import.meta.url,
)
const PAGE = new URL('../../src/modules/trip/pages/TripWorkspace.page.tsx', import.meta.url)
const QUERY = new URL(
  '../../src/modules/trip/queries/useDeliveryProofSettings.query.ts',
  import.meta.url,
)

/**
 * Spec 082 (D4, ADR-0057). **Configuração perto do efeito**: o formulário do comprovante se decide
 * na tela de viagens, onde a entrega aparece — não numa tela de configurações que cresce sem fim.
 */
describe('painel de configuração do comprovante (spec 082)', () => {
  const panel = readFileSync(PANEL, 'utf8')
  const page = readFileSync(PAGE, 'utf8')
  const query = readFileSync(QUERY, 'utf8')

  it('o painel mora na tela de viagens, na aba do comprovante', () => {
    expect(SETTINGS_PANEL_PLACEMENT.deliveryProof).toEqual({
      module: 'trip',
      source: 'deliveryProofSettings',
      tab: 'proof',
    })
    expect(settingsPanelsOf('trip', 'proof')).toEqual(['deliveryProof'])
  })

  /**
   * ⚠️ É o registro que faz o campo **vir preenchido**: a consulta liga com `enabled` na aba, e
   * abrir a aba busca o que já está gravado em vez de mostrar formulário em branco.
   */
  it('a aba do painel liga a consulta da configuração, e nenhuma outra', () => {
    expect(resolveSettingsDataScope('trip', 'proof').deliveryProofSettings).toBe(true)
    expect(resolveSettingsDataScope('trip', 'trips').deliveryProofSettings).toBe(false)
    expect(resolveSettingsDataScope('trip', 'notifications').deliveryProofSettings).toBe(false)
  })

  /** Escrever configuração é `settings.manage`: a consulta pede permissão **e** aba aberta. */
  it('a consulta sobe por permissão e aba', () => {
    expect(page).toInclude('enabled: canManageSettings && settingsScope.deliveryProofSettings')
    expect(page).toInclude("resolveSettingsDataScope('trip', activeTab)")
    expect(page).toMatch(/<TripDeliveryProofSettingsPanel[\s/>]/u)
  })

  /** ADR-0057 §1: os quatro campos, cada um com os três valores. */
  it('governa os quatro campos com os três valores', () => {
    expect(DELIVERY_PROOF_FIELDS).toEqual([
      'receiverName',
      'receiverDocument',
      'signature',
      'photo',
    ])
    expect(DELIVERY_PROOF_FIELD_MODES).toEqual(['required', 'optional', 'off'])
    for (const field of DELIVERY_PROOF_FIELDS) {
      expect(trip.deliveryProofSettings.fields[field]).toBeString()
    }
    for (const mode of DELIVERY_PROOF_FIELD_MODES) {
      expect(trip.deliveryProofSettings.modes[mode]).toBeString()
    }
  })

  /** ADR-0057 §4: sem linha vale a fábrica — documento desligado, o resto oferecido. */
  it('exibe a fábrica quando não há linha gravada', () => {
    expect(DEFAULT_DELIVERY_PROOF_SETTINGS).toEqual({
      photo: 'optional',
      receiverDocument: 'off',
      receiverName: 'optional',
      signature: 'optional',
    })
    expect(panel).toInclude('settings ?? DEFAULT_DELIVERY_PROOF_SETTINGS')
  })

  /** CNPJ alfanumérico: teclado numérico esconde a letra, e o campo canonicaliza ao digitar. */
  it('o campo de CNPJ canonicaliza e nunca usa teclado numérico', () => {
    expect(panel).toInclude('normalizeTaxId(event.target.value)')
    expect(panel).not.toInclude('inputMode')
  })

  /** As exceções existem na tela: lista, adicionar e remover, tudo pelo `PUT` do conjunto inteiro. */
  it('lista, adiciona e remove exceções por destinatário', () => {
    expect(panel).toInclude('handleAddOverride')
    expect(panel).toInclude('handleRemoveOverride')
    expect(panel).toInclude('onReplaceOverrides')
    expect(trip.deliveryProofSettings.overrides.add).toBeString()
    expect(trip.deliveryProofSettings.overrides.remove).toBeString()
    expect(trip.deliveryProofSettings.overrides.empty).toBeString()
  })

  /** Sem `settings.manage` o painel não oferece escrita. */
  it('não oferece escrita sem permissão', () => {
    expect(panel).toInclude('canManage')
  })

  /** Gravar invalida a consulta — a tela relê o que o servidor gravou, nunca escreve o cache. */
  it('as mutações invalidam as consultas do painel', () => {
    expect(query).toInclude('invalidateQueries({ queryKey: DELIVERY_PROOF_SETTINGS_QUERY_KEY })')
    expect(query).toInclude('invalidateQueries({ queryKey: DELIVERY_PROOF_OVERRIDES_QUERY_KEY })')
  })
})
