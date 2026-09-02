/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PhysicalDestinationOrigin } from '../../nfe-documents/domain/physical-destination.policy.js'
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
  /** Spec 073 RF4: `delivery` quando o endereço veio do `<entrega>`, `recipient` do cadastro. */
  readonly destinationOrigin: PhysicalDestinationOrigin | null
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
  /** Spec 065 D4c: `null` significa "derive da classificação das notas" — não "não precisa". */
  readonly requiresMdfe: boolean | null
  readonly requiresMdfeReason: null | string
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
  /**
   * Spec 079 T017: como a nota se chama na tela. `null` quando o vínculo é só cálculo de frete, ou
   * quando a nota sumiu da junção — a queda para o identificador continua existindo, mas deixou de
   * ser o caminho normal.
   */
  readonly nfeIssuedAt: null | string
  readonly nfeNumber: null | string
  readonly nfeSeries: null | string
  readonly nfeTotalValue: null | string
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
  /**
   * Spec 079 T012: onde a parada fica, para o mapa. Sai de `geocoded_addresses` pela `address_key`
   * — **não** de `trip_stops.latitude/longitude`, que existem e nunca são escritos (achado da T009).
   * `null` é endereço ainda não geocodificado, e a tela nomeia a parada fora do mapa.
   */
  readonly latitude: null | string
  readonly longitude: null | string
  readonly arrivedAt: string | null
  readonly completedAt: string | null
  readonly deliveryWindowEnd: string | null
  readonly deliveryWindowStart: string | null
  readonly documents: readonly TripDocumentDetail[]
  readonly id: string
  readonly label: string
  readonly sequence: number
}

/**
 * Spec 075: quanto do baú já foi ocupado. `null` quando a capacidade do veículo não é conhecida —
 * nunca 100%, nunca zero: veículo sem capacidade com carga dentro é o caso em que um número
 * inventado faria alguém parar de carregar, ou continuar.
 *
 * ⚠️ `source` é `estimated` se **qualquer** nota entrou estimada, e a tela é obrigada a imprimir a
 * marca junto do número (contrato de tela, T011).
 */
/**
 * Spec 079: o peso da carga da viagem. **Sem percentual** — a ficha do veículo não guarda
 * capacidade em massa, e um teto inventado para produzir porcentagem é o defeito que a ocupação
 * evita ao devolver `null` sem capacidade conhecida.
 */
export type TripCargoWeightView = {
  readonly documentsWithoutWeight: number
  readonly grossWeightKilograms: string
  readonly source: 'declared' | 'estimated'
}

export type TripOccupancyView = {
  readonly capacityM3: string
  /**
   * As medidas de onde o m³ saiu — da ficha quando `measured`, da referência quando `reference`.
   * `null` no degrau `declared`, em que alguém digitou o volume e as medidas não existem.
   * A tela as imprime para o número parar de ser um total sem procedência.
   */
  readonly capacityDimensions: {
    readonly heightM: string
    readonly lengthM: string
    readonly widthM: string
  } | null
  readonly capacitySource: 'measured' | 'declared' | 'reference'
  readonly documentsWithoutVolume: number
  readonly loadedM3: string
  readonly occupancyRatio: string
  readonly source: 'declared' | 'estimated'
}

/**
 * Spec 076: a fatia do baú de cada parada. ⚠️ É **representação proporcional, não plano de estiva**:
 * a NF-e não traz dimensão de volume, então não há como dizer onde cada caixa vai. `null` quando a
 * capacidade não é conhecida — escala honesta ou nada.
 */
export type TripCargoLayoutView = {
  readonly overflowM3: string
  readonly slices: readonly {
    readonly label: string
    /** `1` é o fundo, e o fundo é da **última** entrega. */
    readonly loadOrder: number
    readonly sequence: number
    readonly share: string
    readonly volumeM3: string
  }[]
  readonly stopsWithoutVolume: readonly {
    readonly documentCount: number
    readonly label: string
  }[]
}

export type TripDetail = Trip & {
  readonly cargoLayout: TripCargoLayoutView | null
  readonly documents: readonly TripDocumentDetail[]
  readonly drivers: readonly TripDriverLine[]
  readonly cargoWeight: TripCargoWeightView | null
  readonly occupancy: TripOccupancyView | null
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
