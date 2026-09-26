/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 057 P1 e spec 156 T6/T15: o contrato da baixa de uma nota ("entreguei" / "não entreguei"),
 * igual para o motorista (`{ driverId }`) e para o escritório (`{ target }`).
 */
import type {
  DELIVERED_EVENT_KIND,
  RETURNED_EVENT_KIND,
} from '../domain/delivery-event.constant.js'
import type { DeliveryProofFieldSettings } from '../domain/delivery-proof-settings.policy.js'
import type { DriverReturnReason } from '../domain/driver-return-reason.policy.js'
import type { TripDocumentAction } from '../domain/trip-state.policy.js'
import type {
  DriverDocumentReference,
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  ReportedLocation,
} from './driver-field-report.port.js'
import type { FieldAuthorship, FieldTripLocator } from './field-trip-target.types.js'
import type {
  OfficeDeliveryProofAttachment,
  OfficeDeliveryProofUpload,
} from './office-delivery-proof.service.js'
import type { RemovableObjectStoragePort } from './stored-object-cleanup.service.js'
import type { OfficeAuditRequest } from './trip-field-office-audit.port.js'

export type ProofSettingsResolver = (input: {
  readonly companyId: string
  readonly documentId: string
}) => Promise<DeliveryProofFieldSettings>

export type ReportDocumentOutcomeInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly idempotencyKey: string
  /**
   * Spec 205 RF4: a baixa veio pelo "Registrar entrega depois" da app do motorista. Só as rotas
   * `/me` mandam; ausente é `false`. O replay nunca o reescreve (D5): o evento já gravado responde.
   */
  readonly lateRegistration?: boolean
  readonly location: ReportedLocation | null
  /** Quando aconteceu. O motorista manda agora; o escritório, a hora informada (ADR-0067 §3). */
  readonly now: Date
  /** Spec 156 T15 M11: só o escritório manda — a trilha nasce na transação da baixa. */
  readonly officeAudit?: OfficeAuditRequest
  /** ADR-0067 §3: quando o registro foi gravado. Ausente cai em `now` — é o caso do motorista. */
  readonly recordedAt?: Date
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

/** Spec 156 T6: o canhoto que o escritório sobe junto com a entrega — `null` quando não veio. */
export type OfficeDeliveryProofInput = OfficeDeliveryProofAttachment & {
  readonly upload: OfficeDeliveryProofUpload | null
}

export type ReportDocumentDeliveryInput = ReportDocumentOutcomeInput & {
  /** Spec 156 T6: só o canal `office` manda isto — o motorista anexa depois, por rota própria. */
  readonly proof?: OfficeDeliveryProofInput
  /**
   * ADR-0070 §1, spec 159 RF1/RF2: a configuração resolvida da nota — usada só para saber se a
   * foto é obrigatória (`proofPending`), não para gravar nada. Opcional para não quebrar chamador
   * que não precisa de `proofPending` — sem ela, o campo sai sempre `false`.
   */
  readonly resolveProofSettings?: ProofSettingsResolver
}

export type ReportDocumentReturnInput = ReportDocumentOutcomeInput & {
  readonly reason: DriverReturnReason
}

export type ReportDocumentOutcomeResult = {
  /**
   * A nota já estava onde o toque queria pôr — o escritório resolveu, ou foi um segundo toque. Não
   * é conflito: é a idempotência que a 056 já decidiu (`trip-state.policy.ts`, portão 1).
   */
  readonly alreadySettled: boolean
  readonly id: string
  /** `null` quando não veio comprovante (motorista, ou escritório sem foto obrigatória). */
  readonly proofId: string | null
  /**
   * ADR-0070 §1, spec 159 RF1/RF2: a entrega **nunca** é recusada por falta de foto — este campo
   * diz que ela ainda não chegou, para a tela avisar sem bloquear. Sempre `false` num `return`.
   */
  readonly proofPending: boolean
  /** Para a tela do motorista saber que a parada fechou sem precisar recarregar a viagem inteira. */
  readonly stopCompleted: boolean
  readonly tripCompleted: boolean
}

/** O que diferencia entregar de devolver — o resto da baixa é o mesmo caminho. */
export type DocumentOutcomeParams = {
  readonly action: TripDocumentAction
  readonly input: ReportDocumentOutcomeInput
  readonly kind: typeof DELIVERED_EVENT_KIND | typeof RETURNED_EVENT_KIND
  readonly operation: string
  /** Spec 156 T6: só a entrega do escritório manda isto. */
  readonly proof?: OfficeDeliveryProofInput
  /** ADR-0070 §1, spec 159: só `document.deliver` a usa — `document.return` nunca fica pendente. */
  readonly resolveProofSettings?: ProofSettingsResolver
  readonly settle: (
    transaction: DriverFieldReportTransactionPort,
    documentId: string,
  ) => Promise<void>
}

/** A configuração lida **antes** da transação (spec 159 T11 item 5). */
export type DocumentOutcomeSettings = {
  /** Só com canhoto do escritório. */
  readonly officeSettings: DeliveryProofFieldSettings | undefined
  /** Só numa entrega com `resolveProofSettings`. */
  readonly pendingSettings: DeliveryProofFieldSettings | undefined
}

/** O que cada passo da baixa recebe, dentro da transação (`document-outcome.service.ts`). */
export type OutcomeContext = {
  readonly authorship: FieldAuthorship
  readonly isOffice: boolean
  readonly params: DocumentOutcomeParams
  readonly settings: DocumentOutcomeSettings
  /** A storage rastreada pela limpeza de órfãos; `undefined` sem canhoto. */
  readonly storage: RemovableObjectStoragePort | undefined
  readonly transaction: DriverFieldReportTransactionPort
}

/** A nota alcançável, com parada — sem parada ela não tem como ser baixada. */
export type ReachableDocument = DriverDocumentReference & { readonly stopId: string }
