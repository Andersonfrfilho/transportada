/* Copyright (c) 2026 Ada Technology. MIT License. */
export const TRIPS_PATH = '/trips'

/** A nota bipada é procurada na listagem de NF-e; a chave é única por empresa, então uma basta. */
export const NFE_DOCUMENTS_PATH = '/nfe-documents'
export const SCAN_LOOKUP_LIMIT = 1

/**
 * Ler viagem é `fleet.read` — a tela mostra veículo e motorista. Escrever é permissão própria:
 * `fleet.manage` também apaga veículo e motorista, e quem monta a viagem não faz isso.
 */
export const TRIP_READ_PERMISSION = 'fleet.read'
export const TRIP_MANAGE_PERMISSION = 'trip.manage'
/**
 * Spec 065 D4bis: disparar o lote urgente é submeter emissão fiscal, e por isso é a permissão de
 * quem submete o lote normal — **não** a de quem monta a viagem. Quem separa carga não emite CT-e.
 */
export const CTE_SUBMIT_PERMISSION = 'cte.submit'

/**
 * Spec 065 D4c: dispensar manifesto é decisão fiscal com multa do outro lado — a mesma permissão
 * de quem emite, nunca a de quem monta a viagem.
 */
export const MDFE_MANAGE_PERMISSION = 'mdfe.manage'

export const TRIP_ERROR = {
  FORBIDDEN: 'TRIP_FORBIDDEN',
  REQUEST_FAILED: 'TRIP_REQUEST_FAILED',
  RESPONSE_INVALID: 'TRIP_RESPONSE_INVALID',
} as const

export const TRIP_PAGE_SIZE = 25

/** Detalhe e lista compartilham o prefixo: invalidar a viagem precisa refazer a tabela também. */
export const TRIP_QUERY_KEY = 'trips'
export const TRIP_LIST_QUERY_KEY = [TRIP_QUERY_KEY, 'list'] as const

export const TRIP_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>> = {
  STATE_TRANSITION_NOT_ALLOWED: 'stateTransitionNotAllowed',
  TRIP_CLOSED: 'closed',
  TRIP_DOCUMENT_ALREADY_DELIVERED: 'documentAlreadyDelivered',
  TRIP_DOCUMENT_ALREADY_LINKED: 'documentAlreadyLinked',
  TRIP_DOCUMENT_NOT_FOUND: 'documentNotFound',
  TRIP_DOCUMENT_REFERENCE_INVALID: 'documentReferenceInvalid',
  TRIP_DOCUMENT_RETURN_REASON_REQUIRED: 'documentReturnReasonRequired',
  TRIP_DRIVER_DUPLICATED: 'driverDuplicated',
  TRIP_DRIVER_NOT_AVAILABLE: 'driverNotAvailable',
  TRIP_DRIVER_NOT_FOUND: 'driverNotFound',
  TRIP_FORBIDDEN: 'readOnly',
  TRIP_HAS_UNLOADED_DOCUMENTS: 'hasUnloadedDocuments',
  TRIP_NOT_FOUND: 'notFound',
  TRIP_REQUEST_FAILED: 'requestFailed',
  TRIP_RESPONSE_INVALID: 'responseInvalid',
  TRIP_STOP_SET_MISMATCH: 'stopSetMismatch',
  TRIP_VEHICLE_NOT_AVAILABLE: 'vehicleNotAvailable',
  TRIP_VEHICLE_NOT_FOUND: 'vehicleNotFound',
}

export const TRIP_KEYS = [
  'companyId',
  'createdAt',
  'id',
  'requiresMdfe',
  'requiresMdfeReason',
  'status',
  'updatedAt',
  'vehicleId',
] as const

export const TRIP_DRIVER_KEYS = ['driverId', 'driverName', 'driverTaxId', 'position'] as const

export const TRIP_DOCUMENT_KEYS = [
  'createdAt',
  'deliveredAt',
  'destinationOrigin',
  'freightCalculationId',
  'id',
  'loadedAt',
  'nfeDocumentId',
  'releasedAt',
  'returnedAt',
  'returnReason',
  'separatedAt',
  'separationStatus',
  'stopId',
  'tripId',
  'updatedAt',
] as const

export const TRIP_DOCUMENT_DETAIL_KEYS = [
  ...TRIP_DOCUMENT_KEYS,
  'cteAuthorized',
  'fiscalStatus',
] as const

