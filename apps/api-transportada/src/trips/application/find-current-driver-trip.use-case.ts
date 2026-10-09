/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ADR-0045 §2: **o motorista não escolhe id.** O servidor resolve
 * `membership → fleet_driver → trip_drivers → trip`, e por isso não existe `GET /trips/:id` para o
 * papel `driver` — quem não escolhe não enumera, e o BOLA (OWASP API1) é o campeão de
 * vulnerabilidade em REST justamente aí.
 *
 * O payload é enxuto de propósito (RNF: abrir em 3G): sem XML, sem histórico de evento e sem produto
 * item a item, que a tela não mostra.
 */
/**
 * Spec 065 D1b: a entrega urbana **não tem CT-e nem MDF-e** — a NF-e é o único documento daquela
 * carga, e ela precisa estar na mão do motorista. Por isso a nota sobe com chave, número e série: é
 * com a chave que um fiscal consulta no portal e é com ela que a portaria do cliente confere.
 *
 * **O que isto não é:** substituto da DANFE impressa. A DANFE que acompanha a mercadoria é a que o
 * emitente imprimiu e mandou na caixa; isto é a cópia digital, para conferência e consulta.
 */
import type { HolidayWarning } from '../../business-calendar/domain/holiday-warning.policy.js'
import type { DriverScorePort } from '../../fleet/application/driver-score.port.js'
import type { TripCrewRole } from '../../shared/trip-crew-role.constant.js'
import type { CanhotoRejection } from '../domain/canhoto-recapture.policy.js'
import type { DeliveryProofFieldSettings } from '../domain/delivery-proof-settings.policy.js'
import type { DriverDocumentProduct } from '../domain/driver-document-products.policy.js'
import { attachDriverStopHolidayWarnings } from './attach-driver-stop-holiday-warnings.service.js'
import type { DriverHolidayWarningsDependency } from './driver-stop-holiday-warning.port.js'
import type { FieldOccurrenceType } from './list-field-occurrence-types.use-case.js'

export type DriverTripDocument = {
  readonly accessKey: string
  readonly deliveredAt: string | null
  /**
   * Spec 082 (revisão de ADR-0057 §2): os campos do comprovante **resolvidos** para esta nota —
   * geral da empresa + exceção pelo CNPJ do destinatário **do documento**. Mora no documento, não
   * na parada: a parada agrupa por endereço e pode ter destinatários com exceções diferentes.
   */
  readonly deliveryProof: DeliveryProofFieldSettings
  /** Soma do peso bruto dos volumes. Zero quando a nota importada não os trouxe — e isso é comum. */
  readonly grossWeight: string
  readonly id: string
  readonly number: string
  /**
   * Spec 218 RF-B2 (follow-up): os tipos de ocorrência de nota (`flow: 'document'`), já resolvidos
   * em 3 camadas para **este** documento — mesma regra de `deliveryProof` acima. Os de parada
   * (`flow: 'stop'`) não têm contratante/destinatário únicos e continuam vindo pela rota de
   * catálogo (`GET .../occurrence-types`), sem exceção. `null` quando a resolução falhou nesta
   * chamada (infra indisponível) — o app cai na lista geral, sem exceção, em vez de travar.
   */
  readonly occurrenceTypes: readonly FieldOccurrenceType[] | null
  /**
   * ADR-0070 §1, spec 159 RF1/RF2: entregue, foto obrigatória (`deliveryProof.photo = 'required'`)
   * e nenhuma foto anexada ao evento de entrega. A entrega nunca é recusada por isso — só avisa.
   */
  readonly proofPending: boolean
  /**
   * Spec 247 (RF11, T4.6): os produtos da nota, um por código, com o preço e a quantidade que o
   * servidor usa na conta. `[]` é nota sem produto (manual); ausente é a leitura que falhou nesta
   * chamada — refinamento sobre um snapshot que funciona sem ela, e o app cai na nota inteira.
   */
  readonly products?: readonly DriverDocumentProduct[]
  /**
   * Spec 193 D14: como o destinatário é chamado — nome fantasia, senão razão social (a regra de
   * `resolveRecipientDisplayName`). É o que "O próprio cliente recebeu" preenche no nome.
   */
  readonly recipientDisplayName: string
  /**
   * Spec 193 D14: PF ou PJ, só pelo tamanho do documento (`resolveRecipientIsCompany`). O documento
   * nunca sai — este booleano decide se "O próprio cliente recebeu" seleciona o nome preenchido
   * (PJ, para o motorista digitar por cima) ou só o deixa no fim do campo (PF).
   */
  readonly recipientIsCompany: boolean
  /** Nome de quem recebe. É o mínimo para entregar — e nada além disso vem junto. */
  readonly recipientName: string
  readonly returnReason: string | null
  readonly separationStatus: string
  readonly series: string
  readonly totalAmount: string
  readonly volumeCount: string
}

