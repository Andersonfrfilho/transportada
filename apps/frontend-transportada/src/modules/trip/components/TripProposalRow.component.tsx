/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import {
  buildDurationUnitLabels,
  formatDistance,
  formatDuration,
} from '@/modules/routing/shared/suggestionValuation.service'
import { formatAmount, formatWeightKilograms } from '@/modules/shared/decimalAmount.service'
import { VEHICLE_TYPE_ICONS } from '@/modules/shared/vehicleTypeIcon.service'
import { formatMargin, isNegative } from '@/modules/trip-financials/shared/financialView.service'

import { stopColorOf } from '../shared/stopColor.service'
import {
  isOverPayload,
  summarizeProposalCities,
  type ProposalVehicleView,
} from '../shared/proposalView.service'
import styles from '../styles/trip.module.css'

type TripProposalRowProps = Readonly<{
  children: React.ReactNode
  index: number
  isEdited: boolean
  isOpen: boolean
  isSelected: boolean
  onAccept: () => void
  onDiscard: () => void
  onRecalculate: () => void
  onToggleOpen: () => void
  onToggleSelected: () => void
  view: ProposalVehicleView
}>

/**
 * Spec 110 D2: **a linha decide sozinha.** Motorista no título, veículo e regiões nos subtítulos, e
 * os seis números à direita — na ordem em que a conta se lê: receita, despesas, lucro.
 */
