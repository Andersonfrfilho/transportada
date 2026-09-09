/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import {
  resolveBoundVehicleIds,
  resolveEffectiveVehicleIds,
  toManualVehicleIds,
} from '../shared/driverBoundVehicles.service'
import { useDriverVehicleBindings } from './useDriverVehicleBindings.hook'
import {
  resolveSoleDriverOfVehicle,
  toRequestVehicles,
} from '@/modules/routing/shared/multiVehiclePairing.service'

import { loadAvailableTripDocuments } from '../shared/availableTripDocuments.service'
import { ROUTE_ASSEMBLY_TIMEOUT_CODE } from '../shared/routeAssemblyFailure.service'
import { TRIP_ERROR, TRIP_QUERY_KEY } from '../shared/trip.constant'
import type {
  AcceptedMultiVehicleTrip,
  MultiVehicleLeftoverStop,
  MultiVehicleProposal,
  SkippedMultiVehicleDocument,
  TripCandidateDocument,
} from '../shared/trip.types'
import {
  EMPTY_TRIP_ROUTE_ASSEMBLY,
  validateRouteAssembly,
  type TripRouteAssemblyDraft,
} from '../shared/tripRouteAssembly.service'
import { getTripClient } from './useTripWorkspace.hook'
import { getRouteSuggestionClient } from '@/modules/routing/hooks/useRouteSuggestion.hook'

const SUGGESTION_POLL_MS = 2_000
const SUGGESTION_POLL_CAP = 60

export type TripRouteAssemblyOutcome = Readonly<{
  /**
   * Spec 107: as notas que o aceite pulou por já estarem vivas em outra viagem, e as paradas que
   * ficaram sem veículo. ⚠️ Sugestão que devolve quarenta paradas e cala sobre doze **parece
   * completa** — o operador aceita e descobre a carga esquecida no dia seguinte.
   */
  leftoverStops: readonly MultiVehicleLeftoverStop[]
  skippedDocuments: readonly SkippedMultiVehicleDocument[]
  trips: readonly AcceptedMultiVehicleTrip[]
}>

/**
 * O automático espera o solver, que roda no worker: a criação responde `202` e a sugestão só fica
 * `ready` depois. Sem o teto de tentativas, um solver que morre deixa a tela girando para sempre.
 */
async function waitForSuggestion(suggestionId: string): Promise<MultiVehicleProposal> {
  const client = getTripClient()

  for (let attempt = 0; attempt < SUGGESTION_POLL_CAP; attempt += 1) {
    const suggestion = await client.readMultiVehicleSuggestion({ suggestionId })
    /**
     * Spec 108: pronta, a proposta é **relida com as paradas** — o poll olha só o estado, e é a
     * releitura que alimenta a tela de revisão. Duas chamadas, e não uma pesada por tentativa.
     */
    if (suggestion.status === 'ready') return client.readMultiVehicleProposal({ suggestionId })
    /**
     * `stale` é a nota que entrou depois da proposta ficar pronta: ela descreve uma viagem que não
     * existe mais, e esperar por ela seria esperar para sempre.
     */
    if (suggestion.status === 'failed' || suggestion.status === 'stale') {
      throw new Error(suggestion.errorCode ?? `ROUTE_SUGGESTION_${suggestion.status.toUpperCase()}`)
    }
    await new Promise((resolve) => setTimeout(resolve, SUGGESTION_POLL_MS))
  }

  throw new Error(ROUTE_ASSEMBLY_TIMEOUT_CODE)
}

