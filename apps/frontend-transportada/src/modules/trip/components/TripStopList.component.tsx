/* Copyright (c) 2026 Ada Technology. MIT License. */
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, buttonClassName } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import { NfseEmissionAction } from '@/modules/nfse-invoice/components/NfseEmissionAction.component'

import type { TripDocumentSelectionController } from '../hooks/useTripDocumentSelection.hook'
import { useTripStopOrder } from '../hooks/useTripStopOrder.hook'
import { resolveDocumentRowAction } from '../shared/documentRowAction.service'
import { readinessReasonIcon } from '../shared/readinessIcon.service'
import { canOfferStopFieldAction } from '../shared/tripFieldActions.service'
import type { FieldActionCapabilities } from '../shared/tripFieldActions.service'
import {
  hasTripDocumentFiscalWarning,
  tripDocumentLabel,
  tripDocumentReturnReasonCode,
} from '../shared/tripDocument.service'
import type {
  TripDocumentDetail,
  TripDocumentReadiness,
  TripStopDetail,
} from '../shared/trip.types'
import {
  countDocumentsWithOpenOccurrence,
  hasOpenOccurrenceMarker,
} from '../shared/occurrenceMarker.service'
import {
  buildTripTimelineDocumentAnchorId,
  buildTripTimelineStopAnchorId,
} from '../shared/tripTimelineLink.service'
import { TripArrivalDialog } from './TripArrivalDialog.component'
import {
  TripStopOccurrenceDialog,
  type TripStopOccurrenceSubmission,
} from './TripStopOccurrenceDialog.component'
import styles from '../styles/trip.module.css'

/** Spec 174 RF6: recusa e cancelamento são o que muda de cor — o resto é aviso neutro. */
const FISCAL_ALERT_REASONS = new Set(['cte_cancelled', 'cte_rejected'])

/**
 * Três portões distintos, não um: o domínio separa trabalho de barracão (separar/carregar, só
 * antes da saída e com roteiro planejado) de trabalho de rua (entregar/devolver, com autoria) — e
 * vincular/desvincular/desviar endereço segue um terceiro, o de `checkTripAcceptsLinkage`.
 *
 * Spec 156 T8b, ADR-0067: entregar/devolver deixam de ser `canManage && canDeliver/canReturn` (a
 * máquina de estados copiada no cliente) e passam a ser só `allowedActions` — a mesma fonte que
 * `TripFieldActions` já usa (D10). O botão nunca decide sozinho: se `capabilities` não trouxer a
 * ação, ela não aparece.
 */