/**
 * Spec 078 D2: campo novo nasce opcional, e sai desta lista quando a API que o serve estiver
 * garantidamente no ar. Bundle novo com API antiga tem o campo ausente, e ausente reprovaria —
 * corretamente, mas quebrando a tela inteira por um rótulo.
 */
export const TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS = [
  'nfeIssuedAt',
  'nfeNumber',
  'nfeSeries',
  'nfeTotalValue',
] as const

/** Spec 078 D2: campo novo nasce opcional até a API que o serve estar garantidamente no ar. */
export const TRIP_STOP_OPTIONAL_KEYS = ['latitude', 'longitude'] as const

export const TRIP_STOP_KEYS = [
  'addressKey',
  'arrivedAt',
  'completedAt',
  'deliveryWindowEnd',
  'deliveryWindowStart',
  'documents',
  'id',
  'label',
  'sequence',
] as const

export const TRIP_DETAIL_KEYS = [...TRIP_KEYS, 'documents', 'drivers', 'stops'] as const

/**
 * Spec 078 D2: **campo novo nasce opcional**, e sai desta lista até a API que o serve estar
 * garantidamente no ar.
 *
 * O deploy atômico cobre "API à frente do bundle"; ele **não** cobre o inverso — bundle novo com
 * API antiga tem o campo ausente, e ausente reprova, corretamente. A guarda não pode ser afrouxada
 * para resolver isso: a rigidez dela é defesa contra vazamento de token e de identidade de tenant
 * (D1). Então a saída é de escrita, não de validação.
 *
 * Passado o deploy que serve o campo, ele migra para `TRIP_DETAIL_KEYS` numa mudança própria — e é
 * essa mudança que torna o contrato exigível de novo.
 */
export const TRIP_DETAIL_OPTIONAL_KEYS = ['cargoLayout', 'cargoWeight', 'occupancy'] as const

/**
 * Spec 079: o peso da carga. **Sem razão de ocupação** — a ficha do veículo não guarda capacidade
 * em massa, e um teto inventado para produzir porcentagem faria alguém parar de carregar, ou
 * continuar.
 */
/** Spec 079 T004: o que a rota do comprovante publica. Sem `bucket` e sem chave de objeto. */
export const TRIP_OCCURRENCE_KEYS = [
  'createdAt',
  'id',
  'note',
  'productCode',
  'stage',
  'type',
] as const

export const TRIP_DOCUMENT_PRODUCT_KEYS = [
  'code',
  'commercialUnit',
  'description',
  'ordinal',
  'quantity',
  'totalValue',
  'unitValue',
] as const

export const DELIVERY_PROOF_KEYS = [
  'createdAt',
  'downloadUrl',
  'expiresAt',
  'id',
  'kind',
  'receiverName',
] as const

export const TRIP_CARGO_WEIGHT_KEYS = [
  'documentsWithoutWeight',
  'grossWeightKilograms',
  'source',
] as const

/** Spec 075: a ocupação do baú. `null` quando a capacidade do veículo não é conhecida. */
export const TRIP_OCCUPANCY_KEYS = [
  'capacityDimensions',
  'capacityM3',
  'capacitySource',
  'documentsWithoutVolume',
  'loadedM3',
  'occupancyRatio',
  'source',
] as const

export const STOP_ADDRESS_COMPONENTS_KEYS = ['cityCode', 'number', 'postalCode'] as const

export const DELIVERY_ADDRESS_OVERRIDE_KEYS = [
  'actorUserId',
  'createdAt',
  'id',
  'newAddress',
  'newLabel',
  'previousAddress',
  'previousLabel',
  'reason',
  'requestedBy',
  'tripDocumentId',
] as const

export const TRANSITION_RESULT_KEYS = ['document', 'tripStatus'] as const

export const TRIP_STATUS_RESULT_KEYS = ['tripStatus'] as const

export const BATCH_STATUS_RESULT_KEYS = ['items', 'tripStatus'] as const

/**
 * Spec 057 P2: o intervalo em que a tela do escritório repete a consulta enquanto a viagem está na
 * rua. Meio minuto é o que separa "acompanhar" de "ficar batendo no servidor".
 */
export const TRIP_ON_THE_ROAD_REFETCH_MS = 30_000

/** As duas fases em que o motorista está reportando. Fora delas não há o que atualizar sozinho. */
export function isTripOnTheRoad(status: string | undefined): boolean {
  return status === 'dispatched' || status === 'in_transit'
}
