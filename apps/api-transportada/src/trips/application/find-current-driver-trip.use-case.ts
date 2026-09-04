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
import type { DeliveryProofFieldSettings } from '../domain/delivery-proof-settings.policy.js'

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
  readonly id: string
  readonly manifest: DriverTripManifest | null
  readonly status: string
  readonly stops: readonly DriverTripStop[]
  readonly vehiclePlate: string
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
}

export type FindCurrentDriverTripInput = {
  readonly companyId: string
  readonly membershipId: string
  readonly repository: CurrentDriverTripPort
}

export type FindCurrentDriverTripResult = {
  /**
   * Conta sem cadastro de motorista e motorista sem viagem hoje são **problemas diferentes**, e a
   * tela precisa dizer coisas diferentes: "fale com o escritório, sua conta não está ligada a um
   * cadastro" não é "nada para hoje". Sem esta distinção o segundo caso esconde o primeiro.
   */
  readonly isRegisteredDriver: boolean
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
  if (driverId === null) return { isRegisteredDriver: false, trips: [] }

  const trips = await input.repository.listActiveTrips({ companyId: input.companyId, driverId })

  return { isRegisteredDriver: true, trips }
}
