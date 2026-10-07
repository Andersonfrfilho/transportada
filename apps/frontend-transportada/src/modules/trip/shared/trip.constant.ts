/* Copyright (c) 2026 Ada Technology. MIT License. */
import { OCCURRENCE_CORRECTION_ERROR } from './occurrence.constant'
import {
  OCCURRENCE_TYPE_DECLARED_AMOUNT_ERROR,
  OCCURRENCE_TYPE_MOMENTS_ERROR,
} from './occurrenceMoment.constant'

export const TRIPS_PATH = '/trips'

/** A nota bipada é procurada na listagem de NF-e; a chave é única por empresa, então uma basta. */
export const NFE_DOCUMENTS_PATH = '/nfe-documents'

/** A recomendação de vários veículos nasce fora da árvore `/trips/:id`: é o aceite que cria viagem. */
export const ROUTE_SUGGESTIONS_PATH = '/route-suggestions'
export const SCAN_LOOKUP_LIMIT = 1

/**
 * Ler viagem é `fleet.read` — a tela mostra veículo e motorista. Escrever é permissão própria:
 * `fleet.manage` também apaga veículo e motorista, e quem monta a viagem não faz isso.
 */
export const TRIP_READ_PERMISSION = 'fleet.read'
export const TRIP_MANAGE_PERMISSION = 'trip.manage'
/**
 * Spec 156 D11/T8: o escritório dá baixa (`trip.report-on-behalf`) e precisa abrir a viagem sem
 * ganhar `fleet.read` — a ficha de todos os motoristas. `canReadTrip` substitui a leitura direta de
 * `TRIP_READ_PERMISSION` (`useTripWorkspace.hook.ts`): a tela de `/ocorrencias` continua só em
 * `fleet.read`, por constante própria (`TripOccurrencesWorkspace.page.tsx`).
 */
export const TRIP_REPORT_ON_BEHALF_PERMISSION = 'trip.report-on-behalf'

export function canReadTrip(permissions: readonly string[]): boolean {
  return (
    permissions.includes(TRIP_READ_PERMISSION) ||
    permissions.includes(TRIP_REPORT_ON_BEHALF_PERMISSION)
  )
}
/**
 * Spec 065 D4bis: disparar o lote urgente é submeter emissão fiscal, e por isso é a permissão de
 * quem submete o lote normal — **não** a de quem monta a viagem. Quem separa carga não emite CT-e.
 */
export const CTE_SUBMIT_PERMISSION = 'cte.submit'

/**
 * Spec 175 RF7: a permissão de cada documento é conferida separadamente — `nfse.issue` é a mesma
 * que a rota `POST /nfse-service-invoices` exige (`nfse-invoices.routes.ts:172`). Mesmo valor de
 * `NFSE_ISSUE_PERMISSION` em `modules/nfse-invoice/shared/nfseInvoice.constant.ts`; cópia por valor
 * para não fazer `trip` depender de `nfse-invoice` só por uma string.
 */
export const NFSE_ISSUE_PERMISSION = 'nfse.issue'

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

/**
 * Spec 137: o código que a API devolve quando o banco não respondeu no prazo — não nasce no
 * cliente da viagem como o resto de `TRIP_ERROR`, mas é o que o detalhe recebe num 503, e é o que
 * distingue "tente de novo" de uma falha qualquer.
 */
export const DATABASE_UNAVAILABLE_ERROR_CODE = 'DATABASE_UNAVAILABLE'

/** Viagem grande leva segundos para montar o mapa de carga — o aviso só aparece depois deste prazo. */
export const SLOW_LOAD_NOTICE_DELAY_MS = 4000

export const TRIP_PAGE_SIZE = 25

export const CANHOTO_REVIEW_ALREADY_RESOLVED_CODE = 'CANHOTO_REVIEW_ALREADY_RESOLVED'
export const CANHOTO_REVIEW_OUTCOME = {
  ALREADY_RESOLVED: 'alreadyResolved',
  APPLIED: 'applied',
} as const
export type CanhotoReviewOutcome =
  (typeof CANHOTO_REVIEW_OUTCOME)[keyof typeof CANHOTO_REVIEW_OUTCOME]

/** O aviso do painel é o sufixo da chave em `deliveryProof.canhotoReview`. */
export const CANHOTO_REVIEW_NOTICE = {
  ALREADY_RESOLVED: CANHOTO_REVIEW_OUTCOME.ALREADY_RESOLVED,
  AUTOMATIC_UNAVAILABLE: 'automaticUnavailable',
  FAILED: 'failed',
} as const
export type CanhotoReviewNotice = (typeof CANHOTO_REVIEW_NOTICE)[keyof typeof CANHOTO_REVIEW_NOTICE]

/** Detalhe e lista compartilham o prefixo: invalidar a viagem precisa refazer a tabela também. */
export const TRIP_QUERY_KEY = 'trips'
/** O segmento da lista de ocorrências de uma nota: `[trips, companyId, tripId, 'occurrences', documentId]`. */
export const TRIP_OCCURRENCES_KEY_SEGMENT = 'occurrences'
export const TRIP_LIST_QUERY_KEY = [TRIP_QUERY_KEY, 'list'] as const

