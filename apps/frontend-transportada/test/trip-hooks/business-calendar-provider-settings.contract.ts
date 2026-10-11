/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.2 (RF11, CA12): o bloco "Chave da FeriadosAPI" da aba Calendário — o estado da chave, o orçamento e o uso do
 * mês, o formulário que NUNCA devolve a chave ao campo, a remoção com confirmação, a recusa de cada código e a leitura
 * sem a permissão `holiday-import.configure`. A chave abaixo é uma sentinela falsa, procurada em tudo o que a tela mostra.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import {
  buildEmptyProviderSettings,
  buildProviderSettings,
  FAKE_PROVIDER_TOKEN,
  SETTINGS_VERSION,
} from '../fixtures/holidayProviderSettings.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  callsOf,
  click,
  dialog,
  endScenario,
  hasButtonIn,
  mountPanel,
  sectionOf,
  startScenario,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import { providerSettingsDouble } from './holidayProviderSettingsDouble.helper'
import { waitFor } from './renderHook.helper'

const HEADING = 'Chave da FeriadosAPI'
const GET_SETTINGS = 'GET /holiday-imports/provider-settings'
const PUT_SETTINGS = 'PUT /holiday-imports/provider-settings'
const DELETE_TOKEN = 'DELETE /holiday-imports/provider-settings/token'

function block(): HTMLElement {
  return sectionOf(HEADING)
}

function blockText(): string {
  return block().textContent ?? ''
}

