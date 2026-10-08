/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMunicipalRulesQuery } from '../queries/useBusinessCalendar.query'
import {
  readCalendarYear,
  resolveCoveredThroughYear,
} from '../shared/businessCalendarHorizon.service'

type PanelInput = Readonly<{ canManage: boolean; companyId: string | undefined }>

/**
 * O que o painel inteiro precisa dos blocos: até que ano o roteiro já fecha os clientes (o aviso fixo da tela). A
 * leitura das regras é a mesma do bloco municipal — a mesma chave de consulta, então não há segunda ida à rede.
 * Sem `settings.manage` nada é pedido: a tela não pede o que a pessoa não pode ver.
 */
export function useBusinessCalendarPanel(input: PanelInput) {
  const rulesQuery = useMunicipalRulesQuery({
    companyId: input.companyId,
    enabled: input.canManage,
  })
  const currentYear = readCalendarYear(new Date())

  return {
    coveredThroughYear: resolveCoveredThroughYear({ currentYear, rules: rulesQuery.data ?? [] }),
  }
}