export function useTripRouteAssembly(
  input: Readonly<{
    canManageTrips: boolean
    /**
     * Uma viagem criada abre nela; várias fecham na lista. Quem acabou de montar quer conferir o
     * roteiro — e o modal que ficava aberto mostrava o sucesso cercado dos três avisos de campo
     * vazio, que é como se algo tivesse falhado logo depois de dar certo.
     */
    onCreated: (trips: readonly AcceptedMultiVehicleTrip[]) => void
    selectableDriverIds: readonly string[]
    selectableVehicleIds: readonly string[]
  }>,
) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<TripRouteAssemblyDraft>(EMPTY_TRIP_ROUTE_ASSEMBLY)
  const [outcome, setOutcome] = useState<null | TripRouteAssemblyOutcome>(null)
  /** Spec 108: a proposta em revisão. Enquanto ela existe, **nada foi criado**. */
  const [proposal, setProposal] = useState<null | MultiVehicleProposal>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [pool, setPool] = useState<readonly TripCandidateDocument[]>([])

  const documentsQuery = useQuery({
    enabled: input.canManageTrips,
    queryFn: loadAvailableTripDocuments,
    queryKey: [TRIP_QUERY_KEY, 'route-assembly', 'documents'],
  })

  /**
   * Uma consulta por motorista escolhido, e não uma varredura da frota: o vínculo é do motorista, e
   * o operador escolhe dois ou três — buscar tudo para achar três seria varrer a base a cada tecla.
   */
  const bindings = useDriverVehicleBindings({
    enabled: input.canManageTrips,
    selectableDriverIds: input.selectableDriverIds,
    selectedDriverIds: draft.driverIds,
  })
  /**
   * O vínculo do cadastro é o que pareia veículo e motorista na distribuição — ele já é consultado
   * aqui para o veículo do agregado vir junto com ele, e é a mesma resposta que responde "quem
   * dirige este caminhão".
   */
  const links = bindings.flatMap((binding) =>
    binding.vehicleIds.map((vehicleId) => ({ driverId: binding.driverId, vehicleId })),
  )

  const boundVehicleIds = resolveBoundVehicleIds({
    bindings,
    selectableVehicleIds: input.selectableVehicleIds,
    selectedDriverIds: draft.driverIds,
  })
  const effectiveVehicleIds = resolveEffectiveVehicleIds({
    boundVehicleIds,
    manualVehicleIds: draft.vehicleIds,
  })

  /**
   * O pool vem da **busca**, com os mesmos filtros da tela de notas — a faixa de numeração que
   * existia aqui era um filtro a menos, feito à mão, ao lado de um `numberFrom`/`numberTo` que a
   * listagem de notas já tinha. Duas buscas divergiriam no primeiro filtro novo.
   */
  const selection = {
    alreadyOnTrip: pool.filter((document) => document.tripId !== null),
    eligible: pool.filter((document) => document.tripId === null),
  }
  const issues = validateRouteAssembly({
    draft: { ...draft, vehicleIds: effectiveVehicleIds },
    selection,
  })

  /**
   * Spec 108: **propor não cria nada.** O que nasce aqui é a sugestão — paradas propostas —, e a
   * viagem só existe depois do aceite. Até 09/09/2026 o mesmo clique fazia as duas coisas: o
   * operador lia "5 viagens criadas pela recomendação" sem nunca ter visto o que ia aceitar, e
   * desfazer era cancelar cinco viagens uma a uma.
   */
  const proposeMutation = useMutation({
    mutationFn: async (): Promise<MultiVehicleProposal> => {
      const client = getTripClient()
      const nfeDocumentIds = selection.eligible.map((document) => document.id)

      /**
       * ⚠️ Cada veículo vai com **o motorista dele**, não com a lista inteira de motoristas. O
       * vínculo do cadastro é quem responde por isso (spec 081): o agregado leva a van dele, e o
       * funcionário leva a da empresa. Mandar só os veículos criava viagem sem ninguém, e ela não
       * aparece no aplicativo de quem dirige.
       */
      const suggestion = await client.createMultiVehicleSuggestion({
        nfeDocumentIds,
        vehicles: toRequestVehicles(
          effectiveVehicleIds.map((vehicleId) => ({
            driverId: resolveSoleDriverOfVehicle({ links, vehicleId }),
            vehicleId,
          })),
        ),
      })
      return waitForSuggestion(suggestion.id)
    },
    onSuccess: (result) => {
      setProposal(result)
      setIsOpen(false)
    },
  })

  /**
   * Spec 108: o aceite é **o único** caminho que escreve viagem, e ele parte de uma proposta que o
   * operador já viu na tela.
   */
  const acceptMutation = useMutation({
    mutationFn: async (): Promise<TripRouteAssemblyOutcome> => {
      const suggestionId = proposal?.suggestion.id
      if (suggestionId === undefined) throw new Error(TRIP_ERROR.RESPONSE_INVALID)
      const accepted = await getTripClient().acceptMultiVehicleSuggestion({ suggestionId })

      return {
        leftoverStops: accepted.leftoverStops,
        skippedDocuments: accepted.skippedDocuments,
        trips: accepted.trips,
      }
    },
    onSuccess: (result) => {
      setOutcome(result)
      setProposal(null)
      setDraft(EMPTY_TRIP_ROUTE_ASSEMBLY)
      setPool([])
      void invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
      void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY] })
      input.onCreated(result.trips)
    },
  })

  return {
    pool,
    /** A escolha da busca **é** o lote: não há segundo passo entre marcar a nota e ela contar. */
    setPool,
    close: () => setIsOpen(false),
    isOpen,
    open: () => setIsOpen(true),
    /**
     * Spec 107 D3: reabre a montagem já com as notas que sobraram. ⚠️ Ela **filtra o pool
     * disponível** em vez de confiar nos ids: a nota pode ter entrado numa viagem entre o aceite e o
     * clique, e reofertá-la produziria o `already_linked` que a D1 acabou de aprender a pular.
     */
    retryWith: (nfeDocumentIds: readonly string[]) => {
      const wanted = new Set(nfeDocumentIds)
      setPool((documentsQuery.data ?? []).filter((entry) => wanted.has(entry.id)))
      setOutcome(null)
      setIsOpen(true)
    },
    proposeMutation,
    acceptMutation,
    proposal,
    /**
     * Spec 108: descartar avisa a API (`reject`) e volta o operador ao formulário com a escolha
     * dele intacta. ⚠️ A recusa remota é **melhor esforço**: falhar ali não pode prender a tela
     * numa proposta que o operador já rejeitou — a sugestão fica `ready` e ninguém a aceita.
     */
    discardProposal: () => {
      const suggestionId = proposal?.suggestion.id
      if (suggestionId !== undefined) {
        void getRouteSuggestionClient()
          .rejectMultiVehicle({ suggestionId })
          .catch(() => undefined)
      }
      setProposal(null)
      setIsOpen(true)
    },
    bindings,
    availableDocuments: documentsQuery.data ?? [],
    documentsQuery,
    draft,
    issues,
    outcome,
    selection,
    setDriverIds: (driverIds: readonly string[]) =>
      setDraft((current) => ({ ...current, driverIds })),
    boundVehicleIds,
    effectiveVehicleIds,
    setVehicleIds: (vehicleIds: readonly string[]) =>
      setDraft((current) => ({
        ...current,
        vehicleIds: toManualVehicleIds({ boundVehicleIds, nextVehicleIds: vehicleIds }),
      })),
  }
}

export type TripRouteAssemblyController = ReturnType<typeof useTripRouteAssembly>
