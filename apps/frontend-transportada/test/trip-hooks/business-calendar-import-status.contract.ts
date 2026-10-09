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
    expect(bar?.getAttribute('aria-label')).toBe('8 de 10 buscas concluídas')
  })

  it('nunca buscou: aguarda a primeira execução e diz onde retomar a rotina pausada', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      lastFetchedAt: null,
      pairs: { done: 0, failed: 0, notCovered: 0, pending: 10, quotaExhausted: 0, total: 10 },
    })
    await mountPanel()

    await waitForText('Aguardando a primeira execução')
    expect(status()).toContain('Nenhuma busca feita ainda.')
    expect(status()).toContain('retome-a em Operações')
  })

  it('sem cota: diz que as buscas voltam no dia 1º e conta os pares sem cota', async () => {
    businessCalendarDouble.importStatus = buildImportStatus({
      pairs: { done: 4, failed: 0, notCovered: 1, pending: 0, quotaExhausted: 5, total: 10 },
    })
    await mountPanel()

    await waitForText('Cota do fornecedor esgotada')
    expect(status()).toContain('As buscas voltam no dia 1º do mês.')
    expect(status()).toContain('Sem cota')
    expect(status()).toContain('Sem cobertura do fornecedor')
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
    expect(lines).toContain('O fornecedor recusou a chave de acesso. Confira a chave configurada.1 busca')
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
