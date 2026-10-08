/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AdvancedFilterModel,
  AmountOperator,
  ConditionChanges,
  DocumentFilters,
  FilterMode,
  GroupConnector,
  MultiFilterField,
  SelectFilterField,
  TextFilterField,
} from './nfeFilter.types'

export type NfeFilterPanelCapabilities = Readonly<{
  advanced: boolean
  unlinkedOnly: boolean
}>

/** O que o painel de filtro de notas precisa de quem o hospeda: estado, setters e listas de opção. */
export type NfeFilterPanelController = Readonly<{
  activeConditionCount: number
  addCondition: (groupId: string) => void
  addGroup: () => void
  advancedFilter: AdvancedFilterModel
  capabilities: NfeFilterPanelCapabilities
  cityOptions: Readonly<Record<'emitterCity' | 'recipientCity', readonly string[]>>
  clearConditions: () => void
  /** Emitentes vistos nas notas carregadas, para o filtro de seleção múltipla. */
  emitterOptions: Readonly<Record<MultiFilterField, readonly string[]>>
  filters: DocumentFilters
  mode: FilterMode
  removeCondition: (groupId: string, conditionId: string) => void
  removeGroup: (groupId: string) => void
  saveAdvancedFilter: () => void
  setAmountOperator: (operator: AmountOperator) => void
  setAmountValue: (value: string) => void
  setDateRange: (from: string, to: string) => void
  setGroupConnector: (groupId: string, connector: GroupConnector) => void
  setMode: (mode: FilterMode) => void
  setMultiFilter: (field: MultiFilterField, values: readonly string[]) => void
  setNumberFrom: (value: string) => void
  setNumberTo: (value: string) => void
  setRootConnector: (connector: GroupConnector) => void
  setSelectFilter: (field: SelectFilterField, value: string) => void
  setTextFilter: (field: TextFilterField, value: string) => void
  setUnlinkedOnly: (value: boolean) => void
  stateOptions: Readonly<Record<'emitterState' | 'recipientState', readonly string[]>>
  /** Sugestão para os campos de texto: o operador escolhe o que já veio nas notas ou digita o seu. */
  textOptions: Readonly<Record<TextFilterField, readonly string[]>>
  updateCondition: (groupId: string, conditionId: string, changes: ConditionChanges) => void
}>