/**
 * Spec 060 D3: **a hora marcada e o protocolo**, no bolso de quem chega na portaria. Um agendamento
 * que o sistema conhece e o motorista não é um agendamento que não existe — ele fica parado no
 * portão sem o número que o porteiro pede.
 */
export type DriverStopSchedule = {
  readonly protocol: string
  readonly scheduledAt: string | null
  readonly status: string
}

export type DriverTripStop = {
  readonly arrivedAt: string | null
  readonly completedAt: string | null
  readonly deliveryWindowEnd: string | null
  readonly deliveryWindowStart: string | null
  readonly documents: readonly DriverTripDocument[]
  /** Spec 206 D9: a hora do servidor no toque de "Iniciar rota". `null` sem saída em aberto. */
  readonly enRouteSince: string | null
  /** Spec 206 D9: a hora do aparelho — a âncora que a 207 lê. `null` sem saída em aberto. */
  readonly enRouteTappedAt: string | null
  /**
   * Spec 252 T4.3 (ADR-0100 D12): a entrega cai em feriado da cidade da parada — só informa, nunca bloqueia
   * nada. Ausente quando não há aviso (parada concluída, sem ETA, dia útil) ou quando o aviso falhou.
   */
  readonly holidayWarnings?: readonly HolidayWarning[]
  readonly id: string
  readonly label: string
  readonly latitude: string | null
  readonly longitude: string | null
  /** `null` quando a parada não exige agendamento — que é o caso da maioria. */
  readonly schedule: DriverStopSchedule | null
  readonly sequence: number
}

/**
 * O que o motorista precisa do manifesto **na tela**: a chave para conferir contra o que o fiscal
 * lê, e o id para pedir o papel. `null` enquanto o MDF-e não existe ou não autorizou — e nesse
 * intervalo o que ele tem na mão é o romaneio.
 */
export type DriverTripManifest = {
  readonly accessKey: string
  readonly authorizedAt: string | null
  readonly id: string
  readonly protocol: string
}

export type DriverTrip = {
  /** Quando a viagem foi aberta — duas viagens do mesmo veículo só se distinguem por isto. */
  readonly createdAt: string
  /**
   * Spec 243 D3: o papel da pessoa **nesta** viagem (`trip_drivers.role`). A mesma pessoa pode
   * dirigir uma e acompanhar outra; o app esconde do ajudante as ações que a API recusaria.
   */
  readonly crewRole: TripCrewRole
  readonly id: string
  readonly manifest: DriverTripManifest | null
  readonly status: string
  readonly stops: readonly DriverTripStop[]
  readonly vehiclePlate: string
}

/**
 * Spec 159 T11 (ALTO 1): a nota entregue pelo próprio motorista nos 90 dias, com foto obrigatória
 * e sem foto. Vem na raiz do snapshot, fora das viagens: a última entrega conclui a viagem e ela
 * sai de `trips`, mas a foto ainda pode chegar pelo `/proof` (que aceita viagem `completed`).
 */
export type DriverPendingProof = {
  /**
   * Spec 220 RF29: presente só quando a conferência recusou o canhoto anterior — é o que explica ao
   * motorista por que a nota voltou. Ausente quando a nota nunca teve canhoto nenhum.
   */
  readonly canhotoRejection?: CanhotoRejection
  /** `trip_stop_events.captured_at ?? recorded_at` da entrega — a mesma hora que a nota usa. */
  readonly deliveredAt: string
  /** A configuração resolvida da nota, a mesma de `DriverTripDocument.deliveryProof`. */
  readonly deliveryProof: DeliveryProofFieldSettings
  /** O id que o `/proof` recebe (`trip_documents.id`). */
  readonly documentId: string
  readonly documentNumber: string
  readonly documentSeries: string
  /** Spec 193 D14: a mesma de `DriverTripDocument.recipientDisplayName` ("Fotos pendentes"). */
  readonly recipientDisplayName: string
  /** Spec 193 D14: a mesma de `DriverTripDocument.recipientIsCompany` ("Fotos pendentes"). */
  readonly recipientIsCompany: boolean
  readonly recipientName: string
  readonly tripId: string
  readonly tripStatus: string
}