/** O campo pelo rótulo visível: o `for` do `<label>` aponta o `id` do controle. */
function fieldBy(label: string): HTMLInputElement {
  const labelElement = [...block().querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const control = labelElement === undefined ? null : document.getElementById(labelElement.htmlFor)
  if (!(control instanceof HTMLInputElement)) throw new Error(`FIELD_NOT_FOUND:${label}`)
  return control
}

/** A linha do orçamento no resumo: é onde a marca "padrão" aparece, e só quando ninguém definiu o valor. */
function budgetFact(): string {
  return block().querySelector('[data-fact="budget"]')?.textContent ?? ''
}

/** A confirmação de remover é um diálogo modal fora do bloco (portal no `body`). */
function dialogScope(): HTMLElement {
  const opened = dialog()
  if (opened === null) throw new Error('DIALOG_NOT_FOUND')
  return opened
}

function dialogText(): string {
  return dialog()?.textContent ?? ''
}

function tokenField(): HTMLInputElement {
  const control = block().querySelector<HTMLInputElement>('input[type="password"]')
  if (control === null) throw new Error('TOKEN_FIELD_NOT_FOUND')
  return control
}

function inputValues(): readonly string[] {
  return [...document.querySelectorAll('input')].map((input) => input.value)
}

/** Conta, em vez de comparar o nó com null: o Bun cai ao imprimir um elemento do DOM numa asserção que falha. */
function count(selector: string): number {
  return block().querySelectorAll(selector).length
}

function expectSecretNowhere(): void {
  expect(document.body.textContent).not.toContain(FAKE_PROVIDER_TOKEN)
  expect(inputValues().some((value) => value.includes(FAKE_PROVIDER_TOKEN))).toBe(false)
}

function useEmpty(): void {
  providerSettingsDouble.settings = buildEmptyProviderSettings()
}

function useConfigured(overrides: Parameters<typeof buildProviderSettings>[0] = {}): void {
  providerSettingsDouble.settings = buildProviderSettings(overrides)
}

async function save(): Promise<void> {
  await click(buttonIn(block(), 'Salvar'))
}

describe('bloco da chave da FeriadosAPI: estado (spec 262 T5.2)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('lê a configuração uma vez e mostra a chave pela dica, a data, o orçamento e o uso do mês', async () => {
    useConfigured()
    await mountPanel()

    await waitForText('Chave configurada (…1234)')
    expect(callsOf(GET_SETTINGS, businessCalendarDouble.calls)).toHaveLength(1)
    expect(blockText()).toContain('09/10/2026')
    expect(budgetFact()).toContain('4.500 consultas por mês')
    expect(budgetFact()).toContain('padrão')
    expect(blockText()).toContain('42 de 4.500 consultas usadas neste mês')
  })

  it('sem chave: diz que não há e rotula o campo como a chave, não como "nova"', async () => {
    useEmpty()
    await mountPanel()

    await waitForText('Nenhuma chave configurada')
    expect(blockText()).not.toContain('Chave configurada')
    expect(fieldBy('Chave da FeriadosAPI').type).toBe('password')
    expect(hasButtonIn(block(), 'Remover chave')).toBe(false)
  })

  it('orçamento definido pelo administrador não leva a marca de padrão e abre no campo', async () => {
    useConfigured({ budgetOrigin: 'installation', monthlyRequestBudget: 2500 })
    await mountPanel()

    await waitForText('2.500 consultas por mês')
    expect(budgetFact()).not.toContain('padrão')
    expect(fieldBy('Consultas por mês').value).toBe('2500')
  })

  it('orçamento padrão: o campo abre vazio e o padrão aparece como dica', async () => {
    useConfigured()
    await mountPanel()

    await waitForText('Chave configurada')
    expect(fieldBy('Consultas por mês').value).toBe('')
    expect(fieldBy('Consultas por mês').getAttribute('placeholder')).toBe('padrão: 4500')
  })

  it('orçamento do mês atingido: o bloco diz que a busca está parada', async () => {
    useConfigured({ budgetOrigin: 'installation', monthlyRequestBudget: 42 })
    await mountPanel()

    await waitForText('O orçamento do mês foi atingido')
    expect(blockText()).toContain('42 de 42 consultas usadas neste mês')
  })

  it('a rotina continua pausada: o texto fixo diz que salvar a chave não liga a busca', async () => {
    useConfigured()
    await mountPanel()

    await waitForText('Salvar a chave não liga a busca')
    expect(blockText()).toContain('holiday.provider.pull')
    expect(blockText()).toContain('despausada em Operações')
  })

  it('carregando: esqueleto na forma do bloco e nenhum formulário', async () => {
    businessCalendarDouble.failNext.set(GET_SETTINGS, 'hold')
    await mountPanel()

    expect(count('[aria-busy="true"]')).toBeGreaterThan(0)
    expect(count('input[type="password"]')).toBe(0)
  })

  it('falha ao ler: diz o motivo e "Tentar de novo" lê outra vez', async () => {
    businessCalendarDouble.failNext.set(
      GET_SETTINGS,
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )
    await mountPanel()

    await waitFor(() => expect(count('[role="alert"]')).toBe(1))
    expect(count('input[type="password"]')).toBe(0)
    await click(buttonIn(block(), 'Tentar de novo'))

    await waitForText('Chave configurada')
    expect(callsOf(GET_SETTINGS, businessCalendarDouble.calls)).toHaveLength(2)
  })

  it('sem `settings.manage` o bloco nem é pedido', async () => {
    await mountPanel(false)

    expect(callsOf(GET_SETTINGS, businessCalendarDouble.calls)).toHaveLength(0)
  })
})

