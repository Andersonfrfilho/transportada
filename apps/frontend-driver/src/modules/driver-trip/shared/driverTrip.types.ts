/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/driverTrip.types.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve em `/me/trips/current` — o bundle não carrega código de lá. */
export type DriverTripDocument = Readonly<{
  accessKey: string
  deliveredAt: string | null
  /**
   * Spec 082 (revisão): a configuração do comprovante é do **documento** — a exceção muda nota a
   * nota. `null` quando o snapshot ainda não traz o campo — o app cai no `deliveryProof` da parada
   * (o shape antigo, não uma camada de exceção) e, na ausência dos dois, no padrão.
   *
   * Spec 218 (RF-C3): chega **já resolvida** pelo servidor em três camadas (geral → contratante →
   * destinatário, a mais específica vencendo) a cada `GET /me/trips/current`. O app só lê: nenhuma
   * regra de precedência mora aqui.
   */
  deliveryProof: DriverDeliveryProofSettings | null
  grossWeight: string
  id: string
  number: string
  /**
   * Spec 218 RF-B2 (follow-up): os tipos de ocorrência de nota (`flow: 'document'`), já resolvidos
   * em 3 camadas para **este** documento — mesma regra de `deliveryProof` acima. `null` quando o
   * snapshot ainda não traz o campo (cache antigo) ou a resolução falhou no servidor: a tela cai na
   * lista geral da viagem (sem exceção), o mesmo espírito de `deliveryProof` acima.
   */
  occurrenceTypes: readonly DriverOccurrenceType[] | null
  /** Spec 159 RF1/RF2: foto obrigatória (`deliveryProof.photo === 'required'`) que ainda não chegou. */
  proofPending: boolean
  /**
   * Spec 193 D14: como o destinatário é chamado — nome fantasia, senão razão social. É o que "O
   * próprio cliente recebeu" preenche no nome. Ausente (API anterior) vira vazio.
   */
  recipientDisplayName: string
  /**
   * Spec 193 D14: PF ou PJ, pelo tamanho do documento — nunca o documento em si. Decide se "O
   * próprio cliente recebeu" seleciona o nome preenchido (PJ) ou só o deixa no campo (PF). Ausente
   * vira `false`.
   */
  recipientIsCompany: boolean
  recipientName: string
  returnReason: string | null
  separationStatus: string
  series: string
  totalAmount: string
  volumeCount: string
}>

/**
 * Spec 060 D3: a hora marcada e o protocolo. O porteiro pede o número, e um agendamento que o
 * sistema conhece e o motorista não é um agendamento que não existe.
 */
export type DriverStopSchedule = Readonly<{
  protocol: string
  scheduledAt: string | null
  status: string
}>

/** Spec 082 D4: o painel decide o que o comprovante colhe — por empresa, com exceção por CNPJ. */
export const PROOF_FIELD_REQUIREMENTS = ['off', 'optional', 'required'] as const
export type ProofFieldRequirement = (typeof PROOF_FIELD_REQUIREMENTS)[number]

export type DriverDeliveryProofSettings = Readonly<{
  /** Spec 220: a foto da mercadoria, distinta do canhoto (`photo`). Ausente (API anterior) vale `off`. */
  cargo: ProofFieldRequirement
  /** Spec 220 RF06: lido só quando `cargo` é `required`. */
  cargoMinimumCount: number
  photo: ProofFieldRequirement
  /** Spec 193 D6: quem recebeu, resolvido por nota. Ausente (API anterior) vale `optional`. */
  receivedBy: ProofFieldRequirement
  receiverDocument: ProofFieldRequirement
  receiverName: ProofFieldRequirement
  signature: ProofFieldRequirement
}>