export type TripStopDocumentActions = Readonly<{
  /**
   * Spec 156 T9: a ocorrência de campo é por nota (`allowed-actions`, capacidade `fieldOccurrence`)
   * — nunca um booleano só, porque a capacidade varia nota a nota dentro da mesma parada.
   */
  canFieldOccurrence: (documentId: string) => boolean
  /** Spec 156 T11: mesma ideia da ocorrência de campo — a capacidade varia nota a nota. */
  canFieldDelivery: (documentId: string) => boolean
  canManage: boolean
  /**
   * Spec 180: `trip.report-on-behalf` — o mesmo gate que já valia em `TripFieldActions`, agora
   * consumido aqui para oferecer "registrar chegada"/"registrar ocorrência" na própria parada.
   */
  canReportOnBehalf: boolean
  /**
   * A ocorrência de galpão (`separation`), ao contrário de `canFieldOccurrence`, não varia nota a
   * nota: `trip.manage`, viagem editável e o catálogo de tipos são da viagem inteira, não da nota.
   * Vale para toda nota, em qualquer status de separação.
   */
  canSeparationOccurrence: boolean
  canSeparateOrLoad: boolean
  /** Spec 174 RF7: sem `trip.submit-cte`, o estado fiscal aparece na linha e o botão não. */
  canSubmitCte: boolean
  /** Spec 175 RF7: gate próprio da nota que espera NFS-e — `nfse.issue`, separado do de CT-e. */
  canIssueNfse: boolean
  /** `allowedActions.documents[id]` — a mesma capacidade que `TripFieldActions` consome. */
  capabilities: FieldActionCapabilities
  /** Spec 174 RF1: a prontidão por nota, para a linha mostrar o próprio estado fiscal. */
  fiscalReadinessByDocumentId: ReadonlyMap<string, TripDocumentReadiness>
  isArrivePending: boolean
  isDeliverPending: boolean
  isEditable: boolean
  /** Spec 174 RF3: o mesmo pendente do lote — a linha e a barra de seleção nunca emitem ao mesmo tempo. */
  isGeneratingCte: boolean
  isOccurrencePending: boolean
  isReleasePending: boolean
  isReturnPending: boolean
  isTransitionPending: boolean
  /** Spec 180: registra a chegada nesta parada — o diálogo (`TripArrivalDialog`) mora nesta lista. */
  onArrive: (input: { arrivedAt: string; stopId: string }) => void
  onFieldDeliver: (documentId: string) => void
  onFieldReturn: (documentId: string) => void
  /** Spec 174 RF3: gera o CT-e só desta nota, sem passar pela seleção. */
  onGenerateCte: (documentId: string) => void
  /** A empresa e as permissões que a ação de NFS-e do módulo dono exige para se abrir. */
  companyId: string | undefined
  permissions: readonly string[]
  /** Depois da emissão a prontidão muda: sem isso a linha continuaria oferecendo o que já foi feito. */
  onNfseEmitted: () => void
  /** Spec 156 T9: abre `FieldOccurrenceDialog` para esta nota (ação da linha, não em massa). */
  onOpenFieldOccurrence: (documentId: string) => void
  /** Spec 156 T11: abre `FieldDeliveryWizard` para esta nota (ação da linha, não em massa). */
  onOpenFieldDelivery: (documentId: string) => void
  /** Abre `SeparationOccurrenceDialog` para esta nota (ação da linha, no galpão). */
  onOpenSeparationOccurrence: (documentId: string) => void
  /** Spec 079 T006/T025: abre e fecha o comprovante da nota. */
  onToggleProof: (documentId: string) => void
  openProofDocumentId: null | string
  renderProof: (documentId: string) => ReactNode
  onLoad: (documentId: string) => void
  onOverrideAddress: (documentId: string) => void
  /** Spec 180: registra a ocorrência desta parada — o diálogo (`TripStopOccurrenceDialog`) mora aqui. */
  onRegisterStopOccurrence: (input: TripStopOccurrenceSubmission & { stopId: string }) => void
  onRelease: (documentId: string) => void
  onSeparate: (documentId: string) => void
}>

type TripStopListProps = Readonly<{
  actions: TripStopDocumentActions
  canReorder: boolean
  onReorder: (stopIds: readonly string[]) => void
  selection: TripDocumentSelectionController
  stops: readonly TripStopDetail[]
}>

export function TripStopList({
  actions,
  canReorder,
  onReorder,
  selection,
  stops,
}: TripStopListProps) {
  const { t } = useTranslation('trip')
  const order = useTripStopOrder({ onReorder, stops })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const stopById = new Map(stops.map((stop) => [stop.id, stop]))
  const orderedStops = order.orderedIds
    .map((stopId) => stopById.get(stopId))
    .filter((stop): stop is TripStopDetail => stop !== undefined)
  /**
   * Spec 180: registrar chegada/ocorrência mudou de `TripFieldActions` para cá — um diálogo só para
   * a lista inteira (não um por parada), do mesmo jeito que o painel antigo já fazia.
   */
  const [arrivalStopId, setArrivalStopId] = useState<null | string>(null)
  const [occurrenceStopId, setOccurrenceStopId] = useState<null | string>(null)
  const occurrenceStop = occurrenceStopId === null ? undefined : stopById.get(occurrenceStopId)

  if (stops.length === 0) {
    return <p className={styles.hint}>{t('stops.empty')}</p>
  }

  const list = (
    <ul className={styles.stopList}>
      {orderedStops.map((stop) => (
        <TripStopCard
          actions={actions}
          canReorder={canReorder}
          key={stop.id}
          onOpenArrival={setArrivalStopId}
          onOpenOccurrence={setOccurrenceStopId}
          selection={selection}
          stop={stop}
        />
      ))}
    </ul>
  )

  const dialogs = (
    <>
      {/**
       * Spec 156 T15 A1: `dispatchedAt` ainda é `null` pela mesma razão de sempre — `GET /trips/:id`
       * não expõe `trip_dispatch_snapshots.dispatched_at` (pendência no `evidence.md` da T11).
       */}
      <TripArrivalDialog
        dispatchedAt={null}
        isOpen={arrivalStopId !== null}
        isSubmitting={actions.isArrivePending}
        onClose={() => setArrivalStopId(null)}
        onSubmit={(arrivedAt) => {
          if (arrivalStopId === null) return
          actions.onArrive({ arrivedAt, stopId: arrivalStopId })
          setArrivalStopId(null)
        }}
      />

      <TripStopOccurrenceDialog
        isOpen={occurrenceStop !== undefined}
        isSubmitting={actions.isOccurrencePending}
        onClose={() => setOccurrenceStopId(null)}
        onSubmit={(input) => {
          setOccurrenceStopId(null)
          if (occurrenceStop === undefined) return
          actions.onRegisterStopOccurrence({ ...input, stopId: occurrenceStop.id })
        }}
        stopDocuments={occurrenceStop?.documents ?? []}
      />
    </>
  )

  if (!canReorder) {
    return (
      <>
        {list}
        {dialogs}
      </>
    )
  }

  return (
    <>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={order.handleDragEnd}
        sensors={sensors}
      >
        <SortableContext items={[...order.orderedIds]} strategy={verticalListSortingStrategy}>
          {list}
        </SortableContext>
      </DndContext>
      {dialogs}
    </>
  )
}

