/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { CargoIsometric, type IsometricBox } from '@/components/ui/cargo-isometric'

import {
  applyViewPreset,
  DEFAULT_CARGO_VIEW,
  dragView,
  panViewBy,
  rotateView,
  zoomViewBy,
  type CargoViewPreset,
} from '../shared/cargoView.service'
import { stopColorOf } from '../shared/stopColor.service'
import { isMostlyPresumed, resolveSliceCuts } from '../shared/cargoLegend.service'
import { buildCargoChipFacts, buildCargoPrintSummary } from '../shared/cargoPrintSummary.service'
import { EMPTY_STOP_FOCUS, isStopLit, toggleStopFocus } from '../shared/stopFocus.service'
import { buildCargoStopLabels, formatCargoStopLabel } from '../shared/cargoStopLabel.service'
import type { TripCargoLayout } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

/** A ficha do veículo, onde as três medidas do baú são preenchidas. */
const FLEET_HREF = '/fleet'

type TripCargoLayersProps = Readonly<{
  layout: TripCargoLayout | null
  /**
   * Muda a parada de posição na **ordem de carregamento** (`-1` carrega antes, `1` depois). Ausente,
   * a ficha é só leitura — é o caso da viagem já criada.
   */
  onLoadingMove?: ((stopSequence: number, direction: -1 | 1) => void) | undefined
}>

/**
 * Spec 094: **onde cada caixa cabe**, camada por camada.
 *
 * ⚠️ A promessa é **"cabe"**, nunca "deve ir assim" — e a tela diz isso numa linha fixa. Faltam
 * empilhabilidade informada em toda caixa, peso por caixa e peso por eixo; sem eles o desenho mostra
 * um arranjo possível, não uma instrução de carregamento. Um plano de estiva que não conhece o peso
 * por eixo é o defeito que a 085 evitou, com outra roupa.
 *
 * ⚠️ Uma camada por vez, com navegação. Todas de uma vez seriam seis plantas empilhadas na tela do
 * celular de quem está no galpão — e o carregamento é feito uma camada por vez, que é a razão de o
 * desenho ser assim.
 */