describe('bloco da chave da FeriadosAPI: a chave nunca volta ao campo (CA12)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('o campo é de senha, sem preenchimento do navegador nem correção ortográfica, e abre vazio com chave configurada', async () => {
    useConfigured()
    await mountPanel()

    await waitForText('Chave configurada')
    const field = fieldBy('Nova chave')
    expect(field.type).toBe('password')
    expect(field.getAttribute('autocomplete')).toBe('new-password')
    expect(field.getAttribute('spellcheck')).toBe('false')
    expect(field.value).toBe('')
  })

  it('depois de salvar o campo está vazio, a dica nova é a da chave salva e a sentinela não aparece em lugar nenhum', async () => {
    useConfigured()
    await mountPanel()
    await waitForText('Chave configurada')

    await typeInto(fieldBy('Nova chave'), FAKE_PROVIDER_TOKEN)
    await save()

    await waitForText('Configuração salva')
    expect(tokenField().value).toBe('')
    expect(blockText()).toContain('Chave configurada (…0000)')
    expectSecretNowhere()
  })

  it('salvar uma chave nova leva a versão lida e só a chave (o orçamento não muda)', async () => {
    useConfigured()
    await mountPanel()
    await waitForText('Chave configurada')

    await typeInto(fieldBy('Nova chave'), `  ${FAKE_PROVIDER_TOKEN}  `)
    await save()

    await waitForText('Configuração salva')
    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toEqual([
      `${PUT_SETTINGS} {"expectedVersion":"${SETTINGS_VERSION}","token":"${FAKE_PROVIDER_TOKEN}"}`,
    ])
  })

  it('a primeira gravação (sem linha) não manda versão', async () => {
    useEmpty()
    await mountPanel()
    await waitForText('Nenhuma chave configurada')

    await typeInto(fieldBy('Chave da FeriadosAPI'), FAKE_PROVIDER_TOKEN)
    await save()

    await waitForText('Chave configurada (…0000)')
    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toEqual([
      `${PUT_SETTINGS} {"token":"${FAKE_PROVIDER_TOKEN}"}`,
    ])
  })

  it('só o orçamento: o corpo do PUT não leva `token` quando o campo está vazio', async () => {
    useConfigured()
    await mountPanel()
    await waitForText('Chave configurada')

    await typeInto(fieldBy('Consultas por mês'), '2500')
    await save()

    await waitForText('Configuração salva')
    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toEqual([
      `${PUT_SETTINGS} {"expectedVersion":"${SETTINGS_VERSION}","monthlyRequestBudget":2500}`,
    ])
    expect(blockText()).toContain('2.500 consultas por mês')
  })

  it('o servidor recusa: o campo é limpo e a sentinela continua fora da tela', async () => {
    useConfigured()
    businessCalendarDouble.failNext.set(
      PUT_SETTINGS,
      new BusinessCalendarRequestError({ code: 'HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE', status: 500 }),
    )
    await mountPanel()
    await waitForText('Chave configurada')

    await typeInto(fieldBy('Nova chave'), FAKE_PROVIDER_TOKEN)
    await save()

    await waitFor(() => expect(blockText()).toContain('Não foi possível guardar a chave agora'))
    expect(tokenField().value).toBe('')
    expectSecretNowhere()
  })
})

describe('bloco da chave da FeriadosAPI: orçamento e validação (RF11)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('orçamento vazio com valor definido volta ao padrão: o corpo leva `null`', async () => {
    useConfigured({ budgetOrigin: 'installation', monthlyRequestBudget: 2500 })
    await mountPanel()
    await waitForText('2.500 consultas por mês')

    await typeInto(fieldBy('Consultas por mês'), '')
    await save()

    await waitForText('Configuração salva')
    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toEqual([
      `${PUT_SETTINGS} {"expectedVersion":"${SETTINGS_VERSION}","monthlyRequestBudget":null}`,
    ])
    expect(blockText()).toContain('4.500 consultas por mês')
    expect(blockText()).toContain('padrão')
  })

  it('"Usar o padrão" limpa o campo e só aparece quando há valor definido', async () => {
    useConfigured({ budgetOrigin: 'installation', monthlyRequestBudget: 2500 })
    await mountPanel()
    await waitForText('2.500 consultas por mês')

    await click(buttonIn(block(), 'Usar o padrão'))

    expect(fieldBy('Consultas por mês').value).toBe('')
    await save()
    await waitForText('Configuração salva')
    expect(hasButtonIn(block(), 'Usar o padrão')).toBe(false)
  })

  it('orçamento padrão e campo vazio não é mudança: "Salvar" não chama a API e diz que não há o que salvar', async () => {
    useConfigured()
    await mountPanel()
    await waitForText('Chave configurada')

    expect(blockText()).not.toContain('Nada para salvar')
    await save()

    expect(blockText()).toContain('Nada para salvar')
    expect(count('[role="status"]')).toBeGreaterThan(0)
    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toHaveLength(0)
  })

  it('o aviso de "nada para salvar" some assim que se digita', async () => {
    useConfigured()
    await mountPanel()
    await waitForText('Chave configurada')
    await save()

    await typeInto(fieldBy('Consultas por mês'), '3000')

    expect(blockText()).not.toContain('Nada para salvar')
  })

  it.each(['0', '1000001', '12,5', '1.000', 'abc'])(
    'orçamento "%s" é recusado na tela: sem chamada, o campo é marcado inválido e recebe o foco',
    async (typed) => {
      useConfigured()
      await mountPanel()
      await waitForText('Chave configurada')

      await typeInto(fieldBy('Consultas por mês'), typed)
      await save()

      const field = fieldBy('Consultas por mês')
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(document.activeElement === field).toBe(true)
      expect(blockText()).toContain('número inteiro de 1 a 1.000.000')
      expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toHaveLength(0)
    },
  )

  it('chave curta ou com espaço no meio é recusada na tela, sem chamada, e o que foi digitado fica para corrigir', async () => {
    useEmpty()
    await mountPanel()
    await waitForText('Nenhuma chave configurada')

    await typeInto(fieldBy('Chave da FeriadosAPI'), 'curta com espaço')
    await save()

    const field = tokenField()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement === field).toBe(true)
    expect(blockText()).toContain('de 16 a 512 caracteres')
    expect(callsOf(PUT_SETTINGS, businessCalendarDouble.calls)).toHaveLength(0)
  })

  it('o erro do campo é descrito por `aria-describedby`, e corrigir o valor o apaga', async () => {
    useEmpty()
    await mountPanel()
    await waitForText('Nenhuma chave configurada')

    await typeInto(fieldBy('Chave da FeriadosAPI'), 'curta')
    await save()
    const describedBy = tokenField().getAttribute('aria-describedby') ?? ''

    expect(
      describedBy
        .split(' ')
        .some((id) => document.getElementById(id)?.textContent?.includes('16 a 512')),
    ).toBe(true)
    await typeInto(tokenField(), FAKE_PROVIDER_TOKEN)
    await waitFor(() => expect(tokenField().getAttribute('aria-invalid')).toBeNull())
  })
})

