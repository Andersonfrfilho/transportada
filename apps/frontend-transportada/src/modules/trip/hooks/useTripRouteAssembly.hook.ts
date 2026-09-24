/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

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
import {
  isSettledSuggestionFailure,
  ROUTE_ASSEMBLY_TIMEOUT_CODE,
  RouteSuggestionSettledError,
} from '../shared/routeAssemblyFailure.service'
import {
  AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY,
  TRIP_ERROR,
  TRIP_QUERY_KEY,
} from '../shared/trip.constant'
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
import {
  applyStopMoves,
  forgetMovedVehicleRouteChoices,
  resolveAcceptedStopOrders,
  resolveMovedVehicleIds,
} from '../shared/proposalStopMove.service'
import { getTripClient } from './useTripWorkspace.hook'
import type { RouteChoice } from '../shared/routeGeometry.service'
import { getRouteSuggestionClient } from '@/modules/routing/hooks/useRouteSuggestion.hook'
import {
  isSameDocumentSelection,
  type AutomaticProposalState,
} from '../shared/tripAssemblyDraft.service'
import type { TripAssemblyDraftScope } from '../shared/tripAssemblyDraftStorage.service'
import { useRouteAssemblyDraft } from './useRouteAssemblyDraft.hook'

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
      throw new RouteSuggestionSettledError(
        suggestion.errorCode ?? `ROUTE_SUGGESTION_${suggestion.status.toUpperCase()}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, SUGGESTION_POLL_MS))
  }

  throw new Error(ROUTE_ASSEMBLY_TIMEOUT_CODE)
}

export function useTripRouteAssembly(
  input: Readonly<{
    canManageTrips: boolean
    /** Empresa e usuário do rascunho da montagem (ver `useTripAssemblyDraftLifecycle`). */
    draftScope?: TripAssemblyDraftScope | undefined
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
  /** Spec 110 D5: a seleção nasce inteira — o caso comum é aceitar tudo. */
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<ReadonlySet<string>>(new Set())
  const [openVehicleId, setOpenVehicleId] = useState<null | string>(null)
  /**
   * Spec 110 D6: as notas que o operador tirou do roteiro e que **ainda não saíram** — nada é
   * destruído antes do recálculo, e é por isso que "Desfazer" existe.
   *
   * ⚠️ A marcação vale para a **proposta inteira**, não para um caminhão: tirar uma parada muda o
   * maço, e o maço decide a distribuição toda. Um botão "recalcular este caminhão" prometeria um
   * recorte que o solver não faz.
   */
  const [pendingRemovals, setPendingRemovals] = useState<ReadonlySet<string>>(new Set())
  /**
   * A ordem escolhida à mão nas setas, por veículo. Veículo ausente é a ordem do roteirizador.
   *
   * ⚠️ Ela é **por caminhão**, ao contrário da remoção: mexer na ordem de um não muda o maço nem a
   * distribuição, só o caminho daquele caminhão — e por isso ela não trava o aceite nem pede
   * recálculo da proposta. Quem recalcula é a prévia daquela viagem, que já recebe a ordem.
   */
  /**
   * Spec 148 T7 (D10): por caminhão, a planta da prévia de onde o aceite solta as notas que não
   * couberam. Marcado aqui, solto no aceite — na mesma transação que vincula.
   */
  const [releaseLayoutByVehicle, setReleaseLayoutByVehicle] = useState<ReadonlyMap<string, string>>(
    new Map(),
  )
  /**
   * Spec 153: por caminhão, a rota que o mapa da proposta mostra — a que a viagem congela no aceite.
   * Caminhão sem entrada segue o critério padrão do servidor.
   */
  const [routeChoiceByVehicle, setRouteChoiceByVehicle] = useState<
    ReadonlyMap<string, RouteChoice>
  >(new Map())
  const [orderByVehicle, setOrderByVehicle] = useState<ReadonlyMap<string, readonly string[]>>(
    new Map(),
  )
  /**
   * A ordem que as setas estão montando e que **ainda não foi salva**.
   *
   * ⚠️ **As setas não vão ao servidor.** Cada troca de ordem refazia três consultas — a conta, a
   * carreta e a rota do mapa, as duas últimas no OSRM —, e descer uma parada dez posições gastava
   * trinta chamadas para mostrar números que o operador só queria ver no fim. O rascunho troca de
   * lugar na tela; quem mede é "Salvar ordem", uma vez.
   */
  const [draftOrderByVehicle, setDraftOrderByVehicle] = useState<
    ReadonlyMap<string, readonly string[]>
  >(new Map())
  /**
   * Spec 112: nota → caminhão de destino, salvos e em rascunho. O rascunho só muda a tela; salvar o
   * torna o que as medições e o aceite usam — como a ordem.
   */
  const [stopMoves, setStopMoves] = useState<ReadonlyMap<string, string>>(new Map())
  const [draftStopMoves, setDraftStopMoves] = useState<ReadonlyMap<string, string>>(new Map())
  const [pool, setPool] = useState<readonly TripCandidateDocument[]>([])
  /** A sugestão pedida e ainda sem resposta: guardada para a volta retomar a espera. */
  const [pendingSuggestionId, setPendingSuggestionId] = useState<null | string>(null)
  /**
   * ⚠️ Cresce a cada "Limpar rascunho", aceite e troca de escopo. Uma espera que termina depois disso
   * pertence a uma montagem que não existe mais — sem esta conferência ela repunha a proposta limpa
   * e a gravava de novo.
   */
  const proposalGenerationRef = useRef(0)

  const documentsQuery = useQuery({
    enabled: input.canManageTrips,
    queryFn: loadAvailableTripDocuments,
    queryKey: AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY,
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
    /** Com um id, **retoma** a espera de uma sugestão já pedida — a volta nunca pede outra. */
    mutationFn: async (resumeSuggestionId: string | void): Promise<MultiVehicleProposal> => {
      if (typeof resumeSuggestionId === 'string') return waitForSuggestion(resumeSuggestionId)
      const generation = proposalGenerationRef.current
      /** Pedir de novo substitui a sugestão que ficou esperando: a antiga é recusada. */
      rejectOnServer(pendingSuggestionId ?? undefined)
      const client = getTripClient()
      /**
       * ⚠️ **O recálculo é o que honra a remoção.** Editar só no cliente seria ignorado pelo aceite,
       * que parte dos grupos do servidor — o operador veria uma distribuição e receberia outra.
       */
      const nfeDocumentIds = selection.eligible
        .filter((document) => !pendingRemovals.has(document.id))
        .map((document) => document.id)

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
      if (generation !== proposalGenerationRef.current) {
        rejectOnServer(suggestion.id)
        throw new RouteSuggestionSettledError(TRIP_ERROR.RESPONSE_INVALID)
      }
      /** Gravado antes da espera: quem sai para medir no meio do cálculo não deixa a sugestão órfã. */
      setPendingSuggestionId(suggestion.id)
      return waitForSuggestion(suggestion.id)
    },
    /**
     * ⚠️ Só o fim de verdade esquece a sugestão pedida. Queda de rede na espera a mantém, e o painel
     * oferece retomar — esquecê-la aqui a deixaria órfã no servidor.
     */
    onError: (error, _variables, context) => {
      if (context?.generation !== proposalGenerationRef.current) return
      if (isSettledSuggestionFailure(error)) setPendingSuggestionId(null)
    },
    onMutate: () => {
      assemblyDraft.releaseRetained()
      return { generation: proposalGenerationRef.current }
    },
    onSuccess: (result, _variables, context) => {
      if (context.generation !== proposalGenerationRef.current) return
      setPendingSuggestionId(null)
      setProposal(result)
      /**
       * ⚠️ Spec 110 D1: **o diálogo NÃO fecha aqui.** Ele fechava, e a revisão aparecia na tela de
       * viagens — quem passou dois minutos escolhendo notas, motoristas e veículos perdia de vista o
       * pedido que gerou aquilo. O comentário antigo dizia que a revisão dentro do diálogo ficaria
       * cercada dos avisos de campo vazio: a premissa estava certa e a conclusão não, porque o
       * formulário **recolhe** quando a proposta chega, e não há campo vazio para avisar sobre.
       */
      setSelectedVehicleIds(new Set(vehicleIdsOf(result)))
      setOpenVehicleId(vehicleIdsOf(result)[0] ?? null)
      /** A proposta nova já nasce sem o que foi removido: a marcação cumpriu o papel dela. */
      setPendingRemovals(new Set())
      setOrderByVehicle(new Map())
      setReleaseLayoutByVehicle(new Map())
      setRouteChoiceByVehicle(new Map())
      setDraftOrderByVehicle(new Map())
      setStopMoves(new Map())
      setDraftStopMoves(new Map())
    },
  })

  /**
   * Spec 108: o aceite é **o único** caminho que escreve viagem, e ele parte de uma proposta que o
   * operador já viu na tela.
   */
  /** As paradas como o operador as deixou, rascunho incluído: é o que a tela desenha. */
  const displayStops =
    proposal === null
      ? null
      : applyStopMoves(proposal.stops, new Map([...stopMoves, ...draftStopMoves]))
  /**
   * O que o aceite leva: os movimentos e as ordens **salvos**. Rascunho aberto trava o aceite, então
   * no clique os dois conjuntos são o mesmo — mas é daqui que o corpo sai.
   */
  const acceptedOrders =
    proposal === null
      ? []
      : resolveAcceptedStopOrders({
          addressById: new Map(
            pool.map((document) => [
              document.id,
              {
                cityCode: document.recipientCityCode,
                number: document.recipientAddressNumber,
                postalCode: document.recipientPostalCode,
              },
            ]),
          ),
          manualOrderByVehicle: orderByVehicle,
          moves: stopMoves,
          stops: proposal.stops,
        })

  const acceptMutation = useMutation({
    mutationFn: async (vehicleIds?: readonly string[]): Promise<TripRouteAssemblyOutcome> => {
      const suggestionId = proposal?.suggestion.id
      if (suggestionId === undefined) throw new Error(TRIP_ERROR.RESPONSE_INVALID)
      /**
       * Spec 110 D5a: sem lista, a proposta inteira — o aceite de sempre. Com ela, só os marcados
       * viram viagem, e o que sobra volta ao maço porque nunca saiu dele.
       */
      /** Só a planta de caminhão aceito: a de outro caminhão seria recusada como carga alheia. */
      const releaseUnplacedFromLayoutIds = [...releaseLayoutByVehicle]
        .filter(([vehicleId]) => vehicleIds === undefined || vehicleIds.includes(vehicleId))
        .map(([, layoutId]) => layoutId)
      const acceptedRouteChoices = [...routeChoiceByVehicle]
        .filter(([vehicleId]) => vehicleIds === undefined || vehicleIds.includes(vehicleId))
        .map(([vehicleId, routeChoice]) => ({ routeChoice, vehicleId }))
      const accepted = await getTripClient().acceptMultiVehicleSuggestion({
        suggestionId,
        ...(vehicleIds === undefined ? {} : { vehicleIds }),
        ...(releaseUnplacedFromLayoutIds.length === 0 ? {} : { releaseUnplacedFromLayoutIds }),
        ...(acceptedRouteChoices.length === 0
          ? {}
          : { routeChoiceByVehicle: acceptedRouteChoices }),
        /**
         * ⚠️ **Sem isto as setas mentem**: a viagem nasceria com a ordem do roteirizador. Só vai o
         * caminhão que alguém reordenou — os outros seguem a do solver, com o horário previsto.
         */
        ...(acceptedOrders.length === 0 ? {} : { stopOrderByVehicle: acceptedOrders }),
      })

      return {
        leftoverStops: accepted.leftoverStops,
        skippedDocuments: accepted.skippedDocuments,
        trips: accepted.trips,
      }
    },
    onSuccess: (result) => {
      resetAssembly()
      assemblyDraft.clear()
      setOutcome(result)
      void invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
      void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY] })
      input.onCreated(result.trips)
    },
  })

  function applyProposalState(restored: MultiVehicleProposal, state: AutomaticProposalState): void {
    setProposal(restored)
    setSelectedVehicleIds(state.selectedVehicleIds)
    setOpenVehicleId(state.openVehicleId)
    setPendingRemovals(state.pendingRemovals)
    setOrderByVehicle(state.orderByVehicle)
    setReleaseLayoutByVehicle(state.releaseLayoutByVehicle)
    setRouteChoiceByVehicle(state.routeChoiceByVehicle)
    setDraftOrderByVehicle(state.draftOrderByVehicle)
    setStopMoves(state.stopMoves)
    setDraftStopMoves(state.draftStopMoves)
  }

  /** Aceite, "Limpar rascunho" e troca de escopo: a montagem volta ao começo. */
  function resetAssembly(): void {
    proposalGenerationRef.current += 1
    proposeMutation.reset()
    setProposal(null)
    setSelectedVehicleIds(new Set())
    setOpenVehicleId(null)
    setPendingRemovals(new Set())
    setOrderByVehicle(new Map())
    setReleaseLayoutByVehicle(new Map())
    setRouteChoiceByVehicle(new Map())
    setDraftOrderByVehicle(new Map())
    setStopMoves(new Map())
    setDraftStopMoves(new Map())
    setIsOpen(false)
    setDraft(EMPTY_TRIP_ROUTE_ASSEMBLY)
    setPool([])
    setPendingSuggestionId(null)
  }

  const assemblyDraft = useRouteAssemblyDraft({
    form: {
      draft,
      isOpen,
      pendingSuggestionId,
      pool,
      proposalState:
        proposal === null
          ? null
          : {
              draftOrderByVehicle,
              draftStopMoves,
              openVehicleId,
              orderByVehicle,
              pendingRemovals,
              releaseLayoutByVehicle,
              routeChoiceByVehicle,
              selectedVehicleIds,
              stopMoves,
              suggestionId: proposal.suggestion.id,
            },
    },
    onAbandonSuggestions: (suggestionIds) => {
      for (const suggestionId of suggestionIds) rejectOnServer(suggestionId)
    },
    onApplyForm: (form) => {
      setDraft(form.draft)
      setPool(form.documents)
      setIsOpen(form.isOpen)
    },
    onApplyProposal: applyProposalState,
    onReset: resetAssembly,
    onResume: (suggestionId) => {
      setPendingSuggestionId(suggestionId)
      proposeMutation.mutate(suggestionId)
    },
    scope: input.draftScope,
    selectableDriverIds: input.selectableDriverIds,
    selectableVehicleIds: input.selectableVehicleIds,
  })

  /** Mexer é decidir: a restauração a caminho não aplica por cima, e o aviso da volta sai. */
  function touch(): void {
    assemblyDraft.markTouched()
    assemblyDraft.dismissNotice()
  }

  return {
    pool,
    /** Spec 148 T7: a planta marcada é a de agora — outra planta do mesmo caminhão não conta. */
    isReleaseMarked: (vehicleId: string, layoutId: string) =>
      releaseLayoutByVehicle.get(vehicleId) === layoutId,
    toggleRelease: (vehicleId: string, layoutId: string) => {
      setReleaseLayoutByVehicle((current) => {
        const next = new Map(current)
        if (next.get(vehicleId) === layoutId) next.delete(vehicleId)
        else next.set(vehicleId, layoutId)
        return next
      })
    },
    /**
     * ⚠️ Devolve o mesmo mapa quando nada mudou: o mapa da proposta publica a escolha num efeito, e
     * um mapa novo a cada chamada renderizaria a proposta de novo sem fim.
     */
    setVehicleRouteChoice: (vehicleId: string, choice: RouteChoice | undefined) =>
      setRouteChoiceByVehicle((current) => {
        const known = current.get(vehicleId)
        if (known?.criterion === choice?.criterion && known?.signature === choice?.signature) {
          return current
        }
        return choice === undefined
          ? withoutVehicle(current, vehicleId)
          : new Map([...current, [vehicleId, choice]])
      }),
    /**
     * A escolha da busca **é** o lote: não há segundo passo entre marcar a nota e ela contar. ⚠️ A
     * busca remontada anuncia a mesma seleção — isso não é o operador mexendo.
     */
    setPool: (documents: readonly TripCandidateDocument[]) => {
      if (!isSameDocumentSelection(documents, pool)) touch()
      setPool(documents)
    },
    /** Cancelar guarda o rascunho, e a proposta com ele; só "Limpar rascunho" o apaga. */
    close: () => {
      assemblyDraft.dismissNotice()
      setIsOpen(false)
    },
    isOpen,
    open: () => setIsOpen(true),
    /**
     * Spec 107 D3: reabre a montagem já com as notas que sobraram. ⚠️ Ela **filtra o pool
     * disponível** em vez de confiar nos ids: a nota pode ter entrado numa viagem entre o aceite e o
     * clique, e reofertá-la produziria o `already_linked` que a D1 acabou de aprender a pular.
     */
    retryWith: (nfeDocumentIds: readonly string[]) => {
      touch()
      const wanted = new Set(nfeDocumentIds)
      setPool((documentsQuery.data ?? []).filter((entry) => wanted.has(entry.id)))
      setOutcome(null)
      setIsOpen(true)
    },
    proposeMutation,
    acceptMutation,
    proposal,
    /** ⚠️ Enquanto houver remoção pendente o aceite é recusado: o que está na tela não é o que sairia. */
    isProposalEdited: pendingRemovals.size > 0,
    pendingRemovals,
    orderByVehicle,
    draftOrderByVehicle,
    displayStops,
    /** Caminhões com movimento em rascunho: eles pausam as três medições até alguém salvar. */
    draftMovedVehicleIds:
      proposal === null
        ? new Set<string>()
        : resolveMovedVehicleIds(proposal.stops, draftStopMoves),
    /** Caminhões alterados e salvos: a conta do roteirizador deixou de descrevê-los. */
    staleValuationVehicleIds: new Set([
      ...orderByVehicle.keys(),
      ...(proposal === null ? [] : resolveMovedVehicleIds(proposal.stops, stopMoves)),
    ]),
    /** ⚠️ Rascunho não salvo trava o aceite: a viagem nasceria como ninguém a viu medida. */
    hasUnsavedEdits: draftOrderByVehicle.size > 0 || draftStopMoves.size > 0,
    setVehicleOrderDraft: (vehicleId: string, order: readonly string[]) =>
      setDraftOrderByVehicle((current) => new Map([...current, [vehicleId, order]])),
    discardVehicleOrderDraft: (vehicleId: string) =>
      setDraftOrderByVehicle((current) => withoutVehicle(current, vehicleId)),
    moveStopDraft: (nfeDocumentIds: readonly string[], vehicleId: string) =>
      setDraftStopMoves(
        (current) => new Map([...current, ...nfeDocumentIds.map((id) => [id, vehicleId] as const)]),
      ),
    /**
     * ⚠️ **Um salvar só, para ordem e movimento.** Um movimento mexe em dois caminhões, e um salvar por
     * caminhão deixaria um salvo e o outro não — o aceite levaria meia mudança.
     */
    saveEdits: () => {
      if (proposal !== null) {
        setRouteChoiceByVehicle((current) =>
          forgetMovedVehicleRouteChoices({
            choices: current,
            committedMoves: stopMoves,
            draftMoves: draftStopMoves,
            stops: proposal.stops,
          }),
        )
      }
      setOrderByVehicle((current) => new Map([...current, ...draftOrderByVehicle]))
      setStopMoves((current) => new Map([...current, ...draftStopMoves]))
      setDraftOrderByVehicle(new Map())
      setDraftStopMoves(new Map())
    },
    discardEdits: () => {
      setDraftOrderByVehicle(new Map())
      setDraftStopMoves(new Map())
    },
    markStopRemoved: (nfeDocumentIds: readonly string[]) =>
      setPendingRemovals((current) => new Set([...current, ...nfeDocumentIds])),
    undoStopRemoval: (nfeDocumentIds: readonly string[]) =>
      setPendingRemovals((current) => {
        const next = new Set(current)
        for (const id of nfeDocumentIds) next.delete(id)
        return next
      }),
    /**
     * O par veículo→motorista tal como a proposta o enviou. ⚠️ Ele é a **fonte** de quem dirige na
     * linha da proposta: ler isso da conta fazia toda viagem dizer "Sem motorista" sem
     * `trip.financials`, numa distribuição em que o operador acabara de escolher seis motoristas.
     */
    driverIdByVehicleId: new Map(
      effectiveVehicleIds.flatMap((vehicleId) => {
        const driverId = resolveSoleDriverOfVehicle({ links, vehicleId })
        return driverId === null ? [] : [[vehicleId, driverId] as const]
      }),
    ),
    openVehicleId,
    selectedVehicleIds,
    setSelectedVehicleIds,
    toggleOpenVehicle: (vehicleId: string) =>
      setOpenVehicleId((current) => (current === vehicleId ? null : vehicleId)),
    /**
     * Descartar uma viagem da proposta é **desmarcá-la**: ela continua desenhada, e o operador vê o
     * que deixou de fora. Sumir com a linha esconderia a decisão que ele acabou de tomar.
     */
    discardVehicle: (vehicleId: string) =>
      setSelectedVehicleIds((current) => {
        const next = new Set(current)
        next.delete(vehicleId)
        return next
      }),
    /** Spec 108: descartar a proposta volta o operador ao formulário com a escolha dele intacta. */
    discardProposal: () => {
      rejectOnServer(proposal?.suggestion.id)
      setProposal(null)
      setIsOpen(true)
    },
    /**
     * "Limpar rascunho": a proposta em revisão, a guardada sem rede e a que a volta ainda não
     * aplicou são recusadas no servidor.
     */
    discardDraft: () => {
      for (const suggestionId of new Set([
        proposal?.suggestion.id,
        assemblyDraft.retainedSuggestionId,
        pendingSuggestionId ?? undefined,
        ...assemblyDraft.readUnrestoredSuggestionIds(),
      ])) {
        rejectOnServer(suggestionId)
      }
      resetAssembly()
      assemblyDraft.clear()
    },
    assemblyDraft,
    /** A espera caiu por rede com a sugestão ainda viva: retomar em vez de pedir outra. */
    canResumeSuggestion:
      pendingSuggestionId !== null && proposeMutation.isError && !proposeMutation.isPending,
    resumeSuggestion: () => {
      if (pendingSuggestionId !== null) proposeMutation.mutate(pendingSuggestionId)
    },
    routeChoiceByVehicle,
    bindings,
    availableDocuments: documentsQuery.data ?? [],
    documentsQuery,
    draft,
    issues,
    outcome,
    selection,
    setDriverIds: (driverIds: readonly string[]) => {
      touch()
      setDraft((current) => ({ ...current, driverIds }))
    },
    boundVehicleIds,
    effectiveVehicleIds,
    setVehicleIds: (vehicleIds: readonly string[]) => {
      touch()
      setDraft((current) => ({
        ...current,
        vehicleIds: toManualVehicleIds({ boundVehicleIds, nextVehicleIds: vehicleIds }),
      }))
    },
  }
}

export type TripRouteAssemblyController = ReturnType<typeof useTripRouteAssembly>

/**
 * Spec 108: descartar avisa a API (`reject`). ⚠️ A recusa remota é **melhor esforço**: falhar ali
 * não pode prender a tela numa proposta que o operador já rejeitou — a sugestão fica `ready` e
 * ninguém a aceita.
 */
function rejectOnServer(suggestionId: string | undefined): void {
  if (suggestionId === undefined) return
  void getRouteSuggestionClient()
    .rejectMultiVehicle({ suggestionId })
    .catch(() => undefined)
}

/** Os veículos que a proposta distribuiu, na ordem em que as paradas os nomeiam. */
function vehicleIdsOf(proposal: MultiVehicleProposal): readonly string[] {
  return [
    ...new Set(proposal.stops.flatMap((stop) => (stop.vehicleId === null ? [] : [stop.vehicleId]))),
  ]
}

function withoutVehicle<TValue>(
  orders: ReadonlyMap<string, TValue>,
  vehicleId: string,
): ReadonlyMap<string, TValue> {
  const next = new Map(orders)
  next.delete(vehicleId)
  return next
}