export type DriverTripStop = Readonly<{
  arrivedAt: string | null
  completedAt: string | null
  /** `null` quando o snapshot ainda não traz configuração — o app aplica o padrão. */
  deliveryProof: DriverDeliveryProofSettings | null
  deliveryWindowEnd: string | null
  deliveryWindowStart: string | null
  documents: readonly DriverTripDocument[]
  /**
   * Spec 206 D9: a hora em que o SERVIDOR processou o "Iniciar rota" desta parada — `null` enquanto
   * nenhuma está a caminho. A **ausência da chave** (API antiga, spec 206 D17) é outra coisa: o
   * validador marca isso em `isLegacyEnRouteTracking`, nunca aqui. Opcional para não quebrar toda
   * fixture de teste existente que monta `DriverTripStop` à mão — ausente equivale a `null`.
   */
  enRouteSince?: string | null
  /** Spec 206 D9: a hora do TOQUE no aparelho — a 207 usa como âncora, com `enRouteSince` de reserva. */
  enRouteTappedAt?: string | null
  id: string
  label: string
  latitude: string | null
  longitude: string | null
  /** `null` quando a parada não exige agendamento — o caso da maioria. */
  schedule: DriverStopSchedule | null
  sequence: number
}>

/** `null` até o MDF-e autorizar — e nesse intervalo o que o motorista tem na mão é o romaneio. */
export type DriverTripManifest = Readonly<{
  accessKey: string
  authorizedAt: string | null
  id: string
  protocol: string
}>

/** Spec 239 D4: o papel de quem lê na viagem — `helper` acompanha, só `driver` reporta. */
export const TRIP_CREW_ROLES = ['driver', 'helper'] as const
export type TripCrewRole = (typeof TRIP_CREW_ROLES)[number]

export type DriverTrip = Readonly<{
  /**
   * Spec 239 D4: opcional porque o snapshot guardado no aparelho antes do campo existir não o traz —
   * ausente equivale a `driver` (`resolveTripCrewRole`).
   */
  crewRole?: TripCrewRole
  id: string
  /**
   * Spec 206 D17: `true` quando o snapshot não trouxe `enRouteSince`/`enRouteTappedAt` em NENHUMA
   * parada — API antiga. Nesse caso "Cheguei" segue como antes (sem a trava da D6), e "Iniciar
   * rota" não aparece: só o servidor sabe que a viagem está `on_delivery_route`. Opcional pelo mesmo
   * motivo do par acima — ausente equivale a `false` (API nova, sem nenhuma parada a caminho).
   */
  isLegacyEnRouteTracking?: boolean
  manifest: DriverTripManifest | null
  status: string
  stops: readonly DriverTripStop[]
  /** Quando a viagem foi aberta. Vazio em snapshot antigo: a tela omite a linha. */
  createdAt: string
  vehiclePlate: string
}>

/**
 * Spec 220 RF28: a lista fechada de motivos de recusa do canhoto, a mesma do banco. Motivo que não
 * está aqui é API mais nova do que este app — a pendência vale, a explicação não se inventa.
 */
export const CANHOTO_REJECTION_REASONS = [
  'illegible',
  'missing_signature',
  'other',
  'wrong_document',
] as const

export type CanhotoRejectionReason = (typeof CANHOTO_REJECTION_REASONS)[number]

/**
 * Spec 220 RF29: por que a nota voltou para a fila. `note` só vem em `other`, onde o motivo da lista
 * não basta — nos demais o texto da tela já diz tudo.
 */
export type CanhotoRejection = Readonly<{
  note: string | null
  reason: CanhotoRejectionReason
}>

/**
 * Spec 159 (T11, revisão): a foto pendente **na raiz** do snapshot — sai daqui mesmo sem viagem
 * ativa, porque a nota entregue pode ser de uma viagem já `completed`. É esta lista, não mais o
 * percurso por `trips`, que alimenta a tela "Fotos pendentes" e o contador do workspace.
 */