/**
 * Um carregador, **uma chave**. As duas montagens — a manual do "Nova viagem" e a automática do
 * roteiro — nasceram com chaves próprias sobre esta mesma função, e isso custava duas varreduras
 * paginadas da base de notas por abertura da tela de viagens, para guardar duas cópias do mesmo
 * recorte.
 *
 * ⚠️ Chave separada nunca serviu para invalidar uma sem a outra: as duas sempre penderam de
 * `[TRIP_QUERY_KEY]`, e é o prefixo que as derruba juntas. Quem for separá-las de novo precisa
 * primeiro de um motivo que o cache saiba distinguir.
 */
export const AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY = [TRIP_QUERY_KEY, 'available-documents'] as const

export const TRIP_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>> = {
  DRIVER_NOT_ON_TRIP: 'driverNotOnTrip',
  /** Spec 156 T7.3/T9 (L4): tipo de separação, aposentado ou inexistente no lote de ocorrência. */
  OCCURRENCE_TYPE_NOT_FIELD: 'occurrenceTypeNotField',
  STATE_TRANSITION_NOT_ALLOWED: 'stateTransitionNotAllowed',
  /** Spec 156 T8c: encerrar com nota em aberto exige motivo, e o aviso sai dentro do diálogo. */
  TRIP_CLOSE_REASON_REQUIRED: 'closeReasonRequired',
  TRIP_CLOSED: 'closed',
  TRIP_DOCUMENT_ALREADY_DELIVERED: 'documentAlreadyDelivered',
  TRIP_DOCUMENT_ALREADY_LINKED: 'documentAlreadyLinked',
  TRIP_DOCUMENT_NOT_FOUND: 'documentNotFound',
  /** Spec 156 T7.3/T9: alguma nota do lote não pertence à viagem — `details.unreachableDocumentIds`. */
  TRIP_DOCUMENT_NOT_REACHABLE: 'documentNotReachable',
  TRIP_DOCUMENT_REFERENCE_INVALID: 'documentReferenceInvalid',
  TRIP_DOCUMENT_RETURN_REASON_REQUIRED: 'documentReturnReasonRequired',
  /** Spec 235 D5: a ficha escolhida como motorista só ajuda (`can_drive` falso) — 409, ids em `details`. */
  TRIP_DRIVER_CANNOT_DRIVE: 'driverCannotDrive',
  TRIP_DRIVER_DUPLICATED: 'driverDuplicated',
  TRIP_DRIVER_NOT_AVAILABLE: 'driverNotAvailable',
  TRIP_DRIVER_NOT_FOUND: 'driverNotFound',
  /** Spec 156 D3: a mesma chave enviada por outro ator ou com outro conteúdo. */
  TRIP_FIELD_REPORT_KEY_REUSED: 'idempotencyKeyReused',
  TRIP_FORBIDDEN: 'readOnly',
  TRIP_HAS_UNLOADED_DOCUMENTS: 'hasUnloadedDocuments',
  TRIP_NOT_FOUND: 'notFound',
  TRIP_REQUEST_FAILED: 'requestFailed',
  /** Mesmo fato, nome sem prefixo — vem das telas de rua. Falha de rede de verdade fala em internet. */
  REQUEST_FAILED: 'requestFailed',
  TRIP_RESPONSE_INVALID: 'responseInvalid',
  /** Spec 178 RF6: a troca de critério pediu uma rota nova e o roteirizador não devolveu — a
   *  anterior continua valendo. */
  TRIP_ROUTE_UNAVAILABLE: 'routeUnavailable',
  TRIP_STOP_SET_MISMATCH: 'stopSetMismatch',
  /** Spec 158 T6: `GET /trips/:id/timeline` com `cursor` malformado. */
  TRIP_TIMELINE_CURSOR_INVALID: 'timelineCursorInvalid',
  /** Spec 147 D3/RF8: os quatro códigos novos da carreta — RF5/T10/T11. */
  TRIP_TRAILER_IN_USE: 'trailerInUse',
  TRIP_TRAILER_NOT_A_TRAILER: 'trailerNotATrailer',
  TRIP_TRAILER_REQUIRED: 'trailerRequired',
  TRIP_TRAILER_REQUIRES_TRACTOR: 'trailerRequiresTractor',
  TRIP_VEHICLE_NOT_AVAILABLE: 'vehicleNotAvailable',
  TRIP_VEHICLE_NOT_FOUND: 'vehicleNotFound',
  /** Spec 156 D3: viagem sem motorista não aceita baixa pelo escritório. */
  TRIP_WITHOUT_DRIVER: 'withoutDriver',
  /** Spec 156 T6/T12 (aceite 12): baixa repetida do escritório — informativo, não erro vermelho. */
  DOCUMENT_ALREADY_SETTLED: 'documentAlreadySettled',
  /** Spec 156 T6/T12 (aceite 8): "Entregue em" fora da janela aceita pelo servidor. */
  DELIVERED_AT_IN_FUTURE: 'deliveredAtInFuture',
  DELIVERED_AT_BEFORE_DISPATCH: 'deliveredAtBeforeDispatch',
  /** Spec 156 T6/T12 (aceite 9): a empresa exige foto e o escritório não anexou nenhuma. */
  /** Spec 156 T15 A1: "Chegou em"/"Devolvido em" fora da janela aceita pelo servidor — mesma régua
   * de `DELIVERED_AT_*`. */
  ARRIVED_AT_IN_FUTURE: 'arrivedAtInFuture',
  ARRIVED_AT_BEFORE_DISPATCH: 'arrivedAtBeforeDispatch',
  RETURNED_AT_IN_FUTURE: 'returnedAtInFuture',
  RETURNED_AT_BEFORE_DISPATCH: 'returnedAtBeforeDispatch',
  /** Spec 156 T15: assinatura `required` exige o nome de quem recebeu, não só a foto. */
  TRIP_DELIVERY_PROOF_RECEIVER_NAME_REQUIRED: 'deliveryProofReceiverNameRequired',
  /** Spec 156 T15 M1: o motorista já enviou o comprovante dele — o escritório não o substitui. */
  TRIP_DELIVERY_PROOF_ALREADY_CAPTURED: 'deliveryProofAlreadyCaptured',
  /** Spec 156 T15: outra escrita ganhou a corrida (start-route/confirm-load) — tentar de novo. */
  TRIP_STATUS_WRITE_CONFLICT: 'statusWriteConflict',
  /** Spec 156 T15: canhoto do escritório maior que o teto, ou bytes que não batem com uma imagem. */
  TRIP_DELIVERY_PROOF_TOO_LARGE: 'deliveryProofTooLarge',
  TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE: 'deliveryProofUnsupportedType',
  /** Spec 164, achado 1: decisão divergente da transportadora sobre tratativa já `decided`. */
  OCCURRENCE_CASE_DECISION_CONFLICT: 'occurrenceCaseDecisionConflict',
  /** Spec 164, achado 1: reentrega escolhida sobre política `blocked` da tratativa. */
  OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED: 'occurrenceCaseRedeliveryNotAllowed',
  OCCURRENCE_CASE_NOTE_REQUIRED: 'occurrenceCaseNoteRequired',
  /** Spec 237 T3.4a: o nome do tipo é único por empresa em qualquer etapa, e o tipo de recebimento não aparece nesta lista. */
  OCCURRENCE_TYPE_NAME_TAKEN: 'occurrenceTypeNameTaken',
  /** Spec 240 RF7: a correção e o cancelamento da ocorrência de nota (spec 167). */
  [OCCURRENCE_CORRECTION_ERROR.CASE_ALREADY_OPEN]: 'occurrenceCaseAlreadyOpen',
  [OCCURRENCE_CORRECTION_ERROR.ALREADY_CANCELLED]: 'occurrenceAlreadyCancelled',
  [OCCURRENCE_CORRECTION_ERROR.CANCELLED]: 'occurrenceCancelled',
  [OCCURRENCE_CORRECTION_ERROR.TYPE_SINGLE_ITEM]: 'occurrenceTypeSingleItem',
  /** Spec 241 RF6/RF11: tipo sem produtos recusa item e não abre tratativa. */
  [OCCURRENCE_CORRECTION_ERROR.TYPE_ITEMS_NOT_ALLOWED]: 'occurrenceTypeItemsNotAllowed',
  [OCCURRENCE_CORRECTION_ERROR.TYPE_ITEMS_OFF_REDELIVERY_POLICY]:
    'occurrenceTypeItemsOffRedeliveryPolicy',
  [OCCURRENCE_CORRECTION_ERROR.ITEM_QUANTITY_NOT_POSITIVE]: 'occurrenceItemQuantityNotPositive',
  [OCCURRENCE_CORRECTION_ERROR.ITEM_QUANTITY_UNIT_PAIRING]: 'occurrenceItemQuantityUnitPairing',
  [OCCURRENCE_CORRECTION_ERROR.PRODUCT_NOT_IN_DOCUMENT]: 'occurrenceProductNotInDocument',
  [OCCURRENCE_CORRECTION_ERROR.OCCURRENCE_NOT_FOUND]: 'occurrenceNotFound',
  [OCCURRENCE_CORRECTION_ERROR.CANCELLATION_REASON_REQUIRED]:
    'occurrenceCancellationReasonRequired',
  [OCCURRENCE_CORRECTION_ERROR.CANCELLATION_REASON_TOO_LONG]: 'occurrenceCancellationReasonTooLong',
  /** Spec 246 RF0/T1b.6: as três recusas do conjunto de momentos do tipo, cada uma com texto próprio. */
  [OCCURRENCE_TYPE_MOMENTS_ERROR.REQUIRED]: 'occurrenceTypeMomentsRequired',
  [OCCURRENCE_TYPE_MOMENTS_ERROR.DOCUMENT_AND_STOP]: 'occurrenceTypeMomentsDocumentAndStop',
  [OCCURRENCE_TYPE_MOMENTS_ERROR.STAGE_CONFLICT]: 'occurrenceTypeMomentsStageConflict',
  /** Spec 247 RF1: valor pago por linha em tipo sem produtos — a tela antecipa, o servidor é a rede de segurança. */
  [OCCURRENCE_TYPE_DECLARED_AMOUNT_ERROR.NEEDS_ITEMS]: 'occurrenceTypeDeclaredAmountNeedsItems',
  /** Spec 247 RF13: a correção com valor da ocorrência e de linha juntos — a tela não deixa, o servidor recusa. */
  [OCCURRENCE_CORRECTION_ERROR.DECLARED_AMOUNT_SELECTION_CONFLICT]:
    'declaredAmountSelectionConflict',
}

