/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { ScalePlan } from '@/components/ui/scale-plan'

import { buildCargoPlanView } from '../shared/cargoPlanBands.service'
import type { TripCargoLayout } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCargoPlanProps = Readonly<{ layout: TripCargoLayout | null }>

/** A tela da ficha do veículo. Navegação por `<a>`, como o atalho de notificações já faz. */
const FLEET_HREF = '/fleet'
/** A fila de medição da 085. O `tab` é lido na montagem da tela de notas (spec 088 R4). */
const BOX_QUEUE_HREF = '/?tab=boxes'

/** Metro com centímetro: é como se lê na fita, e é a precisão que a medida tem. */
const metreFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

/**
 * Spec 088: **onde encostar a carga de cada entrega.**
 *
 * A fileira da 085 respondia "cabe, e em que ordem entra". Ela é proporção, e proporção não tem
 * metro: não diz se a carga da terceira parada ocupa meio metro ou dois metros e meio de baú. Aqui
 * cada entrega vira uma faixa com profundidade em metros, na ordem inversa da descarga, sobre a
 * planta do baú em escala — e quem carrega passa a poder medir com a fita o que a tela mostra.
 *
 * ⚠️ **A faixa é espaço reservado por volume, não posição de caixa.** Com 6 de 663 caixas medidas,
 * empacotar caixa a caixa seria fabricar precisão; a divisão é ao longo do comprimento, que é como
 * um caminhão é carregado de verdade — faixa transversal, do fundo até a porta.
 *
 * ⚠️ Sem as três medidas na ficha do veículo **não há planta**, e a tela diz qual campo falta (R6).
 * A referência de mercado por tipo continua servindo à ocupação e não desenha nada: ela erra por 2×
 * dentro do mesmo tipo, e ali o erro deixaria de ser porcentagem e viraria metro no chão do galpão.
 */
export function TripCargoPlan({ layout }: TripCargoPlanProps) {
  const { t } = useTranslation('trip')
  const view = buildCargoPlanView(layout)

  if (view === null) {
    /** Sem layout nenhum não há o que avisar: o painel inteiro já está calado sobre a carga. */
    if (layout === null) return null

    /**
     * ⚠️ R6: nomear o campo não basta — quem lê está numa tela de montagem de viagem, e voltar à
     * ficha do veículo é um caminho que ele tem de descobrir sozinho. O atalho é o que separa um
     * aviso de uma instrução.
     */
    return (
      <p className={styles.hint}>
        {t('cargoPlan.missingBed')} {t('cargoPlan.missingBedField')}{' '}
        <a href={FLEET_HREF}>{t('cargoPlan.missingBedLink')}</a>
      </p>
    )
  }

  /**
   * ⚠️ Quantas caixas faltam medir, e **não** quantas faixas ficaram sem camada: `layers` nulo tem
   * duas causas, e a outra é caixa maior que a própria faixa — parada 100% medida. Contar por
   * `layers === null` mandava o conferente à fila procurar o que já tinha medido.
   */
  const boxesToMeasure = (layout?.slices ?? []).reduce(
    (total, slice) => total + slice.boxesToMeasure,
    0,
  )

  return (
    <>
      <h4 className={styles.hint}>{t('cargoPlan.title')}</h4>
      {/*
        ⚠️ A frase que impede a leitura errada, e ela é visível na tela — não um comentário no
        código. A planta parece um plano de estiva, e com 6 de 663 caixas medidas ela não é: quem
        a lesse como posição de peça carregaria seguindo um desenho que não sabe onde a caixa vai.
      */}
      <p className={styles.hint}>{t('cargoPlan.reserved')}</p>
      <ScalePlan
        ariaLabel={t('cargoPlan.ariaLabel', {
          length: metreFormatter.format(view.bed.lengthM),
          width: metreFormatter.format(view.bed.widthM),
        })}
        bands={view.bands}
        doorLabel={t('cargoPlan.door')}
        lengthM={view.bed.lengthM}
        widthM={view.bed.widthM}
      />

      {/* O desenho é decorativo; o metro de cada parada sai por extenso, e é ele que se anota. */}
      <ul className={styles.cargoLegend} role="list">
        {[...(layout?.slices ?? [])]
          .sort((first, second) => first.loadOrder - second.loadOrder)
          .map((slice) =>
            slice.depthM === null || slice.distanceFromDoorM === null ? null : (
              <li key={slice.sequence}>
                {/*
                  ⚠️ A distância sai como está, negativa inclusive: a política é explícita que
                  zerá-la faria a linha afirmar que a carga coube, que é a única coisa que ela não
                  pode dizer errado. Negativo aqui é o metro que atravessou a porta.
                */}
                {t(
                  Number.parseFloat(slice.distanceFromDoorM) < 0
                    ? 'cargoPlan.bandThroughDoor'
                    : 'cargoPlan.band',
                  {
                    depth: metreFormatter.format(Number.parseFloat(slice.depthM)),
                    distance: metreFormatter.format(
                      Math.abs(Number.parseFloat(slice.distanceFromDoorM)),
                    ),
                    label: slice.label,
                  },
                )}
                {slice.layers === null
                  ? null
                  : ` ${t('cargoPlan.layers', {
                      layers: slice.layers.layers,
                      perLayer: slice.layers.boxesPerLayer,
                    })}`}
              </li>
            ),
          )}
      </ul>

      {view.overflowM > 0 ? (
        <p className={styles.cargoOverflow} role="status">
          {t('cargoPlan.overflow', { metres: metreFormatter.format(view.overflowM) })}
        </p>
      ) : null}

      {boxesToMeasure > 0 ? (
        <p className={styles.hint}>
          {t('cargoPlan.unmeasuredBoxes', { count: boxesToMeasure })}{' '}
          <a href={BOX_QUEUE_HREF}>{t('cargoPlan.unmeasuredBoxesLink')}</a>
        </p>
      ) : null}

      {layout?.orderIsBinding === false ? (
        <p className={styles.hint}>{t('cargoPlan.sideReachable')}</p>
      ) : null}
    </>
  )
}