export type PendingProofDocument = Readonly<{
  /** Spec 220 RF29: `null` quando a nota nunca teve canhoto — só a recusa preenche. */
  canhotoRejection: CanhotoRejection | null
  deliveredAt: string | null
  deliveryProof: DriverDeliveryProofSettings | null
  documentId: string
  documentNumber: string
  documentSeries: string
  /** Spec 193 D14: a mesma de `DriverTripDocument.recipientDisplayName` ("Fotos pendentes"). */
  recipientDisplayName: string
  /** Spec 193 D14: a mesma de `DriverTripDocument.recipientIsCompany` ("Fotos pendentes"). */
  recipientIsCompany: boolean
  recipientName: string
  tripId: string
  tripStatus: string
}>

export type DriverTripSnapshot = Readonly<{
  isRegisteredDriver: boolean
  /** Spec 159 (T11): toda nota entregue com foto obrigatória ainda sem foto, de qualquer viagem. */
  pendingProofs: readonly PendingProofDocument[]
  /** Spec 159 RF2/RF9, ADR-0070 §5: a nota do próprio motorista — `null` sem histórico em 90 dias. */
  score: number | null
  trips: readonly DriverTrip[]
}>

/**
 * ⚠️ Cópia por valor de `ProofPunctuality` (`delivery-proof-punctuality.policy.ts`, ADR-0070 §3-4).
 * `not_required` nunca aparece na resposta de `/proof` para foto obrigatória; ela existe do lado da
 * API para nota sem exigência — o app não recebe esse valor nesta rota.
 */
export const PROOF_PUNCTUALITY_VALUES = [
  'not_required',
  'on_time',
  'late',
  'away',
  'late_and_away',
] as const
export type ProofPunctuality = (typeof PROOF_PUNCTUALITY_VALUES)[number]

/** ⚠️ Cópia por valor de `driver-return-reason.policy.ts`; a paridade é assertada por contrato. */
export const DRIVER_RETURN_REASONS = [
  'recipient_absent',
  'recipient_refused',
  'address_not_found',
  'damaged_goods',
  'establishment_closed',
] as const
export type DriverReturnReason = (typeof DRIVER_RETURN_REASONS)[number]

/**
 * ⚠️ Cópia por valor de `TRIP_STOP_OCCURRENCE_KINDS`.
 *
 * **Só o que é da parada.** Três valores saíram em 2026-09-03 — `damaged_goods` e
 * `address_not_found` são da nota e já são motivo de devolução; `customer_closed` era
 * `establishment_closed` com outro nome. Eram duas portas para o mesmo fato na mesma tela.
 */
export const DRIVER_OCCURRENCE_KINDS = [
  'unexpected_charge',
  'long_wait',
  'dock_closed',
  'appointment_required',
  'other',
] as const
export type DriverOccurrenceKind = (typeof DRIVER_OCCURRENCE_KINDS)[number]

export type DriverReportedLocation = Readonly<{
  accuracyMeters?: number
  capturedAt: string
  latitude: number
  longitude: number
}>

/**
 * Spec 218 D2: a ocorrência de parada vai com o tipo do catálogo (`occurrenceTypeId`). O item
 * gravado na fila antes da troca guarda só o valor fixo (`occurrenceKind`) — e sai com ele.
 */
export type StopOccurrenceReportReference =
  | Readonly<{ occurrenceKind: DriverOccurrenceKind; occurrenceTypeId?: undefined }>
  | Readonly<{ occurrenceKind?: undefined; occurrenceTypeId: string }>

/**
 * O que o aparelho enfileira. Cada item carrega a **chave gerada no cliente**: é ela que o servidor
 * usa para não duplicar quando a fila drena (ADR-0045 §5).
 */