/** Spec 156 T6: `POST .../field-delivery` (T11 consome; T8 só mapeia o texto). */
export const FIELD_TRIP_STEP_RESULT_KEYS = ['changed', 'status'] as const
export const FIELD_REPORT_ID_RESULT_KEYS = ['id'] as const
/** Spec 156 T12: o envelope de `POST .../field-delivery` — ver `evidence.md` T6. */
export const REPORT_FIELD_DELIVERY_RESULT_KEYS = [
  'alreadySettled',
  'id',
  'proofId',
  'stopCompleted',
  'tripCompleted',
] as const

export const TRIP_KEYS = [
  /** Quem dirige: a listagem nomeia o motorista, e o UUID do veículo não dizia nem isso. */
  'driverNames',
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

/**
 * Spec 078 D2: o contato nasce opcional — API anterior serve o motorista sem ele.
 * `role` (spec 149/ADR-0065, papel na tripulação) chegou hoje sem entrar nesta lista, e toda
 * viagem virava `invalid()` na criação — 201 no servidor, "Não foi possível criar a viagem" na
 * tela (28/09/2026, staging).
 */
export const TRIP_DRIVER_OPTIONAL_KEYS = ['driverEmail', 'driverPhone', 'role'] as const

/** Cópia por valor de `TRIP_CREW_ROLES` — fonte: `api-transportada/src/shared/trip-crew-role.constant.ts`. */
export const TRIP_CREW_ROLES = ['driver', 'helper'] as const
export type TripCrewRole = (typeof TRIP_CREW_ROLES)[number]

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
  /**
   * Spec 164 T15 (RF21): a nota tem tratativa de ocorrência aberta. Opcional porque a API vai à
   * frente do bundle — e porque exigi-lo derrubaria a viagem inteira em instalação de API antiga,
   * que é exatamente a quebra que este campo causou em staging em 22/09 ao chegar sem estar aqui.
   */
  'openOccurrenceCase',
  /**
   * Spec 185 T6.1 (D1): ausente é API anterior ao campo — `dispatchReadiness.service.ts` trata
   * ausência como "não deixa a nota para trás", nunca como bloqueio de resposta.
   */
  'leavesBehindOnDispatch',
  /** Spec 223 RF4: ausente é API anterior ao campo — o selo só aparece com `true`. */
  'proofPending',
  'contact',
  'nfeIssuedAt',
  'nfeNumber',
  'nfeSeries',
  'nfeTotalValue',
  /** Spec 233 D5: ausente é API anterior ao campo; presente é inteiro ou `null`. */
  'volumeCount',
  /** Spec 176: mesmo motivo — API vai à frente do bundle, e ausente é API anterior à feature. */
  'freightAmount',
  'freightRuleName',
  'freightSource',
] as const

