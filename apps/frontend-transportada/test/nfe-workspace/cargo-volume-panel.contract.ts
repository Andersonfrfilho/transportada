/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  SETTINGS_PANEL_PLACEMENT,
  settingsPanelsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const ROOT = new URL('../..', import.meta.url)
const PANEL = 'src/modules/nfe-workspace/components/CargoVolumeFactorPanel.component.tsx'
const HOOK = 'src/modules/nfe-workspace/hooks/useCargoVolumeFactor.hook.ts'

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), 'utf8')
}

/**
 * Spec 077: a 075 entregou a cubagem, as rotas e a ocupação na viagem — e **nenhuma tela**. A
 * feature estava no ar e inalcançável: sem fator não há ocupação, e não havia por onde criar o
 * fator senão escrevendo no banco.
 */
describe('painel do fator de cubagem (spec 077)', () => {
  /**
   * `CLAUDE.md`, "Configuração perto do efeito": o endereço mora **uma vez** no registro, e é ele
   * que faz a consulta ligar com `enabled: canManageSettings && settingsScope.<source>` — painel
   * fora do registro abre formulário em branco sobre dado que existe.
   */
  test('mora na aba de importação, ao lado do peso padrão', () => {
    expect(SETTINGS_PANEL_PLACEMENT.cargoVolume).toEqual({
      module: 'nfe-workspace',
      source: 'cargoVolumeFactors',
      tab: 'imports',
    })
  })

  /**
   * Os dois estimam a mesma coisa a partir do mesmo `qVol`. Separá-los faria o operador procurar
   * em dois lugares por duas metades da mesma configuração.
   */
  test('divide a aba com o peso padrão, não outra', () => {
    const panels = settingsPanelsOf('nfe-workspace', 'imports')

    expect(panels).toContain('cargoVolume')
    expect(panels).toContain('cargoWeight')
  })

  /** ⚠️ Desligar é apagar a linha: o CHECK do banco recusa zero, e gravar zero seria dizer que a
   * carga não ocupa espaço. */
  test('desliga por DELETE, nunca gravando zero', () => {
    const hook = read(HOOK)

    expect(hook).toInclude('clearCargoVolumeFactor')
    expect(hook).not.toInclude("volumePerUnitM3: '0")
  })

  /**
   * ⚠️ D1 **revista na implementação**: o painel exige `settings.manage` e não fica somente-leitura.
   * A fonte é uma só (`GET /company-settings/cargo-volume-factors`, sob `settings.manage`), então
   * um cartão de leitura ali receberia 403 — ao contrário da busca automática de notas, que lê de
   * outra rota, com permissão de operação.
   *
   * A razão original da D1 já está atendida na viagem: ela imprime que o valor é estimado **e** que
   * usa o fator configurado. Quem opera lê a origem do 28% sem precisar do painel.
   */
  test('o painel respeita a permissão, e o componente sabe disso', () => {
    const panel = read(PANEL)

    expect(panel).toInclude('canManage')
    expect(panel).toInclude('cargoVolumeReadOnly')
  })

  /** E a origem do número continua dita onde ele aparece — senão a D1 revista perderia o que ela troca. */
  test('a viagem continua explicando de onde vem o número', () => {
    const trip = JSON.parse(read('src/modules/trip/locales/trip.locale.json')) as {
      occupancy: Record<string, string>
    }

    expect(trip.occupancy.estimated).toInclude('fator de cubagem')
  })

  /** O texto diz o que o número **faz**, não só como ele se chama. */
  test('explica o efeito do número, não só o nome do campo', () => {
    const locale = JSON.parse(
      read('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
    ) as Record<string, string>

    expect(locale.cargoVolumeHint).toInclude('metro')
    expect(locale.cargoVolumeHint).toInclude('ocupação')
  })
})

/**
 * ⚠️ Achado na verificação em staging: o painel do peso já usa "Desligar estimativa", e o meu
 * nasceu com o **rótulo idêntico** na mesma aba. Dois botões com o mesmo texto, lado a lado,
 * desligando coisas diferentes — e um deles desabilitado, o que faz o operador concluir que o
 * recurso não funciona quando ele clicou no outro.
 *
 * Não é detalhe de redação: eu mesmo cliquei no errado ao verificar, e levei três passos para
 * perceber.
 */
describe('os rótulos da aba não se repetem (spec 077)', () => {
  test('cada painel nomeia o que desliga', () => {
    const locale = JSON.parse(
      read('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
    ) as Record<string, string>

    expect(locale.cargoVolumeClear).not.toBe(locale.cargoWeightClear)
    expect(locale.cargoVolumeClear).toInclude('cubagem')
  })
})
