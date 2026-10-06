/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'

import type { TripTimelineKind } from './trip.types'

export const TIMELINE_MAP_CATEGORIES = [
  'dispatched',
  'arrived',
  'departed',
  'delivered',
  'returned',
  'occurrence',
  'cancelled',
  'status',
] as const
export type TimelineMapCategory = (typeof TIMELINE_MAP_CATEGORIES)[number]

/**
 * `null` é decisão, não ausência: o kind existe na tabela e **não entra** no mapa da viagem. O tipo
 * `Record` segue exigindo que todo kind novo escolha um dos dois lados.
 */
export const TIMELINE_MAP_CATEGORY_BY_KIND: Readonly<
  Record<TripTimelineKind, null | TimelineMapCategory>
> = {
  /**
   * Spec 228 T4.1: a foto é parte da entrega — mesma cor, e pinos do mesmo lugar viram um. Sozinha
   * ela leva o glifo e o rótulo próprios (`TIMELINE_MAP_PHOTO_*`) e não conta na legenda de entregas.
   */
  'document.canhoto_photo': 'delivered',
  'document.delivered': 'delivered',
  'document.occurrence': 'occurrence',
  'document.returned': 'returned',
  'document.status_changed': 'status',
  /**
   * Spec 228 M2: o ponto novo do endereço não é lugar por onde a viagem passou. No traço ele viraria
   * "Mudança de situação" e sugeriria um desvio que não houve; fica só no "Ver no mapa" do próprio item.
   */
  'stop.address_corrected': null,
  'stop.arrived': 'arrived',
  'stop.departed': 'departed',
  'stop.departure_cancelled': 'cancelled',
  'stop.occurrence': 'occurrence',
  'trip.created': 'status',
  'trip.dispatched': 'dispatched',
  'trip.status_changed': 'status',
}

/** Os mesmos glifos da linha da lista: o pino e a linha ao lado dele dizem a mesma coisa. */
export const TIMELINE_MAP_ICON_BY_CATEGORY: Readonly<Record<TimelineMapCategory, IconName>> = {
  arrived: 'map-pin',
  cancelled: 'close',
  delivered: 'check',
  departed: 'truck',
  dispatched: 'send',
  occurrence: 'alert',
  returned: 'refresh',
  status: 'clock',
}

export const TIMELINE_MAP_PHOTO_KIND = 'document.canhoto_photo' satisfies TripTimelineKind
export const TIMELINE_MAP_PHOTO_ICON = 'camera' satisfies IconName
export const TIMELINE_MAP_PHOTO_LABEL_KEY = 'eventTimeline.itemTitle.canhotoPhotoUnknownDocument'

/** ~11 m: pinos do mesmo lugar viram um só (mesma categoria) ou abrem em leque (categorias distintas). */
export const TIMELINE_MAP_CELL_DECIMALS = 4

/** Acima disto a lista acessível recolhe: dezenas de linhas empurrariam a linha do tempo para fora da tela. */
export const TIMELINE_MAP_LIST_COLLAPSE_THRESHOLD = 8

/** Abaixo de dois lugares não há trecho para pedir — a API responderia 400. */
export const TIMELINE_ROUTE_MIN_POINTS = 2

/** Espelho de `MAX_ROUTE_GEOMETRY_POINTS` da API: pedir acima disto só renderia 400. */
export const TIMELINE_ROUTE_MAX_POINTS = 100

/** O pino sem selo: `border` de `.tilePin`, e a fração que o glifo ocupa do miolo. */
const PIN_BORDER_REM = 0.125
const PIN_GLYPH_FRACTION = 0.7

/**
 * ⚠️ **O pino com selo é maior, e isto foi medido, não estimado.** No pino de 1,5 rem o glifo sai
 * com 14 px e o selo de ordem legível sai com 18 px: ele cobria **74 % do ícone** na tela. O ícone é
 * quem diz o tipo do evento — encolher o selo até caber o tornaria ilegível, que é tão inútil quanto
 * coberto. Cresce o pino, e o selo volta a ser o contador de notificação que morde a quina.
 *
 * ⚠️ **A janela tem um pixel de largura, e isso é o achado.** Por baixo, 27 px é o mínimo que mantém
 * o selo de dois dígitos dentro do teto de cobertura do glifo. Por cima, o leque de
 * `resolveMarkerOffsets` — 16 px de raio — encavala acima de 27,7 px: três pinos no mesmo ponto ficam
 * a essa distância de centro a centro. 1,6875 rem (27 px) é o único diâmetro redondo que cabe nos
 * dois, e é por isso que ele não é um número bonito.
 */