describe('bloco da chave da FeriadosAPI: remover a chave (RF11)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('pede confirmação antes de chamar a API, e "Cancelar" não remove nada', async () => {
    useConfigured()
    await mountPanel()
    await waitForText('Chave configurada')

    await click(buttonIn(block(), 'Remover chave'))
    expect(dialogText()).toContain('Remover a chave da FeriadosAPI?')
    expect(callsOf(DELETE_TOKEN, businessCalendarDouble.calls)).toHaveLength(0)

    await click(buttonIn(dialogScope(), 'Cancelar'))
    expect(dialogText()).not.toContain('Remover a chave da FeriadosAPI?')
    expect(callsOf(DELETE_TOKEN, businessCalendarDouble.calls)).toHaveLength(0)
    expect(blockText()).toContain('Chave configurada (…1234)')
  })

  it('confirmar remove só a chave: o orçamento fica e a tela passa a dizer que não há chave', async () => {
    useConfigured({ budgetOrigin: 'installation', monthlyRequestBudget: 2500 })
    await mountPanel()
    await waitForText('Chave configurada')

    await click(buttonIn(block(), 'Remover chave'))
    await click(buttonIn(dialogScope(), 'Sim, remover a chave'))

    await waitForText('Nenhuma chave configurada')
    expect(callsOf(DELETE_TOKEN, businessCalendarDouble.calls)).toHaveLength(1)
    expect(blockText()).toContain('2.500 consultas por mês')
    expect(blockText()).toContain('Chave removida')
    expect(hasButtonIn(block(), 'Remover chave')).toBe(false)
  })

  it('a remoção que o servidor recusa é dita e a chave continua configurada', async () => {
    useConfigured()
    businessCalendarDouble.failNext.set(
      DELETE_TOKEN,
      new BusinessCalendarRequestError({ code: 'FORBIDDEN', status: 403 }),
    )
    await mountPanel()
    await waitForText('Chave configurada')

    await click(buttonIn(block(), 'Remover chave'))
    await click(buttonIn(dialogScope(), 'Sim, remover a chave'))

    await waitFor(() => expect(blockText()).toContain('Seu perfil não tem permissão'))
    expect(blockText()).toContain('Chave configurada (…1234)')
  })
})

