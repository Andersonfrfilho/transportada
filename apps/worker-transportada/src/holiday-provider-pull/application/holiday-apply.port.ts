/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type ApplyCompanyResult = {
  readonly municipalInserted: number
  readonly stateInserted: number
}

export type HolidayApplyStore = {
  /**
   * Numa transação, sob a trava de calendário da empresa: o municipal em `municipal_holidays` e o
   * estadual em `state_holidays` (`once`, marcado com a entrada), por conjunto e com
   * `ON CONFLICT DO NOTHING`. Só datas de `today` em diante; supressão e remoção respeitadas.
   */
  applyCompany(params: {
    readonly companyId: string
    readonly today: string
  }): Promise<ApplyCompanyResult>
  /** Empresas ativas, com a importação ligada e com alguma cidade na demanda. */
  listCompanies(): Promise<readonly string[]>
  /** O `NACIONAL` vigente do cache, por ano, só dos anos com a busca nacional concluída. */
  readNationalDates(params: {
    readonly years: readonly number[]
  }): Promise<ReadonlyMap<number, readonly string[]>>
}