export type CurrentDriverTripPort = {
  /** `null` quando a conta autenticada não está ligada a nenhum cadastro de motorista. */
  findDriverIdByMembership(input: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<string | null>
  listActiveTrips(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly DriverTrip[]>
  listPendingProofs(input: {
    readonly companyId: string
    readonly driverId: string
    readonly now: Date
  }): Promise<readonly DriverPendingProof[]>
}

export type FindCurrentDriverTripInput = {
  /** Spec 244 D2: `false` não lista as fotos pendentes (a conta não pode enviá-las). Ausente = `true`. */
  readonly canReportProofs?: boolean
  readonly companyId: string
  /** Spec 252 T4.3: o aviso de feriado nas paradas. Ausente = sem aviso e sem consulta a mais. */
  readonly holidayWarnings?: DriverHolidayWarningsDependency
  readonly membershipId: string
  /** O relógio da nota (RF9: penalidade vigente 90 dias) — injetado, nunca lido aqui. */
  readonly now: Date
  readonly repository: CurrentDriverTripPort
  readonly scores: Pick<DriverScorePort, 'readScores'>
}

export type FindCurrentDriverTripResult = {
  /**
   * Conta sem cadastro de motorista e motorista sem viagem hoje são **problemas diferentes**, e a
   * tela precisa dizer coisas diferentes: "fale com o escritório, sua conta não está ligada a um
   * cadastro" não é "nada para hoje". Sem esta distinção o segundo caso esconde o primeiro.
   */
  readonly isRegisteredDriver: boolean
  /** Spec 159 T11 (ALTO 1): as fotos obrigatórias que ainda faltam, de qualquer viagem dele. */
  readonly pendingProofs: readonly DriverPendingProof[]
  /** ADR-0070 §6, spec 159 RF2: a nota do próprio motorista — `null` sem histórico ou sem cadastro. */
  readonly score: number | null
  readonly trips: readonly DriverTrip[]
}

/**
 * Motorista sem viagem ativa devolve lista vazia, **nunca 404**: não ter viagem hoje é rotina, e
 * 404 na primeira tela do dia lê-se como produto quebrado.
 *
 * Motorista em duas viagens `dispatched` devolve as duas, e quem escolhe é ele — a 056 não impede o
 * caso, que é dois veículos em dois dias.
 */
export async function findCurrentDriverTrip(
  input: FindCurrentDriverTripInput,
): Promise<FindCurrentDriverTripResult> {
  const driverId = await input.repository.findDriverIdByMembership({
    companyId: input.companyId,
    membershipId: input.membershipId,
  })
  if (driverId === null) {
    return { isRegisteredDriver: false, pendingProofs: [], score: null, trips: [] }
  }

  const shouldListPendingProofs = input.canReportProofs ?? true
  const [trips, pendingProofs, scores] = await Promise.all([
    input.repository.listActiveTrips({ companyId: input.companyId, driverId }),
    shouldListPendingProofs
      ? input.repository.listPendingProofs({ companyId: input.companyId, driverId, now: input.now })
      : Promise.resolve([]),
    input.scores.readScores({ companyId: input.companyId, driverIds: [driverId], now: input.now }),
  ])

  /** Depois do recorte pelo vínculo do motorista, e fora do `Promise.all`: o aviso é refinamento. */
  const tripsWithWarnings = await attachDriverStopHolidayWarnings({
    companyId: input.companyId,
    ...(input.holidayWarnings === undefined ? {} : { dependency: input.holidayWarnings }),
    now: input.now,
    trips,
  })

  return {
    isRegisteredDriver: true,
    pendingProofs,
    score: scores.get(driverId) ?? null,
    trips: tripsWithWarnings,
  }
}
