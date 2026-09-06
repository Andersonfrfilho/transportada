/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { VEHICLE_TYPE_ICONS } from '@/modules/shared/vehicleTypeIcon.service'
import type { VehicleType } from '@/modules/shared/vehicleType.constant'

import type {
  TripCargoLayout,
  TripCargoWeight,
  TripOccupancy,
  TripWeightConcentration,
} from '../shared/trip.types'
import styles from '../styles/trip.module.css'
import { stopColorOf } from '../shared/stopColor.service'

type TripCargoPanelProps = {
  cargoWeight: TripCargoWeight | null
  layout: TripCargoLayout | null
  occupancy: TripOccupancy | null
  /** O tipo do veículo escolhido, para a cabine ser a dele. Vazio cai no desenho genérico. */
  vehicleType?: VehicleType | ''
  /** A parada que carrega mais que a própria fatia do peso; o desenho é de volume e não a mostra. */
  weightConcentration?: TripWeightConcentration | null
}

const PERCENT_SCALE = 100

/**
 * Duas casas, vírgula decimal e separador de milhar — a escala do banco é seis, e imprimir
 * `2.250000 m³` faz o operador ler a precisão como exatidão que o número não tem: ele é estimado.
 */
const volumeFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

/** Medida de baú tem centímetro: duas casas bastam, e `3,20 × 1,65 × 1,90 m` é como se lê na fita. */
const lengthFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

const weightFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

function formatVolume(value: string): string {
  return volumeFormatter.format(Number.parseFloat(value))
}

/** O índice é 0-based aqui; a paleta é numerada a partir de 1, e a conversão é da chamada. */
function colorOf(index: number): string {
  return stopColorOf(index + 1)
}

/**
 * A carga da viagem **num painel só**: quanto do baú foi ocupado, quanto pesa e como ela se
 * distribui pelas paradas. Eram dois blocos que diziam metade cada um — a ocupação sem saber de
 * quem era o espaço, e o desenho sem o número que ele ilustra —, e a marca de estimativa aparecia
 * duas vezes.
 *
 * ⚠️ **É representação proporcional, não plano de estiva.** A NF-e não traz dimensão de volume — a
 * cubagem é estimada e é um total por nota, não a caixa —, então **não existe como dizer onde cada
 * caixa vai**. A diferença entre "esta fatia do baú é da parada 3" e "esta caixa vai neste canto" é
 * a diferença entre ajudar e enganar, e é por isso que o desenho não sugere posição de peça.
 *
 * Ausência é ausência: sem capacidade conhecida a ocupação não aparece, em vez de mostrar 0% ou
 * 100%; sem cubagem não se desenha o baú.
 */