/** Spec 078 D2: campo novo nasce opcional até a API que o serve estar garantidamente no ar. */
export const TRIP_STOP_OPTIONAL_KEYS = [
  /** Spec 164 T15 (RF21): alguma nota desta parada tem tratativa aberta. Mesmo motivo do de cima. */
  'hasOpenOccurrence',
  'cityCode',
  'latitude',
  'longitude',
  'state',
] as const

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

/** Spec 078 D2: `amounts` nasce opcional — bundle novo com API antiga tem o campo ausente. */
/**
 * ⚠️ Spec 107 D3: os dois nascem opcionais como todo campo novo (spec 078 D2) — mas estar **na
 * lista** não é opcional: a validação recusa a viagem inteira por chave desconhecida, e a tabela de
 * viagens renderizaria vazia com 200 na rede e nada no console (o defeito de `VEHICLE_DETAIL_KEYS`).
 */
export const TRIP_OPTIONAL_KEYS = [
  'amounts',
  'estimatedArrivalFrozenAt',
  'estimatedFinishAt',
] as const

export const TRIP_AMOUNTS_KEYS = ['revenueSource'] as const

/**
 * Spec 153 T710: sem `trip.financials` a API redige `documentsTotal`/`revenueTotal` do corpo — a
 * chave **some**, nunca vira `null`/zero (D10). `hasExactKeys` sobre as três chaves reprovava a
 * resposta inteira, derrubando a listagem inteira do mesmo jeito que o C1/T701 derrubou a nota
 * fiscal. `revenueSource` continua obrigatória: ela não é dinheiro, é a origem do número.
 */