type TripStopCardProps = Readonly<{
  actions: TripStopDocumentActions
  canReorder: boolean
  /** Spec 180: abre o `TripArrivalDialog` único da lista, marcado para esta parada. */
  onOpenArrival: (stopId: string) => void
  /** Spec 180: abre o `TripStopOccurrenceDialog` único da lista, marcado para esta parada. */
  onOpenOccurrence: (stopId: string) => void
  selection: TripDocumentSelectionController
  stop: TripStopDetail
}>

function TripStopCard({
  actions,
  canReorder,
  onOpenArrival,
  onOpenOccurrence,
  selection,
  stop,
}: TripStopCardProps) {
  const { t } = useTranslation('trip')
  const sortable = useSortable({ disabled: !canReorder, id: stop.id })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }
  const documentIds = stop.documents.map((document) => document.id)
  const allSelected =
    documentIds.length > 0 &&
    documentIds.every((documentId) => selection.selectedIds.has(documentId))
  const someSelected = documentIds.some((documentId) => selection.selectedIds.has(documentId))
  const canArrive = canOfferStopFieldAction({
    action: 'arrive',
    canReportOnBehalf: actions.canReportOnBehalf,
    capabilities: actions.capabilities,
    stopId: stop.id,
  })
  const canRegisterOccurrence = canOfferStopFieldAction({
    action: 'occurrence',
    canReportOnBehalf: actions.canReportOnBehalf,
    capabilities: actions.capabilities,
    stopId: stop.id,
  })

  return (
    <li
      className={styles.stopCard}
      data-revealed-panel
      id={buildTripTimelineStopAnchorId(stop.id)}
      ref={sortable.setNodeRef}
      style={style}
    >
      <div className={styles.stopCardHead}>
        {canReorder ? (
          <button
            aria-label={t('stops.reorderHandle', { label: stop.label })}
            className={styles.stopDragHandle}
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <Icon name="grip" />
          </button>
        ) : null}
        {/*
          ⚠️ Parada de uma nota só não ganha a caixa da parada: ela marcaria exatamente a mesma coisa
          que a caixa da linha logo abaixo, e duas seleções coladas para o mesmo item confundiam.
        */}
        {documentIds.length > 1 ? (
          <Checkbox
            ariaLabel={t('stops.selectAll', { label: stop.label })}
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onChange={(checked) => selection.toggleMany(documentIds, checked)}
          />
        ) : null}
        <span className={styles.stopSequence}>{stop.sequence}</span>
        <span className={styles.stopLabel}>{stop.label}</span>
        <span className={styles.stopCounter}>
          {t('stops.documentCount', { count: stop.documents.length })}
        </span>
        {/*
         * Spec 173: a parada marca quando alguma nota dela tem tratativa aberta. O dado chega da
         * API desde a spec 164 T15 e a tela o ignorava — era preciso abrir nota por nota.
         */}
        {stop.hasOpenOccurrence === true ? (
          <span className={styles.openOccurrenceBadge}>
            <Icon name="alert" size="sm" />
            {t('stops.openOccurrence', {
              count: countDocumentsWithOpenOccurrence(stop.documents),
            })}
          </span>
        ) : null}
        <StopExecution stop={stop} />
        {/*
         * Spec 180: as duas ações de campo por parada — vieram de `TripFieldActions`, que existia só
         * para elas. Mesmo gate de lá (`canReportOnBehalf` + capacidade da parada), só que na linha
         * que o escritório já olha para tudo o mais desta parada.
         */}
        {canArrive ? (
          <Button
            disabled={actions.isArrivePending}
            onClick={() => onOpenArrival(stop.id)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="check" />
            {t('fieldActions.arrive')}
          </Button>
        ) : null}
        {canRegisterOccurrence ? (
          <Button onClick={() => onOpenOccurrence(stop.id)} size="sm" type="button" variant="ghost">
            <Icon name="alert" />
            {t('fieldActions.occurrence')}
          </Button>
        ) : null}
      </div>

      <TripStopDocumentGroup actions={actions} documents={stop.documents} selection={selection} />
    </li>
  )
}