export const TIMELINE_MAP_BADGED_PIN_SIZE_REM = 1.6875

/** 10 px em bold: o menor corpo que ainda lê dois dígitos sem lupa. Abaixo disto não desce. */
const ORDER_BADGE_FONT_SIZE_REM = 0.625
/** Caixa inteira do selo, anel incluído (`border-box`): 15 px sobre um pino de 27 px. */
const ORDER_BADGE_SIZE_REM = 0.9375
/**
 * Quanto o selo sai para fora da caixa do pino — é a quina, não a borda.
 *
 * ⚠️ `position: absolute` conta a partir da **caixa de preenchimento**, por dentro da borda de 2 px
 * do pino: o selo cai em `PIN_BORDER_REM - este valor`, não em `-este valor`. A primeira conta aqui
 * esqueceu esse termo e previa 3 % de cobertura onde a tela media 10 %.
 */
const ORDER_BADGE_OFFSET_REM = 0.5625
/** Dois dígitos crescem a pílula para o lado; o corpo da fonte fica onde está. */
const ORDER_BADGE_PADDING_INLINE_REM = 0.15
const ORDER_BADGE_RING_REM = 0.09375
/** Avanço de um dígito tabular a 10 px bold, medido na fonte da aplicação: 5,57 px. */
const ORDER_BADGE_DIGIT_ADVANCE_REM = 0.348

/**
 * O teto de quanto da área do glifo o selo pode encostar. Não é zero de propósito: encostar na quina
 * é o que prende o selo ao pino. O que não pode é invadir o miolo, onde mora o desenho.
 *
 * ⚠️ Vale até **dois** dígitos — a viagem com cem pontos localizados estoura para ~13 %, e aí o selo
 * ainda é quina (o glifo segue 87 % livre), mas a conta deixa de caber neste teto e passa a ser
 * exceção conhecida, não surpresa.
 */
export const TIMELINE_MAP_ORDER_BADGE_MAX_GLYPH_COVERAGE = 0.1

/**
 * ⚠️ **Os cantos do pino têm dono.** Superior DIREITO já é do selo de contagem (`.tilePinCount`) e do
 * selo de ocorrência da spec 164 (`.tilePinOccurrenceBadge`); superior ESQUERDO é deste selo de ordem,
 * e só ele. Os dois nunca disputam o mesmo canto, e o de ocorrência nem chega ao minimapa — o pino da
 * linha do tempo sai de `buildTimelineMapPin`, que não carrega nota nenhuma.
 */
export const TIMELINE_MAP_ORDER_BADGE_CORNER = 'top-left'

/**
 * A fração do glifo que o selo de `digits` dígitos cobre, pela geometria declarada acima.
 *
 * ⚠️ É esta conta que decide o tamanho do pino — e é ela que o contrato cobra. Mexer num número
 * daqui sem rodar o contrato é como o selo voltou a cobrir o ícone da primeira vez.
 */
export function measureOrderBadgeGlyphCoverage(digits: number): number {
  const pin = TIMELINE_MAP_BADGED_PIN_SIZE_REM
  const inner = pin - PIN_BORDER_REM * 2
  const glyphSize = inner * PIN_GLYPH_FRACTION
  const glyphStart = PIN_BORDER_REM + (inner - glyphSize) / 2
  const text = ORDER_BADGE_DIGIT_ADVANCE_REM * digits + ORDER_BADGE_PADDING_INLINE_REM * 2
  const badgeWidth = Math.max(ORDER_BADGE_SIZE_REM, text + ORDER_BADGE_RING_REM * 2)
  const badgeStart = PIN_BORDER_REM - ORDER_BADGE_OFFSET_REM
  const across = Math.max(0, badgeStart + badgeWidth - glyphStart)
  const down = Math.max(0, badgeStart + ORDER_BADGE_SIZE_REM - glyphStart)
  return (Math.min(across, glyphSize) * Math.min(down, glyphSize)) / (glyphSize * glyphSize)
}

/**
 * A medida do selo de ordem e a do rótulo de tempo, declaradas **uma vez** e entregues ao elemento
 * como propriedade custom — a folha consome `var(…)` e não guarda número nenhum.
 *
 * ⚠️ Elas não podem morar na folha: o pino é `HTMLElement` montado fora da árvore do React, e é o
 * mesmo nó que já recebe cor de fundo e cor do anel por este caminho. Repetir o número nos dois
 * lugares os faria divergir no dia em que alguém mexesse num só.
 */
