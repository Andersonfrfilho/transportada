/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.2 (ADR-0100 §4, RF9): o bloco "Importação de feriados" da aba Calendário — a manchete do estado da
 * rotina, as contagens, as falhas por motivo e a legenda das origens. Dados sintéticos; a API dublada devolve o formato
 * real de `GET /holiday-imports/status`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { buildImportStatus } from '../fixtures/holidayImport.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  callsOf,
  click,
  endScenario,
  mountPanel,
  sectionOf,
  startScenario,
  waitForText,
} from './businessCalendarHarness.helper'
import { waitFor } from './renderHook.helper'

const HEADING = 'Importação de feriados'
const STATUS_CALL = 'GET /holiday-imports/status'

function status(): string {
  return sectionOf(HEADING).textContent ?? ''
}

describe('importação de feriados: estado da rotina (spec 252 T5.2)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('lê o status uma vez e mostra a manchete, a última busca e as contagens', async () => {
    await mountPanel()

    await waitForText('Em dia')
    expect(callsOf(STATUS_CALL, businessCalendarDouble.calls)).toHaveLength(1)
    expect(status()).toContain('A rotina diária buscou os feriados das cidades acompanhadas.')
    expect(status()).toContain('Última busca: 09/10/2026')
    expect(status()).toContain('06:30')
    expect(status()).toContain('8 de 10 buscas concluídas')
    expect(status()).toContain('Cidades acompanhadas: 5')
    expect(status()).toContain('Requisições do mês (toda a instalação): 42')
    expect(status()).toContain('Pendentes')
  })

  it('o progresso é uma barra com valor, máximo e nome', async () => {
    await mountPanel()
    await waitForText('Em dia')

    const bar = sectionOf(HEADING).querySelector('progress')
    expect(bar?.getAttribute('value')).toBe('8')
    expect(bar?.getAttribute('max')).toBe('10')
    const labelId = bar?.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelId)?.textContent).toBe('8 de 10 buscas concluídas')
  })

  it('nunca buscou: aguarda a primeira execução e diz onde retomar a rotina pausada', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      lastFetchedAt: null,
      pairs: { done: 0, failed: 0, notCovered: 0, pending: 10, quotaExhausted: 0, total: 10 },
    })
    await mountPanel()

    await waitForText('Aguardando a primeira execução')
    expect(status()).toContain('Nenhuma busca feita ainda.')
    expect(status()).toContain('Em Operações, confira se ela está pausada ou sem token.')
  })

  it('token errado: a rotina terminou recusada e nada foi gravado, então o cartão diz isso e não "aguardando"', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      lastFetchedAt: null,
      lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'provider_unauthorized' },
      pairs: { done: 0, failed: 0, notCovered: 0, pending: 10, quotaExhausted: 0, total: 10 },
    })
    await mountPanel()

    await waitForText('Fornecedor recusou o acesso: token inválido ou plano sem cobertura')
    expect(status()).not.toContain('Aguardando a primeira execução')
    expect(status()).toContain('Confira a chave configurada e o plano contratado')
    expect(status()).toContain('Operações')
    expect(status()).toContain('Último ciclo da rotina: 09/10/2026')
    expect(status()).toContain('10:00')
  })

  it('fornecedor fora do ar no último ciclo: diz que a rotina tenta de novo', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      lastFetchedAt: null,
      lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'provider_unreachable' },
    })
    await mountPanel()

    await waitForText('Fornecedor indisponível, tentando de novo')
    expect(status()).not.toContain('Aguardando a primeira execução')
  })

  it('resposta num formato que a rotina não entende: manda avisar o suporte', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      lastRun: { finishedAt: '2026-10-09T13:00:00.000Z', outcome: 'malformed_response' },
    })
    await mountPanel()

    await waitForText('Resposta inesperada do fornecedor')
    expect(status()).toContain('avise o suporte')
  })

  it('ciclo que terminou bem não muda a manchete', async () => {
    await mountPanel()

    await waitForText('Em dia')
    expect(status()).toContain('Último ciclo da rotina: 09/10/2026')
  })

  it('API antiga, sem `lastRun`: a tela é a de antes e não inventa a linha do ciclo', async () => {
    const { lastRun: omitted, ...oldStatus } = buildImportStatus()
    expect(omitted).toBeDefined()
    businessCalendarDouble.importStatus = oldStatus
    await mountPanel()

    await waitForText('Em dia')
    expect(status()).not.toContain('Último ciclo da rotina')
  })

  it('cidades fora do plano: o aviso sai à parte, as demais seguem "em dia" e a falha não se repete na lista', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      failures: [{ errorCode: 'provider_plan_restricted', pairs: 2 }],
      pairs: {
        done: 6,
        failed: 2,
        notCovered: 0,
        pending: 2,
        planRestricted: 2,
        quotaExhausted: 0,
        total: 10,
      },
    })
    await mountPanel()

    await waitForText('Em dia')
    const warning = sectionOf(HEADING).querySelector('[data-warning="plan-restricted"]')
    expect(warning?.textContent).toContain('2 buscas (cidade e ano) fora do plano contratado')
    expect(warning?.textContent).toContain('As demais continuam sendo buscadas')
    expect(status()).not.toContain('Falhas por motivo')
    expect(status()).not.toContain('Com falha')
  })

  it('uma busca fora do plano fica no singular', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      pairs: {
        done: 8,
        failed: 1,
        notCovered: 0,
        pending: 1,
        planRestricted: 1,
        quotaExhausted: 0,
        total: 10,
      },
    })
    await mountPanel()

    await waitForText('1 busca (cidade e ano) fora do plano contratado')
  })

  it('sem par fora do plano, não há aviso', async () => {
    await mountPanel()

    await waitForText('Em dia')
    expect(sectionOf(HEADING).querySelector('[data-warning="plan-restricted"]')).toBeNull()
  })

  it('empresa desligada não mostra aviso de plano: nada é buscado', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      isEnabled: false,
      pairs: {
        done: 6,
        failed: 2,
        notCovered: 0,
        pending: 2,
        planRestricted: 2,
        quotaExhausted: 0,
        total: 10,
      },
    })
    await mountPanel()

    await waitForText('Desligada para esta empresa')
    expect(sectionOf(HEADING).querySelector('[data-warning="plan-restricted"]')).toBeNull()
  })

  it('falha real junto do aviso de plano: "Com falhas" e o aviso aparecem juntos', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      failures: [
        { errorCode: 'provider_plan_restricted', pairs: 2 },
        { errorCode: 'persistence_failed', pairs: 1 },
      ],
      pairs: {
        done: 5,
        failed: 3,
        notCovered: 0,
        pending: 2,
        planRestricted: 2,
        quotaExhausted: 0,
        total: 10,
      },
    })
    await mountPanel()

    await waitForText('Com falhas')
    expect(
      sectionOf(HEADING).querySelector('[data-warning="plan-restricted"]')?.textContent,
    ).toContain('2 buscas')
    expect(status()).toContain('O fornecedor respondeu, mas não foi possível gravar')
    expect(status()).not.toContain('O plano do fornecedor não cobre esta consulta.')
  })

  it('com falhas: lista cada motivo por extenso, com a contagem no singular e no plural', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      failures: [
        { errorCode: 'provider_unreachable', pairs: 2 },
        { errorCode: 'provider_unauthorized', pairs: 1 },
      ],
      pairs: { done: 5, failed: 3, notCovered: 0, pending: 2, quotaExhausted: 0, total: 10 },
    })
    await mountPanel()

    await waitForText('Com falhas')
    const lines = [...sectionOf(HEADING).querySelectorAll('li')].map((item) => item.textContent)
    expect(lines).toContain('Não foi possível falar com o fornecedor.2 buscas')
    expect(lines).toContain(
      'O fornecedor recusou a chave de acesso. Confira a chave configurada.1 busca',
    )
  })

  it('código de falha desconhecido cai no texto genérico, sem sumir da lista', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      failures: [{ errorCode: 'algo_novo', pairs: 4 }],
      pairs: { done: 6, failed: 4, notCovered: 0, pending: 0, quotaExhausted: 0, total: 10 },
    })
    await mountPanel()

    await waitForText('Falha não reconhecida pela tela.')
    expect(status()).toContain('4 buscas')
  })

  it('empresa fora da importação: diz que nada é buscado nem gravado', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({ isEnabled: false })
    await mountPanel()

    await waitForText('Desligada para esta empresa')
    expect(status()).toContain('nada é buscado nem gravado')
  })

  it('carregando: esqueleto na forma do bloco, sem manchete', async () => {
    businessCalendarDouble.failNext.set(STATUS_CALL, 'hold')
    await mountPanel()

    expect(sectionOf(HEADING).querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(status()).not.toContain('Em dia')
  })

  it('falha ao ler: diz o motivo e "Tentar de novo" lê outra vez', async () => {
    businessCalendarDouble.failNext.set(
      STATUS_CALL,
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )
    await mountPanel()

    await waitFor(() =>
      expect(sectionOf(HEADING).querySelector('[role="alert"]')?.textContent).toContain(
        'indisponível',
      ),
    )
    await click(buttonIn(sectionOf(HEADING), 'Tentar de novo'))

    await waitForText('Em dia')
    expect(callsOf(STATUS_CALL, businessCalendarDouble.calls)).toHaveLength(2)
  })

  it('resposta fora do formato é dita, nunca engolida', async () => {
    businessCalendarDouble.failNext.set(
      STATUS_CALL,
      new BusinessCalendarRequestError({ code: 'BUSINESS_CALENDAR_RESPONSE_INVALID', status: 0 }),
    )
    await mountPanel()

    await waitFor(() =>
      expect(sectionOf(HEADING).querySelector('[role="alert"]')?.textContent).toContain(
        'formato inesperado',
      ),
    )
  })

  it('a legenda das origens diz o que é nacional, estadual, cadastrado e importado', async () => {
    await mountPanel()
    await waitForText('Em dia')

    expect(status()).toContain('Como ler a coluna Origem')
    expect(status()).toContain('Nacional: vem do calendário do sistema')
    expect(status()).toContain('Estadual: vale para todas as cidades da UF.')
    expect(status()).toContain('Cadastrado: digitado por você; vence o importado da mesma data.')
    expect(status()).toContain('Importado: trazido da FeriadosAPI')
  })

  it('o texto do bloco diz o que os municipais e os estaduais importados fazem', async () => {
    await mountPanel()
    await waitForText('Em dia')

    expect(status()).toContain('fecham os clientes da cidade no roteiro')
    expect(status()).toContain('os estaduais só contam no prazo')
  })
})