/**
 * Spec 057 P2: o que aconteceu na rua, na mesma linha da parada. Sem isto o escritório continua
 * descobrindo a entrega quando o motorista volta ao barracão — que é o problema que a 057 abriu.
 */
function StopExecution({ stop }: Readonly<{ stop: TripStopDetail }>) {
  const { t } = useTranslation('trip')
  if (stop.arrivedAt === null) return null

  return (
    <span className={styles.stopCounter}>
      {stop.completedAt === null
        ? t('stops.arrivedAt', { time: formatStopTime(stop.arrivedAt) })
        : t('stops.completedAt', { time: formatStopTime(stop.completedAt) })}
    </span>
  )
}

/** Hora e minuto: o dia é o da viagem, e a data por extenso só rouba espaço da linha. */
function formatStopTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function TripStopDocumentGroup({
  actions,
  documents,
  selection,
}: Readonly<{
  actions: TripStopDocumentActions
  documents: readonly TripDocumentDetail[]
  selection: TripDocumentSelectionController
}>) {
  return (
    <ul className={styles.stopDocumentList}>
      {documents.map((document) => (
        <TripStopDocumentRow
          actions={actions}
          document={document}
          key={document.id}
          selection={selection}
        />
      ))}
    </ul>
  )
}

function TripStopDocumentRow({
  actions,
  document,
  selection,
}: Readonly<{
  actions: TripStopDocumentActions
  document: TripDocumentDetail
  selection: TripDocumentSelectionController
}>) {
  const { t } = useTranslation('trip')
  const fiscalReadiness = actions.fiscalReadinessByDocumentId.get(document.id)
  const rowAction = resolveDocumentRowAction(fiscalReadiness, {
    canIssueNfse: actions.canIssueNfse,
    canSubmitCte: actions.canSubmitCte,
  })
  /**
   * Spec 181 RF3/CA03: o selo de pipeline carrega o motivo da devolução junto ("Devolvida ·
   * Ausente"), traduzido — em vez de um selo e uma frase separada repetindo o mesmo fato.
   */
  const returnReasonCode = tripDocumentReturnReasonCode(document)
  const separationStatusLabel =
    returnReasonCode === null
      ? t(`separationStatus.${document.separationStatus}`)
      : t('stops.separationStatusWithReason', {
          reason: t(`fieldActions.returnReason.${returnReasonCode}`, {
            defaultValue: returnReasonCode,
          }),
          status: t(`separationStatus.${document.separationStatus}`),
        })
  /**
   * Spec 181 RF4/T304: contratante, regra fiscal e telefone são dado de confirmação, não de
   * triagem — vão para a expansão da nota. `hasNoteDetail` decide **se** existe o quê: sem contato
   * e sem regra de frete, a nota não oferece o disclosure vazio (mesma regra da CA07/CA16).
   */
  const hasNoteDetail =
    (document.contact !== null && document.contact !== undefined) ||
    (document.freightRuleName !== null && document.freightRuleName !== undefined)
  const [isDetailExpanded, setIsDetailExpanded] = useState(false)
  const detailId = `trip-stop-document-detail-${document.id}`
  const proofId = `trip-stop-document-proof-${document.id}`
  const isProofOpen = actions.openProofDocumentId === document.id

  return (
    <li
      className={
        hasTripDocumentFiscalWarning(document)
          ? `${styles.stopDocumentRow} ${styles.warningRow}`
          : styles.stopDocumentRow
      }
      data-revealed-panel
      id={buildTripTimelineDocumentAnchorId(document.id)}
    >
      <div className={styles.stopDocumentHead}>
        <span className={styles.stopDocumentCheckboxColumn}>
          <Checkbox
            ariaLabel={t('stops.selectDocument', { document: tripDocumentLabel(document) })}
            checked={selection.selectedIds.has(document.id)}
            onChange={() => selection.toggle(document.id)}
          />
        </span>
        <span className={styles.stopDocumentLabel}>{tripDocumentLabel(document)}</span>
        <div className={styles.stopDocumentBadgeRow}>
          <span className={styles.separationStatusBadge}>{separationStatusLabel}</span>
          {/*
           * Spec 181 RF2/CA02: o marcador de ocorrência aberta e `openOccurrenceCase === true` são
           * a mesma condição booleana (proposta-ux.md item 4) — um selo só, clicável, leva direto
           * ao diálogo da ocorrência. Dois selos aqui voltariam a dizer o mesmo fato duas vezes.
           */}
          {hasOpenOccurrenceMarker(document) ? (
            <Tooltip label={t('occurrence.openCaseHint')}>
              <Button
                className={styles.occurrenceCaseBadge}
                onClick={() => actions.onOpenSeparationOccurrence(document.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="alert" size="sm" />
                {t('occurrence.openCase')}
              </Button>
            </Tooltip>
          ) : null}
          {/*
           * Spec 174 RF1/RF2/RF6: o estado fiscal é **da nota** — ícone e texto na linha dela,
           * nunca só a cor, com a explicação pelo tooltip do design system. Nota pronta ou que não
           * espera documento fiscal não ganha selo (ausência é silêncio, não "nada a fazer").
           */}
          {fiscalReadiness !== undefined && fiscalReadiness.reason !== 'ok' ? (
            <Tooltip label={fiscalStatusLabel(fiscalReadiness, t)}>
              <span
                className={
                  FISCAL_ALERT_REASONS.has(fiscalReadiness.reason)
                    ? `${styles.fiscalStatusBadge} ${styles.fiscalStatusBadgeAlert}`
                    : styles.fiscalStatusBadge
                }
              >
                <Icon name={readinessReasonIcon(fiscalReadiness.reason)} size="sm" />
                <span className={styles.fiscalStatusText}>
                  {fiscalStatusLabel(fiscalReadiness, t)}
                </span>
              </span>
            </Tooltip>
          ) : null}
          {hasTripDocumentFiscalWarning(document) ? (
            <span className={styles.fiscalWarning}>{t('detail.fiscalWarning')}</span>
          ) : null}
          {/*
           * Spec 073 CA10: a marca aparece **só** no endereço de entrega. Em 345 de 345 notas
           * reais o endereço é o do cadastro — imprimir "Cadastro" em todas seria ruído que apaga
           * justamente a linha que explica por que o motorista foi a outro portão.
           */}
          {document.destinationOrigin === 'delivery' ? (
            <span
              className={styles.destinationOriginBadge}
              title={t('destinationOrigin.deliveryHint')}
            >
              {t('destinationOrigin.delivery')}
            </span>
          ) : null}
        </div>
      </div>
      {/*
       * Spec 181 RF1/RF4: dinheiro e pessoas em blocos rotulados — `repeat(auto-fit, minmax(...))`
       * porque quantos blocos cabem lado a lado depende do espaço disponível, não de um breakpoint
       * fixo. Só o nome de quem recebe fica à frente; telefone/contratante/regra vão para a
       * expansão (T304) — são dado de confirmação, não de triagem.
       */}
      <div className={styles.stopDocumentGrid}>
        {/*
         * ⚠️ Mercadoria, frete e data são condições **irmãs**, nunca aninhadas: existe nota sem
         * `nfeTotalValue` (vínculo que é só cálculo de frete), e é justamente nela que o frete — ou
         * o aviso de que ele falta — é a única informação útil. Aninhar fazia o grupo inteiro sumir
         * com a mercadoria.
         */}
        {document.nfeTotalValue === null || document.nfeTotalValue === undefined ? null : (
          <div className={styles.stopDocumentGroup}>
            <span className={styles.stopDocumentGroupLabel}>{t('stops.moneyGroupLabel')}</span>
            <span className={styles.stopDocumentMeta}>
              {t('stops.cargoValue', { amount: formatAmount(document.nfeTotalValue) })}
            </span>
          </div>
        )}
        {/*
         * Spec 176: o frete **da nota**, nunca a mercadoria. `estimated` marca a previsão;
         * `measured` não precisa de selo. Sem valor e sem regra, a ausência é dita em texto —
         * nunca `R$ 0,00`.
         */}
        {document.freightAmount === null || document.freightAmount === undefined ? (
          document.freightSource === 'missing' ? (
            <div className={styles.stopDocumentGroup}>
              <span className={styles.stopDocumentGroupLabel}>{t('stops.freightGroupLabel')}</span>
              <span className={styles.stopDocumentMeta}>{t('stops.freight.missing')}</span>
            </div>
          ) : null
        ) : (
          <div className={styles.stopDocumentGroup}>
            <span className={styles.stopDocumentGroupLabel}>{t('stops.freightGroupLabel')}</span>
            <span className={styles.stopDocumentMeta}>
              {t('stops.freight.amount', { amount: formatAmount(document.freightAmount) })}
              {document.freightSource === 'estimated' ? ` (${t('stops.freight.estimated')})` : ''}
            </span>
          </div>
        )}
        {document.nfeIssuedAt === null || document.nfeIssuedAt === undefined ? null : (
          <div className={styles.stopDocumentGroup}>
            <span className={styles.stopDocumentGroupLabel}>{t('stops.issuedGroupLabel')}</span>
            <span className={styles.stopDocumentMeta}>{formatDay(document.nfeIssuedAt)}</span>
          </div>
        )}
        {document.contact === null || document.contact === undefined ? null : (
          <div className={styles.stopDocumentGroup}>
            <span className={styles.stopDocumentGroupLabel}>{t('stops.peopleGroupLabel')}</span>
            <span className={styles.stopDocumentMeta}>
              {t('contact.recipient', { name: document.contact.name })}
            </span>
          </div>
        )}
      </div>
      <div className={styles.rowActions}>
        {/*
         * Spec 175 RF1/RF2/RF4/RF7: uma ação só, e o rótulo sai do documento que a nota espera —
         * `cte` emite direto (spec 174 RF3), `nfse` abre o diálogo do módulo dono. Sem documento
         * decidido não se oferece nada: o selo já explica o motivo.
         */}
        {rowAction?.kind === 'cte' ? (
          <Button
            disabled={actions.isGeneratingCte}
            onClick={() => actions.onGenerateCte(document.id)}
            size="sm"
            type="button"
          >
            <Icon name="send" />
            {t('actions.generateCte')}
          </Button>
        ) : null}
        {rowAction?.kind === 'nfse' && fiscalReadiness?.nfeDocumentId != null ? (
          /*
           * O componente de ação é do módulo dono da NFS-e, e é ele que decide estado interno,
           * permissão e abertura do diálogo. A linha só empresta o estilo do botão do design
           * system — emitir daqui seria emitir contra um perfil que ninguém escolheu.
           *
           * Sem id da nota não há ação: o id desta linha é de `trip_documents`, e a emissão de
           * NFS-e recebe `nfe_documents`. Usá-lo como reserva mandaria um id de outro espaço.
           */
          <NfseEmissionAction
            className={buttonClassName({ size: 'sm' })}
            {...(actions.companyId === undefined ? {} : { companyId: actions.companyId })}
            documentIds={[fiscalReadiness.nfeDocumentId]}
            onEmitted={actions.onNfseEmitted}
            permissions={actions.permissions}
          />
        ) : null}
        {actions.canManage &&
        actions.canSeparateOrLoad &&
        document.separationStatus === 'pending' ? (
          <Button
            disabled={actions.isTransitionPending}
            onClick={() => actions.onSeparate(document.id)}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('actions.separate')}
          </Button>
        ) : null}
        {actions.canManage &&
        actions.canSeparateOrLoad &&
        document.separationStatus === 'separated' ? (
          <Button
            disabled={actions.isTransitionPending}
            onClick={() => actions.onLoad(document.id)}
            size="sm"
            type="button"
          >
            <Icon name="truck" />
            {t('actions.load')}
          </Button>
        ) : null}
        {/*
         * Spec 181 T203: a ação mais provável primeiro — numa nota carregada, "marcar entregue" é
         * o acerto fácil, e "devolver" não deve ocupar essa posição.
         */}
        {actions.capabilities.canDocument(document.id, 'fieldDelivery') ? (
          <Button
            disabled={actions.isDeliverPending}
            onClick={() => actions.onFieldDeliver(document.id)}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('actions.deliver')}
          </Button>
        ) : null}
        {actions.capabilities.canDocument(document.id, 'fieldReturn') ? (
          <Button
            disabled={actions.isReturnPending}
            onClick={() => actions.onFieldReturn(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="arrow-up" />
            {t('actions.return')}
          </Button>
        ) : null}
        {actions.canManage && actions.isEditable ? (
          <Button
            disabled={actions.isReleasePending}
            onClick={() => actions.onRelease(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="remove" />
            {t('actions.release')}
          </Button>
        ) : null}
        {actions.canManage && actions.isEditable ? (
          <Button
            onClick={() => actions.onOverrideAddress(document.id)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="edit" />
            {t('deliveryOverride.menuAction')}
          </Button>
        ) : null}
        {actions.canSeparationOccurrence ? (
          <Button
            onClick={() => actions.onOpenSeparationOccurrence(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="alert" />
            {t('actions.separationOccurrence')}
          </Button>
        ) : null}
        {actions.canFieldOccurrence(document.id) ? (
          <Button
            onClick={() => actions.onOpenFieldOccurrence(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="alert" />
            {t('actions.fieldOccurrence')}
          </Button>
        ) : null}
        {actions.canFieldDelivery(document.id) ? (
          <Button
            onClick={() => actions.onOpenFieldDelivery(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="camera" />
            {t('actions.fieldDelivery')}
          </Button>
        ) : null}
      </div>
      {/*
       * Spec 181 RF1/T302: as duas expansões da nota reusam o padrão da spec 180 (`aria-expanded`/
       * `aria-controls`, chevron, teclado, 44px) — nunca um segundo jeito de expandir.
       */}
      {document.deliveredAt === null && document.returnedAt === null ? null : (
        <Button
          aria-controls={proofId}
          aria-expanded={isProofOpen}
          className={styles.stopDocumentToggle}
          onClick={() => actions.onToggleProof(document.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name={isProofOpen ? 'chevron-up' : 'chevron-down'} />
          {t('actions.viewProof')}
        </Button>
      )}
      {isProofOpen ? <div id={proofId}>{actions.renderProof(document.id)}</div> : null}
      {/*
       * Spec 181 T304: contratante, regra fiscal e telefone são dado de confirmação — ficam na
       * expansão, e a ausência de telefone não ocupa espaço na frente do card.
       */}
      {hasNoteDetail ? (
        <Button
          aria-controls={detailId}
          aria-expanded={isDetailExpanded}
          className={styles.stopDocumentToggle}
          onClick={() => setIsDetailExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name={isDetailExpanded ? 'chevron-up' : 'chevron-down'} />
          {isDetailExpanded ? t('stops.detailCollapse') : t('stops.detailExpand')}
        </Button>
      ) : null}
      {hasNoteDetail && isDetailExpanded ? (
        <div className={styles.stopDocumentDetailGroup} id={detailId}>
          {document.contact === null || document.contact === undefined ? null : (
            <>
              <span className={styles.stopDocumentMeta}>
                {document.contact.phone === null
                  ? t('contact.withoutPhone')
                  : t('contact.phone', { phone: document.contact.phone })}
              </span>
              {document.contact.contractorName === null ? null : (
                <span className={styles.stopDocumentMeta}>
                  {t('contact.contractor', { name: document.contact.contractorName })}
                </span>
              )}
            </>
          )}
          {document.freightRuleName === null || document.freightRuleName === undefined ? null : (
            <span className={styles.stopDocumentMeta}>
              {t('stops.freight.rule', { name: document.freightRuleName })}
            </span>
          )}
        </div>
      ) : null}
    </li>
  )
}

/** Spec 174 RF6: código e mensagem da SEFAZ juntos — é o que diz o que fazer com a rejeição. */
function fiscalStatusLabel(entry: TripDocumentReadiness, t: (key: string) => string): string {
  const reasonLabel = t(`readiness.reason.${entry.reason}`)
  if (entry.rejectionCode === null) return reasonLabel

  const detail =
    entry.rejectionMessage === null
      ? entry.rejectionCode
      : `${entry.rejectionCode}: ${entry.rejectionMessage}`
  return `${reasonLabel} — ${detail}`
}

const amountFormatter = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
})

const dayFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

function formatAmount(value: string): string {
  return amountFormatter.format(Number.parseFloat(value))
}

function formatDay(value: string): string {
  return dayFormatter.format(new Date(value))
}