export const TRIP_AMOUNTS_OPTIONAL_KEYS = ['documentsTotal', 'revenueTotal'] as const

/**
 * ⚠️ **Cópia por valor da API**, como `FUEL_TYPES`: o bundle não carrega código do servidor. Fonte:
 * `api-transportada/src/trips/domain/trip-valuation.policy.ts` (`VALUATION_SOURCES`).
 */
export const TRIP_REVENUE_SOURCES = ['measured', 'estimated', 'missing', 'period'] as const

/** Spec 176: o frete **da nota**, mesmo vocabulário de `TRIP_REVENUE_SOURCES` sem `period` — não há período por nota. */
export const TRIP_DOCUMENT_FREIGHT_SOURCES = ['measured', 'estimated', 'missing'] as const

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
/**
 * ⚠️ O detalhe herda os opcionais da viagem, e não só os dele. `TRIP_DETAIL_KEYS` espalha
 * `TRIP_KEYS` mas parava aí: `amounts` — que a listagem já conhecia — chegava no detalhe como chave
 * desconhecida, e `hasKeys` recusa a resposta **inteira**. O efeito não era um campo faltando: era
 * a tela de detalhe inteira caindo em "Não foi possível carregar as viagens", levando junto as
 * notas, as paradas e o painel de carga. Campo novo da viagem entra numa lista só, e as duas telas
 * o aceitam.
 */
export const TRIP_DETAIL_OPTIONAL_KEYS = [
  ...TRIP_OPTIONAL_KEYS,
  /** Spec 156 T8d: nascem juntos — encerramento manual traz os três, derivação automática nenhum. */
  'closeReason',
  'closedAt',
  'closedByName',
  'cargoLayout',
  /** Spec 145 D17: aceito antes de a API servir (T10), para o detalhe não cair na janela de deploy. */
  'cargoLayoutState',
  /** Spec 148 T7: a planta do hash atual — é por ela que o botão tira as notas que não couberam. */
  'cargoLayoutId',
  /** Spec 147 D2/RF4: campo novo, nasce opcional como todo campo novo (spec 078 D2). */
  'capacityUnknownReason',
  /** T18 (revisão, item 10): campo novo, mesma regra do opcional acima. */
  'capacityUnknownVehicleId',
  'cargoWeight',
  'occupancy',
  /** Spec 147 D3/RF5: a carreta atrelada — campo novo, mesma regra do opcional acima. */
  'trailer',
] as const

export const TRIP_CARGO_LAYOUT_STATE_KEYS = [
  'computedAt',
  'errorCode',
  'stale',
  'status',
  'truncated',
] as const

/** Spec 145 T11: a resposta de `GET /trips/cargo-layouts/:layoutId`, chave por chave. */
export const TRIP_CARGO_LAYOUT_POLL_KEYS = ['cargoLayout', 'layoutId', 'state'] as const

export const TRIP_CARGO_LAYOUTS_PATH = `${TRIPS_PATH}/cargo-layouts`

/** Spec 148 T7: a fila de revisão das notas que não couberam — fora da árvore `/trips/:id`. */
export const TRIP_DOCUMENT_REVIEWS_PATH = '/trip-document-reviews'
export const TRIP_REVIEW_QUERY_KEY = 'trip-document-reviews'

/** Spec 147 D3/RF5: cópia por valor de `api-transportada/src/trips/application/trip.port.ts`. */
export const TRIP_TRAILER_KEYS = ['bodyType', 'id', 'plate'] as const

/**
 * ⚠️ Cópia por valor da API: fonte
 * `api-transportada/src/trips/domain/capacity-unknown-reason.policy.ts`.
 */
export const CAPACITY_UNKNOWN_REASONS = [
  'bodyTypeMissing',
  'referenceMissing',
  'trailerMissing',
] as const

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
  'occurrenceTypeId',
  'productCode',
  'stage',
  'typeName',
] as const

/**
 * Spec 156 T9 (D3, M1): quem registrou e em nome de quem — API na frente do bundle não pode apagar
 * a ocorrência inteira, então os três nascem opcionais aqui até a promoção decidida por escrito.
 */
