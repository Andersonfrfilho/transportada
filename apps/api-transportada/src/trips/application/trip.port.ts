/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import type {
  TripDriverCandidate,
  TripDriverLine,
  TripVehicleCandidate,
} from '../domain/trip.policy.js'

export type TripCompanyContext = {
  readonly companyId: string
  readonly userId: string
}

export type TripDocument = {
  readonly createdAt: string
  readonly deliveredAt: string | null
  readonly freightCalculationId: string | null
  readonly id: string
  readonly loadedAt: string | null
  readonly nfeDocumentId: string | null
  readonly releasedAt: string | null
  readonly returnedAt: string | null
  readonly returnReason: string | null
  readonly separatedAt: string | null
  readonly separationStatus: TripDocumentSeparationStatus
  readonly stopId: string | null
  readonly tripId: string
  readonly updatedAt: string
}

export type Trip = {
  readonly companyId: string
  readonly createdAt: string
  readonly id: string
  readonly status: TripStatus
  readonly updatedAt: string
  readonly vehicleId: string
}

/**
 * Status fiscal do documento vinculado, derivado em tempo de leitura (join, sem persistir em
 * `trip_documents` — plan.md § Contratos/API/eventos, T009b). Alimenta o aviso não bloqueante de
 * nota cancelada/rejeitada no frontend (T010).
 *
 * `cteAuthorized` (T011) é um dado de leitura distinto: indica se já existe um `cte_fiscal_documents`
 * autorizado para a nota (direto ou via `freight_calculations.nfe_document_id`) — o `fiscalStatus`
 * acima não carrega essa informação. Alimenta o bloqueio da ação "emitir MDF-e" da viagem no
 * frontend (ADR-0023 §3: o gate é decisão do frontend, a API só expõe o dado de leitura).
 */
export type TripDocumentDetail = TripDocument & {
  readonly cteAuthorized: boolean
  readonly fiscalStatus: string
}

/**
 * Leitura por parada (T014, RF-9): as mesmas notas de `TripDetail.documents`, aninhadas sob a
 * parada que as agrupa (D3) — a fonte da verdade continua sendo a lista plana; `documents` aqui é
 * a mesma nota reaproveitada, nunca uma cópia divergente. Nota sem parada (CEP que não normaliza,
 * ou ainda não vinculada) não aparece em nenhum `TripStopDetail.documents`, mas segue em
 * `TripDetail.documents`.
 */
export type TripStopDetail = {
  readonly addressKey: string
  readonly arrivedAt: string | null
  readonly completedAt: string | null
  readonly deliveryWindowEnd: string | null
  readonly deliveryWindowStart: string | null
  readonly documents: readonly TripDocumentDetail[]
  readonly id: string
  readonly label: string
  readonly sequence: number
}

export type TripDetail = Trip & {
  readonly documents: readonly TripDocumentDetail[]
  readonly drivers: readonly TripDriverLine[]
  readonly stops: readonly TripStopDetail[]
}

export type CreateTripRecord = {
  readonly companyId: string
  readonly crew: readonly TripDriverLine[]
  readonly vehicleId: string
}

/**
 * Nenhum precedente de `sortBy`/`sortDirection`/`filters[]` existe no backend (docs/frontend/data-tables.md
 * descreve o contrato ideal do frontend, mas nenhuma rota real o implementa — nem `nfe-workspace`,
 * nem `cte-batches`). T009b segue o padrão realmente usado por `mdfe-manifests`, que é o irmão mais
 * próximo desta feature: paginação cursor keyset, chaves de filtro planas com allowlist, ordenação
 * fixa no servidor (`desc(createdAt), desc(id)`). Documentado como decisão local em evidence.md.
 */
export type TripFilters = {
  readonly createdFrom?: string
  readonly createdUntil?: string
  readonly driverIdEq?: string
  readonly statusEq?: TripStatus
  readonly vehicleIdEq?: string
}

export type TripPage = {
  readonly items: readonly Trip[]
  readonly nextCursor: string | null
}

export type TripRepositoryPort = {
  /** Idempotente (ADR-0017): fechar uma viagem já fechada devolve a mesma viagem, sem erro. */
  close(input: { readonly companyId: string; readonly tripId: string }): Promise<TripDetail | null>
  create(input: CreateTripRecord): Promise<TripDetail>
  /** Idempotente: marcar como entregue um documento já entregue devolve o mesmo registro. */
  deliverDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null>
  findById(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripDetail | null>
  findDocumentById(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null>
  findVehicle(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<TripVehicleCandidate | null>
  /** Lança `TripDocumentAlreadyLinkedError` quando a nota/frete já está vivo em outra viagem. */
  linkDocument(input: {
    readonly companyId: string
    readonly freightCalculationId: string | null
    readonly nfeDocumentId: string | null
    readonly tripId: string
  }): Promise<TripDocument>
  list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: TripFilters
    readonly limit: number
  }): Promise<TripPage>
  listDrivers(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }): Promise<readonly TripDriverCandidate[]>
  /** Devolve `null` quando o documento já não está mais elegível para desvínculo (entregue/liberado). */
  releaseDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null>
}
