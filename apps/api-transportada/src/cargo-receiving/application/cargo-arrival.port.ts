/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AssignCargoArrivalRouteRecordParams,
  AssignCargoArrivalRouteRecordResult,
  CargoArrivalBatchRecordResult,
  CloseCargoArrivalRecordParams,
  CloseCargoArrivalRecordResult,
  FindCargoArrivalRecordParams,
  ListAvailableArrivalDocumentsRecordParams,
  ListCargoArrivalsRecordParams,
  RegisterCargoArrivalRecordParams,
  RegisterCargoArrivalRecordResult,
  TransitionCargoArrivalRecordParams,
} from './cargo-arrival-request.types.js'
import type {
  AvailableArrivalDocument,
  CargoArrivalDetailRecord,
  CargoArrivalListRecord,
  Page,
} from './cargo-arrival.types.js'

export type CargoArrivalRegistrationRepositoryPort = {
  /** Uma transação: chegada, notas, eventos e auditoria — ou nada. */
  register(params: RegisterCargoArrivalRecordParams): Promise<RegisterCargoArrivalRecordResult>
}

export type AvailableArrivalDocumentsLookup =
  | { readonly isContractorFound: false }
  | { readonly isContractorFound: true; readonly page: Page<AvailableArrivalDocument> }

export type CargoArrivalReadRepositoryPort = {
  findDetail(params: FindCargoArrivalRecordParams): Promise<CargoArrivalDetailRecord | null>
  list(params: ListCargoArrivalsRecordParams): Promise<Page<CargoArrivalListRecord>>
  listAvailableDocuments(
    params: ListAvailableArrivalDocumentsRecordParams,
  ): Promise<AvailableArrivalDocumentsLookup>
}

/** Toda escrita trava a chegada primeiro e as notas depois, em ordem de id. */
export type CargoArrivalSeparationRepositoryPort = {
  assignRoute(
    params: AssignCargoArrivalRouteRecordParams,
  ): Promise<AssignCargoArrivalRouteRecordResult>
  close(params: CloseCargoArrivalRecordParams): Promise<CloseCargoArrivalRecordResult>
  transition(params: TransitionCargoArrivalRecordParams): Promise<CargoArrivalBatchRecordResult>
}