export const TRIP_OCCURRENCE_OPTIONAL_KEYS = [
  'actorName',
  'channel',
  'onBehalfOfDriverName',
  /**
   * Spec 161 T6/T22/T24: nasce opcional aqui só para não derrubar o parse do registro
   * (RF29/RF31) — as fotos gravadas, no formato completo de RF8 (T24).
   */
  'attachments',
  /**
   * Os itens da nota apontados pela ocorrência. Opcional porque a API vai à frente do bundle, e
   * porque a resposta antiga só tem `productCode`; lista vazia é a nota inteira.
   */
  'productCodes',
  /**
   * Spec 166 RF6: os itens **com quantidade** (`{ code, quantity, unit }`). Entra opcional aqui
   * antes de a API mandá-lo, e a ordem não é zelo: a lista é fechada, então chave desconhecida
   * derruba a resposta inteira — 201 gravado, tela dizendo que falhou (medido em 22/09).
   */
  'products',
  /**
   * Spec 167 RF9: o histórico da ocorrência. `corrections` guarda o conjunto que valia **antes** de
   * cada correção; `cancellation` é o cancelamento com motivo e autor, ou `null`. Opcionais aqui
   * antes de a API mandá-las, pela mesma razão de `products`.
   */
  'corrections',
  'cancellation',
  /**
   * Spec 241 RF5: o que o tipo **atual** diz sobre itens. Ausente é API anterior ao campo e lê
   * `optional`/`true` (o comportamento de hoje); `occurrenceTypeId` já é obrigatório aqui.
   */
  'typeAllowsMultipleItems',
  'typeItemsMode',
] as const

/**
 * Spec 166 RF1: o par de fallback — peça solta ou volume fechado — para quando o item não trouxe
 * unidade comercial da nota (spec 172 RF3).
 */
export const OCCURRENCE_QUANTITY_UNITS = ['box', 'unit'] as const
export type OccurrenceFallbackQuantityUnit = (typeof OCCURRENCE_QUANTITY_UNITS)[number]

/**
 * Spec 172 (RF1/RF2): a unidade real é **aberta** — a unidade comercial que o item traz da nota
 * (`KG`, `L`, `CX`...), mais o par de fallback acima. Fechar num union faria toda sigla de XML
 * virar erro de tipo; a API é quem confere o valor contra o item, não o tipo.
 */
export type OccurrenceQuantityUnit = string

/** Spec 161 T24 (RF8): campos sempre presentes no anexo. */
export const TRIP_OCCURRENCE_ATTACHMENT_KEYS = ['expired', 'id', 'mimeType', 'position'] as const

/** Spec 161 T24 (RF8): ausentes quando não há URL a oferecer — miniatura sem gerar, ou anexo
 * expirado (D11, sem nenhuma das duas). */
export const TRIP_OCCURRENCE_ATTACHMENT_OPTIONAL_KEYS = [
  'downloadUrl',
  'expiresAt',
  'thumbnailUrl',
] as const

/** Spec 156 T9: `POST /trips/:id/documents/field-occurrences` lista os tipos de rua do escritório. */
export const FIELD_OCCURRENCE_TYPE_KEYS = ['id', 'name'] as const

/**
 * Spec 179 T304: `attachmentMode` é aditivo — ausente é API anterior ao campo, e esta tela ainda
 * não usa o valor (quem decide se a observação é obrigatória hoje é a app do motorista).
 */
export const FIELD_OCCURRENCE_TYPE_OPTIONAL_KEYS = [
  'attachmentMode',
  /** Spec 247 TP.1 (ADR-0081 §9): os requisitos efetivos da devolução. */
  'declaredAmountLabel',
  'declaredAmountMode',
  'declaredAmountScope',
  /** Spec 246 (ADR-0081 §9, painel antes da API): os modos resolvidos da nota e os mínimos. */
  'flow',
  'itemsMinimumCount',
  'itemsMode',
  'noteMode',
  'photoMinimumCount',
  'photoMode',
  'referenceNumberLabel',
  'referenceNumberMode',
  'signatureMode',
  'stopKind',
] as const

export const TRIP_FIELD_OCCURRENCE_TYPES_PATH = `${TRIPS_PATH}/occurrence-types/field`

/**
 * Spec 158 D6: `GET /trips/:id/timeline` — todo campo nasce sempre presente (nulo, quando falta).
 * `location`/`locationState` entraram aqui na spec 196 T6.4: as três consultas da API as mandam em
 * todo item, e o toque que nunca carimbou sai com `NO_EVENT_LOCATION`, não com a chave ausente.
 */
export const TRIP_TIMELINE_ITEM_KEYS = [
  'actorName',
  'channel',
  'closeReason',
  'document',
  'fromStatus',
  'id',
  'kind',
  'location',
  'locationState',
  'occurrence',
  'occurredAt',
  'onBehalfOfDriverName',
  'recordedAt',
  'returnReason',
  'stop',
  'toStatus',
] as const

/**
 * Spec 205 RF8: o registro tardio do motorista, só como dado. Opcional porque a API anterior ao campo
 * não o manda — a chave exata recusaria a página inteira na janela entre as duas subidas.
 */
export const TRIP_TIMELINE_ITEM_OPTIONAL_KEYS = [
  'addressChange',
  'crewTransfer',
  'lateRegistration',
] as const