export type DriverFieldReport =
  | Readonly<{
      idempotencyKey: string
      kind: 'arrive'
      location: DriverReportedLocation | null
      stopId: string
    }>
  /**
   * Spec 206 D1/D2: "Iniciar rota" da PARADA — substitui o antigo botão da viagem (D10). A hora do
   * toque (`tappedAt`) é o que o servidor usa para decidir quem chegou primeiro entre toques
   * concorrentes (D3); a data nasce no toque, nunca no envio.
   */
  | Readonly<{
      idempotencyKey: string
      kind: 'depart'
      location: DriverReportedLocation | null
      stopId: string
      tappedAt: string
    }>
  /**
   * Spec 230: "Despachar viagem" vai pela fila como qualquer toque de campo — sem sinal fica como
   * pendência de envio e sobe sozinho (ou pelo envio manual). O servidor trata o despacho repetido
   * como `unchanged`, então reenviar é seguro. O ponto (spec 196) entra depois, pela chave.
   */
  | Readonly<{
      idempotencyKey: string
      kind: 'dispatch'
      location: DriverReportedLocation | null
      tripId: string
    }>
  /** Spec 206 D18: desfaz o "Iniciar rota" desta parada, a qualquer momento antes do "Cheguei". */
  | Readonly<{
      idempotencyKey: string
      kind: 'cancelDeparture'
      location: DriverReportedLocation | null
      stopId: string
      tappedAt: string
    }>
  | Readonly<{
      documentId: string
      idempotencyKey: string
      kind: 'deliver'
      /** Pedido do usuário (25/09): "Registrar entrega depois" — parada sem "Cheguei" confirmado. */
      lateRegistration?: boolean
      location: DriverReportedLocation | null
    }>
  | Readonly<{
      documentId: string
      idempotencyKey: string
      kind: 'return'
      /** Pedido do usuário (25/09): mesma marca do `deliver`, carregada pela devolução. */
      lateRegistration?: boolean
      location: DriverReportedLocation | null
      reason: DriverReturnReason
    }>
  | (Readonly<{
      description: string
      documentId: string | null
      idempotencyKey: string
      kind: 'occurrence'
      location: DriverReportedLocation | null
      stopId: string
    }> &
      StopOccurrenceReportReference)
  /**
   * Spec 179 (T303): a ocorrência da nota com a foto junto. O `send` sobe a foto por URL assinada,
   * confirma e só então faz o `POST` com `attachmentObjectId` — a API recusa tipo `required` sem
   * anexo, e anexo que chegasse depois do evento daria `422`.
   */
  | Readonly<{
      documentId: string
      idempotencyKey: string
      kind: 'documentOccurrence'
      location: DriverReportedLocation | null
      note: string
      occurrenceTypeId: string
      /** Só para a tela de pendentes: quem decide pelo id é o servidor. */
      occurrenceTypeName: string
      photo: DriverOccurrencePhoto | null
      /** Vazio é a nota inteira. */
      productCode: string
    }>
  /**
   * Spec 209 (D2): a foto do "Deu problema", **atrás** da ocorrência de parada e nunca junto dela —
   * a ocorrência não espera a foto. O `send` sobe a foto pela rota da parada e reenvia a ocorrência
   * com a chave **dela** (`occurrenceKey`) e o `attachmentObjectId`: a API completa o anexo uma vez.
   * O corpo repete o da ocorrência porque o reenvio, se a ocorrência nunca chegou, a cria com a foto.
   */
  | (Readonly<{
      description: string
      documentId: string | null
      idempotencyKey: string
      kind: 'stopOccurrencePhoto'
      occurrenceKey: string
      photo: DriverOccurrencePhoto
      stopId: string
    }> &
      StopOccurrenceReportReference)
  /**
   * Spec 193 D7: quem recebeu, chegado depois do anexo — anexo já enviado, ou editado durante o
   * envio (comparação no `sent`). Vira `PATCH .../documents/:documentId/proof/receiver`, idempotente
   * pela chave do toque. `null` em qualquer campo apaga o que estava gravado.
   */
  | Readonly<{
      documentId: string
      fields: Readonly<{
        receivedBy?: string | null
        receivedByDetail?: string | null
        receiverName?: string | null
      }>
      idempotencyKey: string
      kind: 'proofReceiver'
    }>