describe('bloco da chave da FeriadosAPI: recusas do servidor (RF11)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  async function submitToken(): Promise<void> {
    await waitForText('Chave configurada')
    await typeInto(fieldBy('Nova chave'), FAKE_PROVIDER_TOKEN)
    await save()
  }

  it('409: diz que outra pessoa alterou, relê a configuração e não devolve a chave ao campo', async () => {
    useConfigured()
    businessCalendarDouble.failNext.set(
      PUT_SETTINGS,
      new BusinessCalendarRequestError({
        code: 'HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT',
        status: 409,
      }),
    )
    await mountPanel()
    await submitToken()

    await waitFor(() => expect(blockText()).toContain('Outra pessoa alterou'))
    await waitFor(() => expect(callsOf(GET_SETTINGS, businessCalendarDouble.calls)).toHaveLength(2))
    expect(tokenField().value).toBe('')
    expectSecretNowhere()
  })

  it('400 nomeia o campo e o atalho leva o foco até ele', async () => {
    useConfigured()
    businessCalendarDouble.failNext.set(
      PUT_SETTINGS,
      new BusinessCalendarRequestError({
        code: 'INVALID_REQUEST',
        details: [{ field: 'token', message: 'x' }],
        status: 400,
      }),
    )
    await mountPanel()
    await submitToken()

    await waitFor(() => expect(blockText()).toContain('O servidor recusou os dados enviados'))
    expect(document.activeElement === tokenField()).toBe(true)
    await click(buttonIn(block(), 'Chave da FeriadosAPI'))
    expect(document.activeElement === tokenField()).toBe(true)
    expect(tokenField().value).toBe('')
  })

  it('429 com `Retry-After` diz em quantos minutos tentar de novo', async () => {
    useConfigured()
    businessCalendarDouble.failNext.set(
      PUT_SETTINGS,
      new BusinessCalendarRequestError({
        code: 'TOO_MANY_REQUESTS',
        retryAfterSeconds: 150,
        status: 429,
      }),
    )
    await mountPanel()
    await submitToken()

    await waitFor(() => expect(blockText()).toContain('Tente de novo em 3 min'))
  })

  it('403: diz que o perfil não tem permissão', async () => {
    useConfigured()
    businessCalendarDouble.failNext.set(
      PUT_SETTINGS,
      new BusinessCalendarRequestError({ code: 'FORBIDDEN', status: 403 }),
    )
    await mountPanel()
    await submitToken()

    await waitFor(() => expect(blockText()).toContain('Seu perfil não tem permissão'))
  })

  it('a recusa fica num aviso `role="alert"` e some quando a próxima gravação dá certo', async () => {
    useConfigured()
    businessCalendarDouble.failNext.set(
      PUT_SETTINGS,
      new BusinessCalendarRequestError({ code: 'FORBIDDEN', status: 403 }),
    )
    await mountPanel()
    await submitToken()
    await waitFor(() => expect(count('[role="alert"]')).toBe(1))

    await typeInto(fieldBy('Nova chave'), FAKE_PROVIDER_TOKEN)
    await save()

    await waitForText('Configuração salva')
    expect(count('[role="alert"]')).toBe(0)
    expect(count('[role="status"]')).toBeGreaterThan(0)
  })
})

describe('bloco da chave da FeriadosAPI: só leitura sem `holiday-import.configure` (RF11)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('mostra o estado, mas não há campo de chave, nem "Salvar", nem "Remover chave"', async () => {
    useConfigured()
    await mountPanel(true, false)

    await waitForText('Chave configurada (…1234)')
    expect(count('input[type="password"]')).toBe(0)
    expect(hasButtonIn(block(), 'Salvar')).toBe(false)
    expect(hasButtonIn(block(), 'Remover chave')).toBe(false)
    expect(blockText()).toContain('Só o administrador da empresa pode trocar ou remover a chave')
  })

  it('sem chave configurada o estado também é dito, só que sem formulário', async () => {
    providerSettingsDouble.settings = buildEmptyProviderSettings()
    await mountPanel(true, false)

    await waitForText('Nenhuma chave configurada')
    expect(count('input[type="password"]')).toBe(0)
  })
})