export function TripProposalRow({
  children,
  index,
  isEdited,
  isOpen,
  isSelected,
  onAccept,
  onDiscard,
  onRecalculate,
  onToggleOpen,
  onToggleSelected,
  view,
}: TripProposalRowProps) {
  const { t } = useTranslation('trip')
  const { t: tRouting } = useTranslation('routing')
  const durationUnits = buildDurationUnitLabels(tRouting)
  const color = stopColorOf(index + 1)
  const cities = summarizeProposalCities(view.cities)
  /**
   * ⚠️ **Lucro é verde e prejuízo é vermelho, com ou sem conta incompleta** — como no razão logo
   * abaixo. O tom cobre de "incompleto" pintava o mesmo lucro de duas cores na mesma tela; o aviso de
   * parcela em falta é o texto da própria linha, não a cor do número.
   */
  const marginTone = isNegative(view.totalMargin ?? '0.00')
    ? styles.proposalExpenses
    : styles.proposalProfit

  return (
    <li className={`${styles.proposalRow} ${isOpen ? styles.proposalRowOpen : ''}`}>
      {/*
        ⚠️ A caixa fica **fora do gatilho**: botão dentro de botão não existe, e marcar uma viagem
        para aceitar não pode abrir um detalhe de trinta linhas.
      */}
      <span className={styles.proposalCheck}>
        <Checkbox
          ariaLabel={t('proposal.selectTrip', { driver: view.driverName ?? view.plate ?? '' })}
          checked={isSelected}
          onChange={onToggleSelected}
        />
      </span>

      <button className={styles.proposalTrigger} onClick={onToggleOpen} type="button">
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
        <span className={styles.proposalIdentity}>
          <span className={styles.proposalHeadline}>
            {/*
              ⚠️ Um elemento, dois fatos: a **cor** é a identidade da viagem — a mesma do traço no
              mapa e das fatias do baú — e o **desenho** é o tipo do caminhão. Dois elementos lado a
              lado diriam a mesma coisa em dobro, e o ponto colorido sozinho não diz que veículo é.
            */}
            <span className={styles.proposalMark} style={{ borderColor: color, color }}>
              {view.vehicleType === '' ? null : (
                <Icon name={VEHICLE_TYPE_ICONS[view.vehicleType]} />
              )}
            </span>
            <strong>{view.driverName ?? t('proposal.withoutDriver')}</strong>
            {view.plate === null ? null : (
              <span className={styles.proposalPlate}>{view.plate}</span>
            )}
            {view.vehicleLabel === null ? null : (
              <span className={styles.proposalVehicle}>{view.vehicleLabel}</span>
            )}
            {isEdited ? (
              <span className={styles.proposalEdited}>{t('proposal.edited')}</span>
            ) : null}
          </span>
          <span className={styles.proposalCities}>
            <Icon name="map-pin" />
            {cities.shown.join(' · ')}
            {cities.hidden === 0 ? '' : ` · ${t('proposal.moreCities', { count: cities.hidden })}`}
          </span>
        </span>

        <span className={styles.proposalMetrics}>
          <Metric label={t('proposal.deliveries')} value={String(view.deliveries)} />
          {/*
            ⚠️ **O peso acima do teto sai em vermelho, na linha fechada.** Medido em 2026-09-09: a
            Fiorino de 650 kg nasceu com 4.307 kg — 663% —, e a única marca disso vivia dentro do
            expandido, um veículo por vez. O peso declarado em MDF-e não admite tolerância
            (Res. CONTRAN 882/2021, Art. 49 §3º): quem aceita precisa ver antes de clicar.
          */}
          <Metric
            label={t('proposal.weight')}
            note={
              isOverPayload(view)
                ? t('proposal.overPayload', {
                    ceiling: formatWeightKilograms(view.maxPayloadKilograms ?? '0'),
                    percentage: Math.round((view.payloadRatio ?? 0) * 100),
                  })
                : view.weightEstimated
                  ? t('proposal.weightEstimated')
                  : null
            }
            noteTone={isOverPayload(view) ? styles.proposalExpenses : undefined}
            tone={isOverPayload(view) ? styles.proposalExpenses : undefined}
            value={
              view.weightKilograms === null
                ? t('proposal.unknown')
                : t('proposal.weightValue', {
                    weight: formatWeightKilograms(view.weightKilograms),
                  })
            }
          />
          {/* ⚠️ Sem conta, `—`: `R$ 0,00` diria que a viagem não rende nada e não custa nada. */}
          <Metric
            label={t('proposal.revenue')}
            /** Ausente fica sem cor: verde afirmaria uma receita que ninguém calculou. */
            tone={view.totalRevenue === null ? undefined : styles.proposalRevenue}
            value={money(view.totalRevenue, t)}
          />
          {/* Despesas em vermelho, lucro em verde: os dois se distinguem antes do rótulo. */}
          <Metric
            label={t('proposal.expenses')}
            note={view.hasGaps ? t('proposal.missingParcels') : null}
            tone={view.totalCost === null ? undefined : styles.proposalExpenses}
            value={money(view.totalCost, t)}
          />
          <Metric
            label={t('proposal.margin')}
            note={
              view.hasGaps
                ? t('proposal.incomplete')
                : (formatMargin(view.marginPercentage) ?? null)
            }
            tone={view.totalMargin === null ? undefined : marginTone}
            value={money(view.totalMargin, t)}
          />
          <Metric
            label={t('proposal.time')}
            note={formatDistance(view.distanceMeters)}
            value={formatDuration(view.durationSeconds, durationUnits) ?? t('proposal.unknown')}
          />
        </span>
      </button>

      {/*
        ⚠️ O espaço dos **três** botões fica reservado mesmo quando só dois aparecem: o de recalcular
        só existe na linha alterada, e sem a reserva as métricas das linhas vizinhas dançam
        horizontalmente quando ele entra.
      */}
      <span className={styles.proposalActions}>
        {isEdited ? (
          <Tooltip label={t('proposal.recalculate')}>
            <Button
              aria-label={t('proposal.recalculate')}
              onClick={onRecalculate}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="refresh" />
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip label={t('proposal.acceptOne')}>
          <Button aria-label={t('proposal.acceptOne')} onClick={onAccept} size="sm" type="button">
            <Icon name="check" />
          </Button>
        </Tooltip>
        <Tooltip label={t('proposal.discardOne', { count: view.deliveries })}>
          <Button
            aria-label={t('proposal.discardOne', { count: view.deliveries })}
            onClick={onDiscard}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </Tooltip>
      </span>

      {isOpen ? <div className={styles.proposalDetail}>{children}</div> : null}
    </li>
  )
}

function Metric({
  label,
  note = null,
  noteTone,
  tone,
  value,
}: Readonly<{
  label: string
  note?: null | string
  /** A nota herda o tom quando ela é a violação, não o rodapé do número. */
  noteTone?: string | undefined
  tone?: string | undefined
  value: string
}>) {
  return (
    <span className={styles.proposalMetric}>
      <span className={styles.proposalMetricLabel}>{label}</span>
      <span className={`${styles.proposalMetricValue} ${tone ?? ''}`.trim()}>{value}</span>
      {note === null ? null : (
        <span className={`${styles.proposalMetricNote} ${noteTone ?? ''}`.trim()}>{note}</span>
      )}
    </span>
  )
}

/** Ausência de conta é dita, nunca desenhada como zero — a regra que atravessa este produto. */
function money(value: null | string, translate: (key: string) => string): string {
  return value === null ? translate('proposal.unknown') : formatAmount(value)
}