/** Spec 249 D6: `costDifference` é a única opcional — a rota a tira de quem não tem `trip.financials`. */
export const TRIP_TIMELINE_CREW_TRANSFER_REQUIRED_KEYS = [
  'mdfeDriverDivergence',
  'nextCrew',
  'previousCrew',
  'reason',
] as const
export const TRIP_TIMELINE_CREW_TRANSFER_ALLOWED_KEYS = [
  ...TRIP_TIMELINE_CREW_TRANSFER_REQUIRED_KEYS,
  'costDifference',
] as const
export const TRIP_TIMELINE_CREW_MEMBER_KEYS = ['driverId', 'name', 'position', 'role'] as const

/** Spec 228 D8: as duas chaves exatas do `addressChange`; metros, nunca endereço. */
export const TRIP_TIMELINE_ADDRESS_CHANGE_KEYS = ['displacementMeters', 'origin'] as const

/** Spec 196 RF9: o ponto onde o toque aconteceu; a precisão é nula quando o aparelho não a informou. */
export const TRIP_TIMELINE_LOCATION_KEYS = [
  'accuracyMeters',
  'capturedAt',
  'distanceMeters',
  'latitude',
  'longitude',
] as const

/** Casas decimais da coordenada impressa no tooltip — cinco dão ~1 m, o que a precisão do GPS sustenta. */
export const TRIP_TIMELINE_LOCATION_COORDINATE_DIGITS = 5
export const TRIP_TIMELINE_LOCATION_LINE_SEPARATOR = ' · '
/**
 * Spec 196: a distância do toque até o ponto da parada saía em metro cru, e `a 208255 m do ponto`
 * não é um número que alguém leia. Abaixo de um quilômetro o metro é a unidade da quadra; entre um
 * e dez, a casa decimal ainda separa 1,2 de 1,9; acima disso ela é ruído sobre uma leitura de GPS.
 */
export const TRIP_TIMELINE_METERS_PER_KILOMETER = 1000
export const TRIP_TIMELINE_DISTANCE_KILOMETER_THRESHOLD_METERS = 1000
export const TRIP_TIMELINE_DISTANCE_COARSE_KILOMETER_THRESHOLD_METERS = 10000
export const TRIP_TIMELINE_DISTANCE_PRECISE_FRACTION_DIGITS = 1
export const TRIP_TIMELINE_DISTANCE_COARSE_FRACTION_DIGITS = 0
/**
 * Chave de cor do pino do evento, **lida só dentro do `TripTimelineLocationMap`** — o mapa
 * compartilhado não interpreta mais número fora de faixa, ele recebe `isUnnumbered`. A cor em si é
 * `EVENT_PIN_COLOR`, em `stopColor.service.ts`, onde a janela de luminância é medida.
 */
export const TRIP_TIMELINE_LOCATION_EVENT_PIN_SEQUENCE = 0
export const TRIP_TIMELINE_LOCATION_EVENT_PIN_KEY = 'timeline-event-location'

export const TRIP_TIMELINE_STOP_REFERENCE_KEYS = ['id', 'sequence'] as const
export const TRIP_TIMELINE_DOCUMENT_REFERENCE_KEYS = ['id', 'number', 'series'] as const
export const TRIP_TIMELINE_OCCURRENCE_REFERENCE_KEYS = ['note', 'typeName'] as const
/** Spec 161 T24 (RF12): a contagem só existe quando a ocorrência tem foto; spec 240: `cancellation` vem sempre da API atual. */
export const TRIP_TIMELINE_OCCURRENCE_REFERENCE_OPTIONAL_KEYS = [
  'attachmentCount',
  'cancellation',
] as const

export const TRIP_TIMELINE_DEFAULT_LIMIT = 100

export const TRIP_DOCUMENT_PRODUCT_KEYS = [
  'code',
  'commercialUnit',
  'description',
  'ordinal',
  'quantity',
  'totalValue',
  'unitValue',
] as const

/**
 * Spec 193 D1: quem recebeu, em relação ao destinatário — cópia por valor de `RECEIVED_BY_OPTIONS`
 * da API (`src/database/trip.schema.ts`), na mesma ordem.
 */
export const DELIVERY_PROOF_RECEIVED_BY_OPTIONS = [
  'recipient',
  'spouse',
  'child',
  'parent',
  'sibling',
  'other_relative',
  'neighbor',
  'doorman',
  'employee',
  'other',
] as const

/**
 * Spec 193 T3.1 (R1): chaves que a API passa a mandar no comprovante. Opcionais porque a API
 * anterior não as manda — e o painel tem de aceitá-las antes de a API mandá-las.
 */
export const DELIVERY_PROOF_RECEIVED_BY_KEYS = ['receivedBy', 'receivedByDetail'] as const

export const DELIVERY_PROOF_KEYS = [
  'createdAt',
  'downloadUrl',
  'expiresAt',
  'id',
  'kind',
  'receiverName',
] as const