export function TripCargoPanel({
  cargoWeight,
  layout,
  occupancy,
  vehicleType = '',
  weightConcentration = null,
}: TripCargoPanelProps) {
  const { t } = useTranslation('trip')
  if (occupancy === null) return <TripCargoWeightPanel cargoWeight={cargoWeight} />

  const percent = Math.round(Number.parseFloat(occupancy.occupancyRatio) * PERCENT_SCALE)
  /**
   * ⚠️ Spec 085 G006: a marca é **obrigatória** em toda origem que não é medida. Imprimir o
   * percentual sozinho é o que faz alguém confiar num baú que não cabe, e
   * `test/trip/occupancy.contract.ts` reprova o componente se ela sumir.
   */
  const originHint =
    occupancy.source === 'estimated'
      ? t('occupancy.estimated')
      : occupancy.source === 'partial'
        ? t('occupancy.partial')
        : null
  const dimensions = occupancy.capacityDimensions

  return (
    <section aria-labelledby="trip-cargo-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-cargo-title">
        {t('cargo.title')}
      </h3>
      <p>
        <strong>{t('occupancy.ratio', { percent })}</strong>{' '}
        <span>
          {t('occupancy.loaded', {
            capacity: formatVolume(occupancy.capacityM3),
            loaded: formatVolume(occupancy.loadedM3),
          })}
        </span>
      </p>
      {dimensions === null ? null : (
        <p className={styles.hint}>
          {t('occupancy.dimensions', {
            height: lengthFormatter.format(Number.parseFloat(dimensions.heightM)),
            length: lengthFormatter.format(Number.parseFloat(dimensions.lengthM)),
            volume: formatVolume(occupancy.capacityM3),
            width: lengthFormatter.format(Number.parseFloat(dimensions.widthM)),
          })}
        </p>
      )}
      {originHint === null ? null : <p className={styles.hint}>{originHint}</p>}
      {weightConcentration === null ? null : (
        <p className={styles.hint}>
          {t('occupancy.weightConcentration', {
            percent: Math.round(weightConcentration.share * PERCENT_SCALE),
            stop: weightConcentration.stopId,
          })}
        </p>
      )}
      {occupancy.capacitySource === 'reference' ? (
        <p className={styles.hint}>{t('occupancy.capacityReference')}</p>
      ) : null}
      {occupancy.documentsWithoutVolume > 0 ? (
        <p className={styles.hint}>
          {t('occupancy.withoutVolume', { count: occupancy.documentsWithoutVolume })}
        </p>
      ) : null}

      <TripCargoWeightLines cargoWeight={cargoWeight} />
      <TripCargoDrawing layout={layout} vehicleType={vehicleType} />
    </section>
  )
}

/**
 * O baú desenhado de lado, com a cabine à esquerda e a porta à direita. As fatias entram na **ordem
 * de carregamento** — a última parada da rota viaja no fundo, colada à cabine —, que é a ordem em
 * que o operador enche o caminhão.
 *
 * ⚠️ A fatia é a **proporção de volume da parada**, não a caixa: ela não diz altura, não diz pilha
 * e não diz canto. Quem mexer aqui não deve fazê-la sugerir posição de peça.
 */
function TripCargoDrawing({
  layout,
  vehicleType,
}: {
  layout: TripCargoLayout | null
  vehicleType: VehicleType | ''
}) {
  const { t } = useTranslation('trip')
  if (layout === null) return null

  /** Uma entrada por parada, na ordem de carregamento — é ela que dá a cor e alimenta a legenda. */
  const stops = [...new Map(layout.rows.map((row) => [row.sequence, row])).values()].sort(
    (first, second) => first.loadOrder - second.loadOrder,
  )
  const colorBySequence = new Map(stops.map((stop, index) => [stop.sequence, colorOf(index)]))

  return (
    <>
      {/*
        ⚠️ O texto muda com a porta: com lateral a ordem **ajuda** e não obriga, e ler uma exigência
        onde há sugestão faz o conferente descarregar carga que ele podia alcançar pelo lado.
      */}
      <p className={styles.hint}>
        {t(layout.orderIsBinding ? 'cargoLayout.loadOrderHint' : 'cargoLayout.loadOrderOptional')}
      </p>

      {/* O desenho é decorativo: a mesma informação sai na lista abaixo, para leitor de tela e impressão. */}
      <div aria-hidden="true" className={styles.truck}>
        {/*
          ⚠️ A cabine é o **ícone do tipo do veículo escolhido**, não um desenho genérico: o
          operador reconhece o VUC antes de ler a placa. Implemento tem `vehicleType` vazio — o tipo
          é de quem traciona —, e aí a cabine volta ao retângulo.
        */}
        <div className={styles.truckCab}>
          {vehicleType === '' ? null : (
            <Icon className={styles.truckSilhouette ?? ''} name={VEHICLE_TYPE_ICONS[vehicleType]} />
          )}
          <span className={styles.truckWheel} />
        </div>
        <div className={styles.cargoBox}>
          {layout.rows.map((row, index) => (
            <div
              className={row.sideReachable ? styles.cargoRowSide : styles.cargoRow}
              key={`${String(row.sequence)}-${String(index)}`}
              style={{ backgroundColor: colorBySequence.get(row.sequence) }}
            >
              {/*
                O número sai **uma vez por bloco**, não por fileira: repetido em cada uma ele vira
                ruído e some justamente onde a parada ocupa mais espaço.
              */}
              {layout.rows[index - 1]?.sequence === row.sequence ? null : (
                <span className={styles.cargoRowOrder}>{row.loadOrder}</span>
              )}
            </div>
          ))}
          {Array.from({ length: layout.freeRows }, (_, index) => (
            <div className={styles.cargoRowFree} key={`livre-${String(index)}`} />
          ))}
          <span className={styles.truckWheel} />
        </div>
      </div>
      <p className={styles.truckEnds} aria-hidden="true">
        <span>{t('cargoLayout.bottom')}</span>
        <span>{t('cargoLayout.door')}</span>
      </p>

      <ul className={styles.cargoLegend} role="list">
        {stops.map((stop) => (
          <li key={stop.sequence}>
            <span
              aria-hidden="true"
              className={styles.cargoSwatch}
              style={{ backgroundColor: colorBySequence.get(stop.sequence) }}
            />
            {t('cargoLayout.stop', { label: stop.label, order: stop.loadOrder })}
          </li>
        ))}
      </ul>

      {Number.parseFloat(layout.overflowM3) > 0 ? (
        <p className={styles.cargoOverflow} role="status">
          {t('cargoLayout.overflow', { volume: formatVolume(layout.overflowM3) })}
        </p>
      ) : null}

      {layout.stopsWithoutVolume.length > 0 ? (
        <p className={styles.hint}>
          {t('cargoLayout.withoutVolume', {
            stops: layout.stopsWithoutVolume.map((stop) => stop.label).join(', '),
          })}
        </p>
      ) : null}
    </>
  )
}