/** A foto já reencodada (JPEG, sem EXIF) — o `Blob` vai inteiro para o IndexedDB. */
export type DriverOccurrencePhoto = Readonly<{ blob: Blob; fileName: string }>

/**
 * Spec 079: o tipo de ocorrência que a empresa cadastrou, como o motorista o vê.
 *
 * ⚠️ A lista **vem do servidor**: ela deixou de ser cópia por valor quando os tipos viraram
 * cadastro. O motorista só enxerga os de `delivery` ativos — o galpão não é dele —, e o filtro é
 * do servidor (spec 157): a rota `/me/trips/current/occurrence-types` devolve `id` e `name`.
 */
export type DriverOccurrenceType = Readonly<{
  /**
   * Spec 179: a exigência de comprovante do tipo. Opcional porque a rota do motorista ainda não o
   * devolve — ausente, a tela não antecipa a observação obrigatória, e quem decide é o servidor.
   */
  attachmentMode?: ProofFieldRequirement
  /**
   * Spec 218 (D1): para qual das duas rotas o registro vai — nota (`document`) ou parada (`stop`).
   * Ausente é a cópia guardada antes da spec, quando todo tipo era de nota.
   */
  flow?: DriverOccurrenceFlow
  id: string
  name: string
  /** Spec 218 D2: qual dos valores fixos o tipo de parada representa — escolhe a prévia do aviso. */
  stopKind?: DriverOccurrenceKind | null
}>

/** ⚠️ Cópia por valor de `OCCURRENCE_TYPE_FLOWS` (spec 218 D1). */
export const DRIVER_OCCURRENCE_FLOWS = ['document', 'stop'] as const
export type DriverOccurrenceFlow = (typeof DRIVER_OCCURRENCE_FLOWS)[number]

/**
 * O guard mora aqui (não em `driverTripClient.service.ts` ou `driverTripResponse.validation.ts`)
 * porque os dois o usam e um importa do outro (`toDriverTripSnapshot`) — um terceiro lugar sem
 * lógica de negócio evita o ciclo. Spec 218 (follow-up): também valida a lista embutida por
 * documento (`DriverTripDocument.occurrenceTypes`), não só a resposta da rota de catálogo.
 */
export function isDriverOccurrenceType(value: unknown): value is DriverOccurrenceType {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    readonly attachmentMode?: unknown
    readonly flow?: unknown
    readonly id?: unknown
    readonly name?: unknown
    readonly stopKind?: unknown
  }
  const hasKnownMode =
    candidate.attachmentMode === undefined ||
    (PROOF_FIELD_REQUIREMENTS as readonly unknown[]).includes(candidate.attachmentMode)
  /** Spec 218: ausentes são a cópia guardada antes da spec; presentes, só no vocabulário. */
  const hasKnownFlow =
    candidate.flow === undefined ||
    (DRIVER_OCCURRENCE_FLOWS as readonly unknown[]).includes(candidate.flow)
  const hasKnownStopKind =
    candidate.stopKind === undefined ||
    candidate.stopKind === null ||
    (DRIVER_OCCURRENCE_KINDS as readonly unknown[]).includes(candidate.stopKind)
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    hasKnownMode &&
    hasKnownFlow &&
    hasKnownStopKind
  )
}

/**
 * Spec 157 (RF5): falha de rede/servidor e lista vazia de verdade são fatos diferentes — a
 * primeira é "não sabemos", a segunda é "a empresa não cadastrou". `loading` só existe do lado da
 * tela, antes da primeira resposta; o cliente HTTP nunca a devolve.
 */
export type DriverOccurrenceTypesResult =
  | Readonly<{ status: 'failed' }>
  | Readonly<{ status: 'loaded'; types: readonly DriverOccurrenceType[] }>

export type DriverOccurrenceTypesState =
  | Readonly<{ status: 'loading' }>
  | DriverOccurrenceTypesResult
