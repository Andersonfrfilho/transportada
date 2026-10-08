/* Copyright (c) 2026 Ada Technology. MIT License. */
export type NfeFilterStatus = 'authorized' | 'cancelled' | 'denied'

export type TextFilterField = 'emitterAddress' | 'recipientAddress' | 'recipientName'

/** Emitente é escolha, não digitação: quem filtra quer três transportadoras nomeadas, não um `contains`. */
export type MultiFilterField = 'emitterName' | 'emitterTaxId'

export type SelectFilterField =
  'cteIssued' | 'emitterCity' | 'emitterState' | 'recipientCity' | 'recipientState' | 'status'

export type AmountOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'neq'

export type FilterMode = 'advanced' | 'simple'

export type FieldType = 'amount' | 'date' | 'number' | 'select' | 'text'

export type ConditionField =
  | 'cteIssued'
  | 'emitterAddress'
  | 'emitterCity'
  | 'emitterName'
  | 'emitterState'
  | 'issuedAt'
  | 'number'
  | 'recipientAddress'
  | 'recipientCity'
  | 'recipientName'
  | 'recipientState'
  | 'series'
  | 'status'
  | 'totalAmount'

export type ConditionOperator =
  | 'after'
  | 'before'
  | 'between'
  | 'contains'
  | 'eq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'neq'
  | 'notContains'

export type GroupConnector = 'and' | 'or'

export type FilterCondition = Readonly<{
  field: ConditionField
  id: string
  operator: ConditionOperator
  value: string
  valueTo: string
}>

export type FilterGroup = Readonly<{
  conditions: readonly FilterCondition[]
  connector: GroupConnector
  id: string
}>

export type AdvancedFilterModel = Readonly<{
  connector: GroupConnector
  groups: readonly FilterGroup[]
}>

export type ConditionChanges = Partial<
  Pick<FilterCondition, 'field' | 'operator' | 'value' | 'valueTo'>
>

export type DocumentFilters = Readonly<{
  amountOperator: AmountOperator
  amountValue: string
  dateFrom: string
  dateTo: string
  multi: Readonly<Record<MultiFilterField, readonly string[]>>
  numberFrom: string
  numberTo: string
  select: Readonly<Record<SelectFilterField, string>>
  text: Readonly<Record<TextFilterField, string>>
  /** Esconde a nota que já tem CT-e vivo ou NFS-e vinculada. */
  unlinkedOnly: boolean
}>
