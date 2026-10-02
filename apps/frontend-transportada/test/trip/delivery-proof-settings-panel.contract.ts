/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import {
  resolveSettingsDataScope,
  SETTINGS_PANEL_PLACEMENT,
  settingsPanelsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE,
  DELIVERY_PROOF_FIELD_MODES,
  DELIVERY_PROOF_FIELDS,
  upsertDeliveryProofOverride,
} from '../../src/modules/trip/shared/deliveryProofSettings.service'

const PANEL = new URL(
  '../../src/modules/trip/components/TripDeliveryProofSettingsPanel.component.tsx',
  import.meta.url,
)
/** O painel foi partido em componentes irmãos: o contrato lê o painel e tudo que saiu dele. */
const PANEL_EXTRACTED_SOURCES = [
  new URL(
    '../../src/modules/trip/components/DeliveryProofCargoMinimum.component.tsx',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/trip/components/DeliveryProofCargoSection.component.tsx',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/trip/components/DeliveryProofContractorOverrides.component.tsx',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/trip/components/DeliveryProofModeSelect.component.tsx',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/trip/components/DeliveryProofModeSummaries.component.tsx',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/trip/components/DeliveryProofOverrideModeFields.component.tsx',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/trip/components/DeliveryProofPunctualityFields.component.tsx',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/trip/components/DeliveryProofTaxIdOverrides.component.tsx',
    import.meta.url,
  ),
  new URL('../../src/modules/trip/components/CanhotoOcrSection.component.tsx', import.meta.url),
  new URL('../../src/modules/trip/shared/deliveryProofPanelFields.constant.ts', import.meta.url),
]
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
  const panel = [PANEL, ...PANEL_EXTRACTED_SOURCES]
    .map((source) => readFileSync(source, 'utf8'))
    .join('\n')
  /** Ordem de tela só se mede num arquivo: no texto concatenado quem vem antes é quem foi lido antes. */
  const panelOnly = readFileSync(PANEL, 'utf8')
  const cargoSection = readFileSync(
    new URL(
      '../../src/modules/trip/components/DeliveryProofCargoSection.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )
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

  /**
   * ADR-0057 §1 + pedido do usuário (01/10): `receivedBy` virou o quinto campo — o painel era o
   * único lugar sem controle para ele, deixando "Quem recebeu" sempre `optional` por falta de
   * jeito de desligar, mesmo a API e o banco já suportando.
   */
  it('governa os cinco campos com os três valores', () => {
    expect(DELIVERY_PROOF_FIELDS).toEqual([
      'receiverName',
      'receiverDocument',
      'signature',
      'photo',
      'receivedBy',
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
      cargo: 'off',
      cargoMinimumCount: 1,
      photo: 'optional',
      receivedBy: 'optional',
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

  /** Revisão 082 (item 8): a exceção valida pelo CONJUNTO (CNPJ tem letra), nunca por comprimento. */
  it('a exceção valida o documento por padrão, não por comprimento', () => {
    expect(panel).toInclude('CPF_PATTERN.test(overrideTaxId) || CNPJ_PATTERN.test(overrideTaxId)')
    expect(panel).not.toInclude('overrideTaxId.length ===')
  })

  /** O merge campo a campo mora no serviço — nenhum spread inline remonta a configuração. */
  it('o merge da configuração vem do serviço, não de spread inline', () => {
    expect(panel).toInclude('mergeDeliveryProofSettings')
    expect(panel).not.toInclude('{ ...general, ...draft }')
    expect(panel).not.toInclude('{ ...general, ...overrideDraft }')
  })

  /** As exceções existem na tela: lista, adicionar e remover, tudo pelo `PUT` do conjunto inteiro. */
  it('lista, adiciona e remove exceções por destinatário', () => {
    expect(panel).toInclude('handleSubmitOverride')
    expect(panel).toInclude('handleRemoveOverride')
    expect(panel).toInclude('onReplaceOverrides')
    expect(trip.deliveryProofSettings.overrides.add).toBeString()
    expect(trip.deliveryProofSettings.overrides.remove).toBeString()
    expect(trip.deliveryProofSettings.overrides.empty).toBeString()
  })

  /**
   * Alterar uma exceção existente: o mesmo formulário de adicionar carrega o item e, ao confirmar,
   * o substitui no conjunto (o `PUT` leva a lista inteira) em vez de empilhar outro.
   */
  describe('edição de exceção existente', () => {
    const taxIdOverrides = readFileSync(
      new URL(
        '../../src/modules/trip/components/DeliveryProofTaxIdOverrides.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const contractorOverrides = readFileSync(
      new URL(
        '../../src/modules/trip/components/DeliveryProofContractorOverrides.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    /**
     * A regra central roda, não é conferida por texto: `toInclude` na fonte prova que a linha
     * existe, nunca que ela faz a coisa certa. Os dois componentes chamam esta função.
     */
    it('substitui o item editado no conjunto em vez de empilhar outro', () => {
      const existente = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, taxId: '11222333000181' }
      const outro = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, taxId: '99888777000166' }
      const editado = { ...existente, receiverName: 'off' } as const

      expect(
        upsertDeliveryProofOverride({
          editingKey: existente.taxId,
          keyOf: (override) => override.taxId,
          override: editado,
          overrides: [existente, outro],
        }),
      ).toEqual([editado, outro])
    })

    it('sem item em edição, empilha no fim — o formulário volta a ser o de adicionar', () => {
      const existente = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, taxId: '11222333000181' }
      const novo = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, taxId: '99888777000166' }

      expect(
        upsertDeliveryProofOverride({
          keyOf: (override) => override.taxId,
          override: novo,
          overrides: [existente],
        }),
      ).toEqual([existente, novo])
    })

    /** Chave que não está mais no conjunto (removida em outra aba) não inventa linha nova. */
    it('chave em edição que já saiu do conjunto não ressuscita o item', () => {
      const existente = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, taxId: '11222333000181' }
      const fantasma = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, taxId: '99888777000166' }

      expect(
        upsertDeliveryProofOverride({
          editingKey: fantasma.taxId,
          keyOf: (override) => override.taxId,
          override: fantasma,
          overrides: [existente],
        }),
      ).toEqual([existente])
    })

    it('o par por contratante passa pela mesma função, chaveado por id', () => {
      for (const source of [taxIdOverrides, contractorOverrides]) {
        expect(source).toInclude('upsertDeliveryProofOverride({')
      }
      expect(taxIdOverrides).toInclude('keyOf: (current) => current.taxId')
      expect(contractorOverrides).toInclude('keyOf: (current) => current.contractorId')
    })

    it('a duplicidade ignora o próprio item em edição', () => {
      expect(taxIdOverrides).toInclude(
        'override.taxId === overrideTaxId && override.taxId !== editingTaxId',
      )
      expect(contractorOverrides).toMatch(
        /override\.contractorId === overrideContractorId &&\s+override\.contractorId !== editingContractorId/u,
      )
    })

    it('carrega os valores salvos no formulário e permite cancelar', () => {
      expect(taxIdOverrides).toInclude('handleStartEditOverride')
      expect(taxIdOverrides).toInclude('setOverrideDraft(override)')
      expect(contractorOverrides).toInclude('handleStartEditContractorOverride')
      expect(contractorOverrides).toInclude('setContractorOverrideDraft(override)')
      for (const source of [taxIdOverrides, contractorOverrides]) {
        expect(source).toInclude('deliveryProofSettings.overrides.edit')
        expect(source).toInclude('deliveryProofSettings.overrides.saveChanges')
        expect(source).toInclude('deliveryProofSettings.overrides.cancelEdit')
        expect(source).toInclude('onClick={resetForm}')
      }
    })

    it('remover o item em edição devolve o formulário ao modo adicionar', () => {
      expect(taxIdOverrides).toInclude('if (taxId === editingTaxId) resetForm()')
      expect(contractorOverrides).toInclude('if (contractorId === editingContractorId) resetForm()')
    })

    it('rotula editar, salvar e cancelar nos dois idiomas', () => {
      for (const locale of [trip, tripEn]) {
        expect(locale.deliveryProofSettings.overrides.edit).toBeString()
        expect(locale.deliveryProofSettings.overrides.saveChanges).toBeString()
        expect(locale.deliveryProofSettings.overrides.cancelEdit).toBeString()
      }
      expect(trip.deliveryProofSettings.overrides.saveChanges).toBe('Salvar alterações')
    })
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

  /**
   * Spec 156 T14, ADR-0069 §6: o painel do interruptor mora aqui — perto do efeito, que é o
   * assistente do escritório na própria tela de viagens (SETTINGS_PANEL_PLACEMENT).
   */
  describe('o interruptor da leitura do canhoto (T14)', () => {
    it('mostra o selo "Experimental" ao lado do efeito', () => {
      expect(panel).toInclude('deliveryProofSettings.canhotoOcr.experimental')
      expect(trip.deliveryProofSettings.canhotoOcr.experimental).toBe('Experimental')
    })

    it('liga/desliga só o interruptor, sem oferecer escrita sem permissão', () => {
      expect(panel).toInclude('onToggleCanhotoOcr(effective, canhotoOcrEnabled !== true)')
      expect(query).toInclude('getTripClient().saveCanhotoOcrEnabled(input)')
    })

    it('gravar o interruptor invalida a mesma consulta da configuração', () => {
      expect(query).toInclude('useSaveCanhotoOcrEnabledMutation')
      const mutationBody = query.split('useSaveCanhotoOcrEnabledMutation')[1] ?? ''
      expect(mutationBody).toInclude(
        'invalidateQueries({ queryKey: DELIVERY_PROOF_SETTINGS_QUERY_KEY })',
      )
    })

    it('a página passa o dado e o estado de gravação ao painel', () => {
      expect(page).toInclude(
        'canhotoOcrEnabled={deliveryProofSettingsQuery.data?.canhotoOcrEnabled}',
      )
      expect(page).toInclude('isTogglingCanhotoOcr={saveCanhotoOcrEnabledMutation.isPending}')
    })

    it('desligado por padrão vale texto de estimativa, não silêncio', () => {
      expect(trip.deliveryProofSettings.canhotoOcr.hint).toBeString()
      expect(trip.deliveryProofSettings.canhotoOcr.hint.length).toBeGreaterThan(0)
    })
  })

  /**
   * Spec 220 RF04/RF06/RF07/RF08: dois campos de foto. `cargo` é modo como os outros, então entra
   * na lista de exibição do painel — mas não em `DELIVERY_PROOF_FIELDS`, que a tela de resolução
   * (`SettingsResolutionPanel`) também usa e o teste acima fixa em quatro.
   */
  describe('a foto do canhoto e a foto da mercadoria (spec 220 T1.6)', () => {
    const photoHintAt = panelOnly.indexOf('deliveryProofSettings.photoHint')
    const ocrTitleAt = panelOnly.indexOf('<CanhotoOcrSection')
    const cargoSectionAt = panelOnly.indexOf('<DeliveryProofCargoSection')

    it('rotula os dois campos e explica o que cada foto prova, nos dois idiomas', () => {
      expect(trip.deliveryProofSettings.fields.photo).toBe('Foto do canhoto')
      expect(trip.deliveryProofSettings.fields.cargo).toBe('Foto da mercadoria')
      for (const locale of [trip, tripEn]) {
        expect(locale.deliveryProofSettings.photoHint.length).toBeGreaterThan(0)
        expect(locale.deliveryProofSettings.cargoHint.length).toBeGreaterThan(0)
        expect(locale.deliveryProofSettings.fields.cargo).toBeString()
        expect(locale.deliveryProofSettings.cargoMinimumCount.label).toBeString()
      }
      expect(trip.deliveryProofSettings.photoHint).toMatch(/[áâãçéêíóôõú]/u)
    })

    it('nenhuma lista de modos sai de DELIVERY_PROOF_FIELDS: todas passam pela do painel', () => {
      expect(panel).not.toInclude('DELIVERY_PROOF_FIELDS.map')
      expect(panel).toInclude('PANEL_MODE_FIELDS')
      expect(panel).toMatch(/'cargo'/u)
    })

    it('o interruptor do canhoto mora dentro do campo do canhoto, antes do da mercadoria', () => {
      expect(photoHintAt).toBeGreaterThan(-1)
      expect(ocrTitleAt).toBeGreaterThan(photoHintAt)
      expect(cargoSectionAt).toBeGreaterThan(ocrTitleAt)
      expect(cargoSection).toInclude('deliveryProofSettings.cargoHint')
    })

    it('o mínimo só aparece com cargo obrigatório e só existe para a mercadoria', () => {
      expect(panel).toInclude("=== 'required'")
      expect(panel).toInclude('DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE')
      expect(panel).toInclude('cargoMinimumCount')
      expect(panel).not.toMatch(/photoMinimum/iu)
    })

    it('o mínimo é uma escolha de 1 ao teto, sem digitação que possa passar do teto', () => {
      expect(DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE).toEqual({ max: 5, min: 1 })
      expect(panel).not.toMatch(/cargoMinimumCount[^\n]*type="number"/u)
    })
  })
})