/**
 * Spec 205 RF8: `lateRegistration` é o registro tardio, só como dado. `receiverDocument` (sempre a
 * máscara) já saía da API desde a spec 082 e a chave exata recusava a lista inteira por ele.
 */
export const DELIVERY_PROOF_OPTIONAL_KEYS = [
  'canhotoReadNumber',
  'canhotoReadSeries',
  'canhotoReadSource',
  'canhotoReview',
  'canhotoReviewAt',
  'canhotoReviewByName',
  'canhotoReviewNote',
  'canhotoReviewOrigin',
  'canhotoReviewReason',
  'capturedAt',
  'distanceMeters',
  'lateRegistration',
  'proofRadiusMeters',
  'punctuality',
  'receiverDocument',
  'thumbnailUrl',
] as const

/**
 * Spec 220 RF16: veredito de pontualidade da captura. ⚠️ Só o texto derivado da distância chega
 * ao painel — a coordenada nunca sai da API.
 */
export const DELIVERY_PROOF_PUNCTUALITY_OPTIONS = [
  'on_time',
  'late',
  'away',
  'late_and_away',
  'not_required',
] as const

/**
 * Spec 220 RF24: vocabulário da conferência do canhoto. ⚠️ `canhotoReview` não aceita
 * `not_applicable`: a API omite o bloco inteiro nesse estado, e aceitá-lo aqui esconderia um
 * servidor fora do contrato.
 */
export const DELIVERY_PROOF_CANHOTO_REVIEW_OPTIONS = ['pending', 'approved', 'rejected'] as const
export const DELIVERY_PROOF_CANHOTO_REVIEW_ORIGIN_OPTIONS = ['automatic', 'manual'] as const
export const DELIVERY_PROOF_CANHOTO_READ_SOURCE_OPTIONS = ['barcode', 'ocr'] as const
export const DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS = [
  'illegible',
  'wrong_document',
  'missing_signature',
  'other',
] as const

export const TRIP_CARGO_WEIGHT_KEYS = [
  'documentsWithoutWeight',
  'grossWeightKilograms',
  /**
   * ⚠️ Spec 093: chave nova em lista validada por `hasExactKeys` — **a API sobe antes do
   * frontend**. Com a API servindo o corpo antigo, toda prévia de carga é recusada na validação e o
   * painel some com 200 na rede e nada no console, que é o mesmo defeito já registrado em
   * `VEHICLE_DETAIL_KEYS`.
   */
  'maxPayloadKg',
  'payloadRatio',
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
/** Spec 185 T6.1 (RF2/RF3): presente só quando a escrita fechou a carga. */
export const TRANSITION_RESULT_OPTIONAL_KEYS = ['autoDispatch'] as const

export const TRIP_STATUS_RESULT_KEYS = ['tripStatus'] as const

export const BATCH_STATUS_RESULT_KEYS = ['items', 'tripStatus'] as const
/** Spec 185 T6.1 (RF2/RF3): presente só quando o lote fechou a carga. */
export const BATCH_STATUS_RESULT_OPTIONAL_KEYS = ['autoDispatch'] as const

/**
 * Spec 057 P2: o intervalo em que a tela do escritório repete a consulta enquanto a viagem está na
 * rua. Meio minuto é o que separa "acompanhar" de "ficar batendo no servidor".
 */
export const TRIP_ON_THE_ROAD_REFETCH_MS = 30_000

/** Spec 145 D10: enquanto a planta está `pending`, a tela pergunta de novo a cada 3 s. */
export const CARGO_LAYOUT_REFETCH_MS = 3_000

/** Spec 145 D16: acima da escada da D13 (120 + 240 + 480 s) + 2 retries de 30 s ≈ 15,5 min; passado, para. */
export const CARGO_LAYOUT_POLL_CEILING_MS = 1_080_000

/** Passada essa espera, o selo avisa que viagem grande leva minutos — antes disso seria alarme à toa. */
export const CARGO_LAYOUT_SLOW_NOTICE_MS = 120_000

/**
 * As fases em que o motorista está reportando — as mesmas de `TRIP_ON_ROAD_STATUSES` da API. Fora
 * delas não há o que atualizar sozinho. `on_delivery_route` entra desde a spec 156: a primeira nota
 * fechada leva a viagem para lá (ADR-0058 §3), e o resto das entregas acontece nessa fase.
 */
const TRIP_ON_THE_ROAD_STATUSES: ReadonlySet<string> = new Set([
  'dispatched',
  'in_transit',
  'on_delivery_route',
])

export function isTripOnTheRoad(status: string | undefined): boolean {
  return status !== undefined && TRIP_ON_THE_ROAD_STATUSES.has(status)
}

/** Spec 145 T13 (D4): quanto dura o deslize da planta anterior para a nova — o CSS usa o mesmo. */
export const CARGO_LAYOUT_TRANSITION_MS = 600

/** Spec 145 T13: acima disto a planta nova entra sem deslize — cada quadro reprojeta a carga inteira. */
export const CARGO_LAYOUT_TRANSITION_MAX_BOXES = 800