export const TIMELINE_MAP_ORDER_BADGE_STYLE: Readonly<Record<string, string>> = {
  '--timeline-order-badge-font-size': `${ORDER_BADGE_FONT_SIZE_REM}rem`,
  '--timeline-order-badge-offset': `-${ORDER_BADGE_OFFSET_REM}rem`,
  '--timeline-order-badge-padding-inline': `${ORDER_BADGE_PADDING_INLINE_REM}rem`,
  '--timeline-order-badge-ring-width': `${ORDER_BADGE_RING_REM}rem`,
  '--timeline-order-badge-size': `${ORDER_BADGE_SIZE_REM}rem`,
  '--timeline-pin-size': `${TIMELINE_MAP_BADGED_PIN_SIZE_REM}rem`,
}

export const TIMELINE_MAP_LEG_LABEL_STYLE: Readonly<Record<string, string>> = {
  '--timeline-leg-label-font-size': '0.65rem',
  '--timeline-leg-label-padding': '0.1rem 0.4rem',
  '--timeline-leg-label-radius': '0.65rem',
  '--timeline-leg-label-ring-width': '1.5px',
}

/**
 * O respiro que sobra de cada lado do texto quando ele se deita sobre o traço.
 *
 * ⚠️ **Ele substitui um limiar fixo de 72px que, medido na tela, escondia tudo.** O número solto não
 * tinha relação nenhuma com a largura do texto que julgava: "1 min" e "2 h 15 min" recebiam a mesma
 * régua. O que se compara agora é o traço contra o texto **medido**, mais este respiro.
 */
export const TIMELINE_MAP_LEG_LABEL_GAP_PIXELS = 8

/**
 * Quanto o rótulo desce abaixo do pino de destino quando o traço não o comporta.
 *
 * ⚠️ Metade do pino (13,5px) mais metade do rótulo (7,8px) mais um fio de folga. **Para baixo** por
 * eliminação: a quina superior esquerda é do selo de ordem e a direita é da contagem e do selo de
 * ocorrência — os cantos de cima acabaram.
 */
export const TIMELINE_MAP_LEG_LABEL_PIN_OFFSET_PIXELS = 26

/**
 * ⚠️ **"0 min" sobre um traço não informa nada.** Menos de um minuto entre dois eventos não é
 * espaçamento, é a ausência dele — e ocupava, em pílulas de 42px, o espaço que o próprio rótulo diz
 * não ter. A lista ao lado continua escrevendo o zero, onde a frase não disputa pixel com o desenho.
 */
export const TIMELINE_MAP_LEG_LABEL_MIN_MINUTES = 1

/**
 * Onde o rótulo deste trecho cabe — e **nunca** "em lugar nenhum".
 *
 * ⚠️ A versão anterior respondia esconder/mostrar, e no enquadramento de abertura respondia esconder
 * para 100% dos rótulos: o usuário abria o mapa e não via tempo algum. Traço que não comporta o
 * texto não cancela a informação; muda a âncora dela para o pino de destino.
 */
export function resolveLegLabelPlacement(
  input: Readonly<{ spanPixels: number; textPixels: number }>,
): 'pin' | 'trace' {
  return input.spanPixels >= input.textPixels + TIMELINE_MAP_LEG_LABEL_GAP_PIXELS ? 'trace' : 'pin'
}

type LegLabelBox = Readonly<{ height: number; width: number; x: number; y: number }>

/**
 * Quais rótulos sobrevivem quando dois caem um sobre o outro, na ordem cronológica.
 *
 * ⚠️ **O primeiro nunca some.** É o piso que impede o conserto do limiar de reabrir o mesmo defeito
 * por outro caminho: o que a sobreposição recolhe é o rótulo de cima, nunca a informação inteira.
 */
export function resolveLegLabelVisibility(boxes: readonly LegLabelBox[]): readonly boolean[] {
  const kept: LegLabelBox[] = []

  return boxes.map((box) => {
    if (kept.some((other) => overlaps(other, box))) return false
    kept.push(box)
    return true
  })
}

/** Encostar não é cobrir: a caixa que começa onde a outra termina continua legível. */
function overlaps(first: LegLabelBox, second: LegLabelBox): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  )
}

/** O que o mapa desenhou entre um ponto e o seguinte. */
export type TimelineRouteTrace = 'none' | 'road' | 'straight'

/**
 * ⚠️ A legenda é **consequência** do traço, nunca texto fixo: um tracejado reto não pode ser
 * anunciado como caminho pela estrada (ADR-0044 §5).
 */
export const TIMELINE_MAP_CAPTION_KEY_BY_TRACE: Readonly<Record<TimelineRouteTrace, string>> = {
  none: 'eventTimeline.map.captionPoint',
  road: 'eventTimeline.map.captionRoad',
  straight: 'eventTimeline.map.captionStraight',
}