/**
 * ⚠️ **A marca de estimativa nunca sai do lado do número**, pela mesma razão da ocupação: o peso
 * pode vir de `qVol × padrão da empresa` em vez do `pesoB` do emitente, e um número sem a marca lê
 * como declarado.
 *
 * **Não há percentual.** A ficha do veículo não guarda capacidade em massa; um teto inventado para
 * produzir porcentagem é o número que faria alguém parar de carregar, ou continuar.
 */
function TripCargoWeightLines({ cargoWeight }: { cargoWeight: TripCargoWeight | null }) {
  const { t } = useTranslation('trip')
  if (cargoWeight === null) return null

  const isWeightEstimated = cargoWeight.source === 'estimated'

  return (
    <>
      <p>
        <strong>{t('cargoWeight.title')}</strong>{' '}
        <span>
          {t('cargoWeight.total', {
            weight: weightFormatter.format(Number.parseFloat(cargoWeight.grossWeightKilograms)),
          })}
        </span>
      </p>
      {isWeightEstimated ? <p className={styles.hint}>{t('cargoWeight.estimated')}</p> : null}
      {cargoWeight.documentsWithoutWeight > 0 ? (
        <p className={styles.hint}>
          {t('cargoWeight.withoutWeight', { count: cargoWeight.documentsWithoutWeight })}
        </p>
      ) : null}
    </>
  )
}

/**
 * Veículo sem cubagem cadastrada é o caso comum, e o peso continua sendo o que se quer ler — por
 * isso ele tem painel próprio quando a ocupação não desenha nada.
 */
function TripCargoWeightPanel({ cargoWeight }: { cargoWeight: TripCargoWeight | null }) {
  const { t } = useTranslation('trip')
  if (cargoWeight === null) return null

  return (
    <section aria-labelledby="trip-cargo-weight-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-cargo-weight-title">
        {t('cargoWeight.title')}
      </h3>
      <TripCargoWeightLines cargoWeight={cargoWeight} />
    </section>
  )
}