export function TripCargoLayers({ layout, onLoadingMove }: TripCargoLayersProps) {
  const { t } = useTranslation('trip')
  const [index, setIndex] = useState(0)
  /**
   * ⚠️ A camada só entra em foco depois que o operador **navega**. Antes disso o desenho é a pilha
   * inteira, sólida: abrir a tela com as camadas de cima esmaecidas lia como caixa transparente, e
   * não como "a camada aberta é a de baixo".
   */
  const [hasChosenLayer, setHasChosenLayer] = useState(false)
  const [view, setView] = useState(DEFAULT_CARGO_VIEW)
  /**
   * ⚠️ A mãozinha some no **primeiro** arrasto e não volta: ela é a única pista de que o desenho
   * gira, e repeti-la toda visita seria avisar quem já sabe.
   */
  const [hasDragged, setHasDragged] = useState(false)
  const dragFrom = useRef<{ x: number; y: number } | null>(null)
  const [focus, setFocus] = useState(EMPTY_STOP_FOCUS)

  const placement = layout?.placement ?? null
  if (layout === null) return null

  /**
   * ⚠️ **Sem as três medidas do baú não há desenho, e dizer isso é o mínimo.** Nomear o campo não
   * basta: quem lê está montando uma viagem, e voltar à ficha do veículo é um caminho que ele teria
   * de descobrir sozinho — o atalho é o que separa um aviso de uma instrução. Era a única coisa que
   * a planta em escala dizia e este painel não dizia, e ela saiu com a 095.
   */
  if (layout.bedLengthM === null || layout.bedWidthM === null) {
    return (
      <p className={styles.hint}>
        {t('cargoLayers.missingBed')} <a href={FLEET_HREF}>{t('cargoLayers.missingBedLink')}</a>
      </p>
    )
  }
  if (placement === null || placement.layers.length === 0) return null

  const current = placement.layers[Math.min(index, placement.layers.length - 1)]
  if (current === undefined) return null

  /**
   * ⚠️ **Todas as camadas no desenho**, com a escolhida em foco e as outras esmaecidas. Desenhar só a
   * camada aberta tiraria justamente o que o 3D tem de melhor — ver a pilha inteira — e deixaria a
   * carga flutuando sobre um piso vazio.
   */
  /**
   * ⚠️ Memoizado porque o **arrasto** redesenha a cada evento de ponteiro: sem isto, remontar e
   * reordenar até 600 caixas acontecia a cada quadro do gesto, na viagem grande.
   */
  const boxes: readonly IsometricBox[] = useMemo(
    () =>
      placement.layers.flatMap((layer) =>
        layer.boxes.map((box, position) => ({
          color: stopColorOf(box.stopSequence),
          depthM: box.depthM,
          heightM: box.heightM,
          id: `${String(layer.index)}-${String(position)}`,
          isEstimated: box.source === 'estimated',
          isGhost: !isStopLit(focus, box.stopSequence),
          isSplit: box.reasons.includes('splitCargo'),
          layer: box.layer,
          stopSequence: box.stopSequence,
          widthM: box.widthM,
          xM: box.xM,
          yM: box.yM,
          zM: box.zM,
        })),
      ),
    [focus, placement.layers],
  )

  /**
   * ⚠️ O contorno é o **baú**, e a altura dele não pode ser a da carga: somar as camadas desenhava o
   * baú sempre cheio até o teto, e a folga de altura — a informação que decide se cabe mais uma
   * camada — nunca aparecia. Sem a medida da ficha, o desenho usa a carga e não promete folga.
   */
  /**
   * ⚠️ Ausente é `depth`, o comportamento de sempre: uma API que ainda não publica o arranjo não pode
   * fazer a folha de carregamento inverter a ordem sozinha.
   */
  const arrangement = layout.stopArrangement ?? 'depth'
  /**
   * Spec 100 D4. ⚠️ **Quem diz que foi o peso é a API, não uma dedução daqui.** Concluir isso de
   * `depth` mais carga pesada afirmava o mesmo na viagem de uma parada só, na carroceria aberta e
   * quando as faixas não caberiam de todo jeito — e nesses três o operador conclui que aliviar a
   * carga devolveria as faixas, e não devolve.
   */
  const weightWonAccess = layout.stopArrangementReason === 'weight'

  const sliceCutsM = useMemo(() => resolveSliceCuts(boxes, arrangement), [arrangement, boxes])
  const bedHeightM = Number.parseFloat(layout.bedHeightM ?? '0')
  const cargoTopM = Math.max(...boxes.map((box) => box.zM + box.heightM), 0)
  const drawnHeightM = bedHeightM > 0 ? bedHeightM : cargoTopM

  const stopLabels = buildCargoStopLabels(layout.rows)
  const labelOf = (sequence: number): string =>
    formatCargoStopLabel(stopLabels.get(sequence)) || t('cargoLayers.stop', { sequence })

  /**
   * ⚠️ **Uma lista só na tela.** A ficha dizia cliente e endereço e a tabela ao lado dizia a ordem
   * de carregamento, a faixa e as contagens — casar as duas era trabalho de quem estava com a carga
   * na mão. A tabela continua, escondida na tela e impressa no papel: lá não há cor nem clique.
   */
  const chipFacts = buildCargoChipFacts(boxes, arrangement)

  const stopChips = [
    ...new Set(placement.layers.flatMap((layer) => layer.boxes.map((box) => box.stopSequence))),
  ]
    .sort((first, second) => first - second)
    .map((sequence) => ({ facts: chipFacts.get(sequence), sequence }))
    /**
     * ⚠️ **Na ordem em que se carrega**, não na de entrega: quem está no galpão lê a lista de cima para
     * baixo enquanto enche o baú. Ficha sem posição (parada fora do desenho) vai para o fim.
     */
    .sort(
      (first, second) =>
        (first.facts?.loadingPosition ?? Number.MAX_SAFE_INTEGER) -
        (second.facts?.loadingPosition ?? Number.MAX_SAFE_INTEGER),
    )

  return (
    <section aria-labelledby="trip-cargo-layers-title" className={styles.panel} data-print-region>
      <h3 className={styles.hint} id="trip-cargo-layers-title">
        {t('cargoLayers.title')}
      </h3>

      {/* ⚠️ A linha que diz o que a planta NÃO promete. Fixa, nunca condicional. */}
      <p className={styles.hint}>{t('cargoLayers.promise')}</p>

      {/*
        ⚠️ **O desenho promete metro, e este metro é de catálogo.** A escala veio da referência do
        tipo porque a ficha deste veículo não tem as três medidas — e a dispersão dentro de um tipo
        chega a 2×. Sem esta linha, o palpite se apresentaria como fita na mão de quem carrega, que
        é o modo de falha da ADR-0044 §1.
      */}
      {layout.bedSource !== 'reference' ? null : (
        <p className={styles.warning} role="status">
          {t('cargoLayers.bedFromReference')}{' '}
          <a href={FLEET_HREF}>{t('cargoLayers.missingBedLink')}</a>
        </p>
      )}

      {/**
       * ⚠️ **Todas as camadas de uma vez, com o que cada uma tem dentro.** O par anterior/próxima
       * mostrava "Camada 1 de 2" e obrigava a percorrer o baú para saber o que havia na de cima —
       * numa pilha de duas ou seis, a lista inteira cabe e responde de relance. Clicar acende uma;
       * clicar de novo devolve a pilha inteira sólida.
       */}
      <ul className={styles.cargoLayerList} role="list">
        {placement.layers.map((layer) => {
          const chosen = hasChosenLayer && layer.index === current.index
          return (
            <li key={layer.index}>
              <button
                aria-pressed={chosen}
                className={styles.cargoLayerChip}
                type="button"
                onClick={() => {
                  setIndex(layer.index)
                  setHasChosenLayer(!chosen || layer.index !== current.index)
                }}
              >
                <strong>{t('cargoLayers.layer', { index: layer.index + 1 })}</strong>
                {t('cargoLayers.layerSummary', {
                  boxes: layer.boxes.length,
                  height: layer.heightM.toFixed(2),
                  stops: new Set(layer.boxes.map((box) => box.stopSequence)).size,
                })}
              </button>
            </li>
          )
        })}
      </ul>

      <div className={styles.cargoStage}>
        <CargoIsometric
          angle={view.angle}
          ariaLabel={t('cargoLayers.planLabel', { index: current.index + 1 })}
          bedHeightM={drawnHeightM}
          bedLengthM={Number.parseFloat(layout.bedLengthM)}
          bedWidthM={Number.parseFloat(layout.bedWidthM)}
          boxes={boxes}
          className={styles.cargoCanvas}
          {...(hasChosenLayer ? { focusLayer: current.index } : {})}
          hasSideDoor={layout.loadingAccess !== 'rear'}
          sliceCutsAcrossWidth={arrangement === 'lanes'}
          panX={view.panX}
          sliceCutsM={sliceCutsM}
          panY={view.panY}
          zoom={view.zoom}
          onPointerDown={(event: PointerEvent<SVGSVGElement>) => {
            dragFrom.current = { x: event.clientX, y: event.clientY }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event: PointerEvent<SVGSVGElement>) => {
            const from = dragFrom.current
            if (from === null) return
            setView((previous) =>
              dragView(previous, { x: event.clientX - from.x, y: event.clientY - from.y }),
            )
            dragFrom.current = { x: event.clientX, y: event.clientY }
            setHasDragged(true)
          }}
          onPointerUp={() => {
            dragFrom.current = null
          }}
        />
        {hasDragged ? null : (
          <span className={styles.cargoDragHint}>
            <Icon aria-hidden name="grip" />
            {t('cargoLayers.dragHint')}
          </span>
        )}
      </div>

      <div className={styles.cargoPads}>
        {/*
          ⚠️ **O rótulo é visível, não só acessível.** Os dois teclados de setas eram idênticos na
          tela — um gira, o outro move —, e o nome existia apenas no `aria-label`: quem enxerga
          tinha de clicar para descobrir qual era qual. O texto entra `aria-hidden` porque o grupo
          já se anuncia pelo nome.
        */}
        <div className={styles.cargoPadGroup}>
          <span aria-hidden className={styles.cargoPadLabel}>
            {t('cargoLayers.rotate')}
          </span>
          <div className={styles.cargoPad} role="group" aria-label={t('cargoLayers.rotate')}>
            {(['up', 'left', 'right', 'down'] as const).map((direction) => (
              <Button
                aria-label={t(`cargoLayers.rotateTo.${direction}`)}
                className={styles[`cargoPad${capitalise(direction)}`]}
                key={direction}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setView((previous) => rotateView(previous, direction))}
              >
                <Icon name={ARROW_ICONS[direction]} />
              </Button>
            ))}
          </div>
        </div>

        <div className={styles.cargoPadGroup}>
          <span aria-hidden className={styles.cargoPadLabel}>
            {t('cargoLayers.pan')}
          </span>
          <div className={styles.cargoPad} role="group" aria-label={t('cargoLayers.pan')}>
            {(['up', 'left', 'right', 'down'] as const).map((direction) => (
              <Button
                aria-label={t(`cargoLayers.panTo.${direction}`)}
                className={styles[`cargoPad${capitalise(direction)}`]}
                key={direction}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setView((previous) => panViewBy(previous, direction))}
              >
                <Icon name={ARROW_ICONS[direction]} />
              </Button>
            ))}
          </div>
        </div>

        <div className={styles.cargoViewActions}>
          <Button
            aria-label={t('cargoLayers.zoomOut')}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setView((previous) => zoomViewBy(previous, -1))}
          >
            <Icon name="minus" />
            {t('cargoLayers.zoomOut')}
          </Button>
          <Button
            aria-label={t('cargoLayers.zoomIn')}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setView((previous) => zoomViewBy(previous, 1))}
          >
            <Icon name="add" />
            {t('cargoLayers.zoomIn')}
          </Button>
          {(['rear', 'side', 'top'] as const).map((preset: CargoViewPreset) => (
            <Button
              key={preset}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setView((previous) => applyViewPreset(previous, preset))}
            >
              <Icon name={PRESET_ICONS[preset]} />
              {t(`cargoLayers.view.${preset}`)}
            </Button>
          ))}
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setView(DEFAULT_CARGO_VIEW)}
          >
            <Icon name="refresh" />
            {t('cargoLayers.view.reset')}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => globalThis.print()}>
            <Icon name="document" />
            {t('cargoLayers.print.action')}
          </Button>
        </div>
      </div>

      {/* A legenda das três marcas: sem ela o contorno vermelho da dividida não quer dizer nada. */}
      <div className={styles.cargoStops}>
        {stopChips.map(({ facts, sequence }) => (
          <div className={styles.cargoStopItem} key={sequence}>
            <button
              aria-pressed={focus.has(sequence)}
              className={styles.cargoStopChip}
              type="button"
              onClick={() => setFocus((previous) => toggleStopFocus(previous, sequence))}
            >
              <span className={styles.cargoStopDot} style={{ background: stopColorOf(sequence) }} />
              {/*
              ⚠️ **O número da entrega vive com a cor.** A ficha dizia só o cliente e o endereço, e
              a folha ao lado dizia só o número — quem estava no barracão casava as duas listas por
              nome de mercado para saber que caixa era de qual parada.
            */}
              <span className={styles.cargoStopOrder}>{sequence}</span>
              {/*
              ⚠️ **A ordem de carregamento é o número que o galpão procura.** Ela era uma linha cinza
              pequena no meio da ficha; quem carrega lê a ficha de longe, com a caixa na mão.
            */}
              {facts === undefined ? null : (
                <span className={styles.cargoStopLoadingBadge}>
                  {t('cargoLayers.chip.loadingBadge', { position: facts.loadingPosition })}
                </span>
              )}
              <span className={styles.cargoStopBody}>
                <span>{labelOf(sequence)}</span>
                {facts === undefined ? null : (
                  <span className={styles.cargoStopFacts}>
                    <span>
                      {t('cargoLayers.print.spanValue', {
                        from: facts.fromM.toFixed(2),
                        to: facts.toM.toFixed(2),
                      })}
                    </span>
                    <span>{t('cargoLayers.chip.counts', { boxes: facts.boxes })}</span>
                    {/*
                    ⚠️ Presumida e dividida só aparecem quando existem: zero delas é o caso normal,
                    e imprimir "0 divididas" em toda ficha faz o aviso deixar de ser lido justamente
                    na parada em que ele importa.
                  */}
                    {facts.presumed === 0 ? null : (
                      <span>{t('cargoLayers.chip.presumed', { count: facts.presumed })}</span>
                    )}
                    {facts.split === 0 ? null : (
                      <span className={styles.cargoStopSplit}>
                        {t('cargoLayers.chip.split', { count: facts.split })}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
            {onLoadingMove === undefined || facts === undefined ? null : (
              <span className={styles.cargoStopMoves}>
                <Button
                  aria-label={t('cargoLayers.chip.loadEarlier', { label: labelOf(sequence) })}
                  disabled={facts.loadingPosition === 1}
                  onClick={() => onLoadingMove(sequence, -1)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Icon name="chevron-up" />
                </Button>
                <Button
                  aria-label={t('cargoLayers.chip.loadLater', { label: labelOf(sequence) })}
                  disabled={facts.loadingPosition === chipFacts.size}
                  onClick={() => onLoadingMove(sequence, 1)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Icon name="chevron-down" />
                </Button>
              </span>
            )}
          </div>
        ))}
      </div>

      {/**
       * ⚠️ **A tela diz qual arranjo desenhou** (spec 100 D5). O corte entre os dois — caixa larga
       * demais para a faixa, ou peso acima de metade do teto — não é adivinhável olhando a planta, e
       * sem a linha o desenho parece mudar sozinho de uma viagem para a outra.
       */}
      <p className={styles.hint}>{t(`cargoLayers.arrangement.${arrangement}`)}</p>
      {weightWonAccess ? (
        <p className={styles.hint}>{t('cargoLayers.arrangement.weightWon')}</p>
      ) : null}

      <ul className={styles.cargoLegend} role="list">
        <li>{t('cargoLayers.legend.measured')}</li>
        <li>{t('cargoLayers.legend.presumed')}</li>
        <li>{t('cargoLayers.legend.split')}</li>
      </ul>

      {/**
       * A folha do agregado: ele carrega a van sozinho, longe da tela, e o galpão imprime em laser
       * mono — nada aqui depende de cor. A ordem é a de **carregamento**, inversa à de entrega.
       */}
      <table className={styles.cargoPrintSheet}>
        <caption>{t(`cargoLayers.print.caption.${arrangement}`)}</caption>
        <thead>
          <tr>
            {/*
              ⚠️ **São dois números, e eles não coincidem.** Quem carrega segue a ordem de
              carregamento; quem dirige segue a de entrega — e em profundidade uma é o inverso da
              outra, porque a última entrega entra primeiro e vai ao fundo. Uma coluna só obrigava a
              cabeça a fazer a inversão a cada linha, no barracão, com a carga na mão.
            */}
            <th scope="col">{t('cargoLayers.print.order')}</th>
            <th scope="col">{t('cargoLayers.print.delivery')}</th>
            <th scope="col">{t('cargoLayers.print.stop')}</th>
            <th scope="col">{t(`cargoLayers.print.span.${arrangement}`)}</th>
            <th scope="col">{t('cargoLayers.print.boxes')}</th>
            <th scope="col">{t('cargoLayers.print.presumed')}</th>
            <th scope="col">{t('cargoLayers.print.split')}</th>
          </tr>
        </thead>
        <tbody>
          {buildCargoPrintSummary(boxes, arrangement).map((row, position) => (
            <tr key={row.stopSequence}>
              <td className={styles.cargoOrderCell}>{position + 1}</td>
              <td className={styles.cargoOrderCell}>{row.stopSequence}</td>
              <td>{labelOf(row.stopSequence)}</td>
              <td>
                {t('cargoLayers.print.spanValue', {
                  from: row.fromM.toFixed(2),
                  to: row.toM.toFixed(2),
                })}
              </td>
              <td>{row.boxes}</td>
              <td>{row.presumed}</td>
              <td>{row.split}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/**
       * ⚠️ **A planta é uma instrução, e instrução sem motivo não se confere.** Quem carrega precisa
       * saber se a pilha parou por estabilidade ou por falta de caixa, e se a carga foi para o fundo
       * por escolha ou por não caber — senão a única leitura possível é "o sistema decidiu".
       *
       * ⚠️ Só entram as decisões que moldaram **esta** carga: nota que valeria para toda viagem é
       * ruído, e ruído fixo deixa de ser lido na terceira vez. Quem escolhe é a API.
       */}
      {(layout.layoutNotes ?? []).length === 0 ? null : (
        <div className={styles.cargoNotes}>
          <p className={styles.hint}>{t('cargoLayers.notes.title')}</p>
          <ul className={styles.cargoNotesList} role="list">
            {(layout.layoutNotes ?? []).map((note) => (
              <li key={note}>{t(`cargoLayers.notes.${note}`)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* A legenda das aberturas em texto: rótulo dentro do desenho sai cortado e atravessa a borda. */}
      <p className={styles.hint}>
        {layout.loadingAccess === 'rear'
          ? t('cargoLayers.doorsRear')
          : t('cargoLayers.doorsRearAndSide')}
      </p>

      {isMostlyPresumed(boxes) ? (
        <p className={styles.hint}>{t('cargoLayers.mostlyPresumed')}</p>
      ) : placement.source === 'estimated' ? (
        <p className={styles.hint}>{t('cargoLayers.estimated')}</p>
      ) : null}

      {placement.unplaced.length === 0 ? null : (
        <ul className={styles.cargoUnplaced} role="list">
          {placement.unplaced.map((entry) => (
            <li key={`${entry.label}-${entry.reason}`}>
              {t(`cargoLayers.unplaced.${entry.reason}`, {
                count: entry.count,
                label: entry.label,
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** As setas da botoeira: o mesmo ícone para girar e para mover, porque o gesto é o mesmo. */
const ARROW_ICONS = {
  down: 'chevron-down',
  left: 'chevron-left',
  right: 'chevron-right',
  up: 'chevron-up',
} as const

/** Cada atalho de vista com o seu ícone: numa fileira de botões, o olho acha o símbolo antes da palavra. */
const PRESET_ICONS = {
  default: 'refresh',
  rear: 'page-last',
  side: 'truck',
  top: 'arrow-down',
} as const

function capitalise(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}
