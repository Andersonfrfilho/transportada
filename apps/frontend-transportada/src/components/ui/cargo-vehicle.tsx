/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import { VEHICLE_TYPES, type VehicleType } from '@/modules/shared/vehicleType.constant'

import styles from './cargo-vehicle.module.css'

/**
 * A silhueta do veículo com a carga entrando pelo baú — o mesmo percentual da barra, em forma de
 * caminhão.
 *
 * ⚠️ **É decorativo, e por isso `aria-hidden`.** O número e a barra ao lado são a informação; este
 * desenho é o que faz o olho achar o estado antes de ler o algarismo. Leitor de tela não perde nada.
 *
 * ⚠️ **As caixas não dizem posição.** Todas iguais, sem cor por parada e sem ordem: a NF-e não traz
 * dimensão de volume, e a diferença entre "o baú está a 60%" e "esta caixa vai neste canto" é a
 * diferença entre ajudar e enganar — a mesma linha que o painel de fileiras respeita.
 *
 * ⚠️ O `<svg>` aqui é **geometria de dados**: a quantidade de caixas sai da ocupação em tempo de
 * execução e o contorno muda com o tipo do veículo. Por isso ele vive no design system e está
 * declarado em `DATA_GEOMETRY_PATHS`, como o mapa, o código de barras e a planta em escala.
 */
type CargoVehicleProps = Readonly<{
  /** 0 a 100 do baú. Acima de 100 o desenho enche e muda de cor — o estouro não pode sumir. */
  percent: number
  vehicleType: VehicleType | ''
}>

/**
 * As medidas são **em metros**, e o desenho converte. É o que preserva a escala entre os tipos: numa
 * régua só, a Fiorino aparece pequena ao lado da carreta, como nas pranchas de frota que o mercado
 * usa. Desenhar cada tipo esticado para a mesma largura faria a moto parecer um bitrem.
 */
type CargoBox = Readonly<{
  heightM: number
  /** O tom da caixa, para a carga não virar um bloco chapado. */
  tone: number
  widthM: number
  xM: number
  yM: number
}>

type VehicleShape = Readonly<{
  /** Comprimento do conjunto, ponta a ponta. */
  totalLengthM: number
  /** Onde o compartimento começa e quanto ele mede — é dentro dele que a carga entra. */
  bodyStartM: number
  bodyLengthM: number
  bodyHeightM: number
  /** Altura do piso do compartimento: o baú de caminhão é alto, o da van encosta no chão. */
  bodyFloorM: number
  /**
   * ⚠️ **Monovolume**: cabine e compartimento no mesmo contorno, como uma van, uma Fiorino ou um
   * carro. Desenhados como cabine + baú separados eles saíam com cara de caminhãozinho, que é
   * exatamente o que uma van não é.
   */
  unibody?: boolean
  /**
   * Cabine: comprimento e o quanto o teto dela fica **abaixo do topo do baú**. É medida relativa de
   * propósito — declarar altura absoluta deixava a frente afundada em relação à carga, que é como um
   * caminhão não se parece.
   *
   * Zero no comprimento é o implemento, que não tem cabine.
   */
  cabLengthM: number
  cabDropM: number
  /**
   * ⚠️ O raio da roda é **por tipo**. Era fixo em 0,52 m para todos, o que dá um pneu de 1,04 m de
   * diâmetro numa Fiorino — maior que o de um truck de verdade, e o desenho inteiro se desmancha em
   * volta disso.
   */
  wheelRadiusM: number
  /** Posição de cada eixo, em metros. `double` desenha o rodado duplo do truck e da carreta. */
  axles: readonly Readonly<{ atM: number; double?: boolean }>[]
}>

/**
 * Unidades do `viewBox` por metro.
 *
 * ⚠️ A escala e a proporção do `viewBox` andam juntas: a faixa é ~13:1 e o veículo é ~3:1, então o
 * `viewBox` **tem de ter a proporção da faixa**, senão `slice` amplia para cobrir a largura e corta
 * o caminhão pela metade — foi o que aconteceu. Com as duas casadas, o veículo cabe inteiro na
 * altura e o cenário preenche o resto da largura.
 */
const UNITS_PER_METRE = 10
const GROUND = 40
/**
 * ⚠️ A faixa é **larga**, e o desenho a cobre por inteiro com `slice`: o cenário é o que preenche a
 * tela, não o veículo. Em proporção real um truck de 11 × 3,85 m nunca ocupa uma faixa de 8:1 —
 * esticá-lo para isso seria desenhar um caminhão que não existe. O que sobra de céu é cortado por
 * cima, e o chão fica sempre na tela.
 */
const VIEWBOX = { height: 44, width: 587 } as const
/** A linha da estrada. É nela que a roda encosta — com o centro no chão, meia roda ficava enterrada. */
const ROAD_Y = GROUND + 4
/** O tracejado da pista: risco + vão, em unidades do `viewBox`. É o período que fecha o laço. */
const ROAD_DASH = { gap: 5, stroke: 6 } as const
/** O laço do cenário: uma cópia entra exatamente quando a outra sai. */
const VIEWBOX_SCENERY_SPAN = 587
/** A mesma faixa, em metros — é nela que montanhas, nuvens e postes são espalhados. */
const SCENERY_SPAN_M = VIEWBOX_SCENERY_SPAN / UNITS_PER_METRE
const BOX_GAP_M = 0.14
const FULL_PERCENT = 100
/**
 * Vazio o ciclo do cenário é curto (parece rápido); cheio, longo.
 *
 * ⚠️ A faixa tem ~59 m: um ciclo de 1,1 s seria 190 km/h, e o desenho lia como corrida em vez de
 * viagem. Em 3,2 s vazio dá ~66 km/h, e cheio ~26 km/h — a ordem de grandeza de um caminhão.
 */
const ROAD_DURATION_EMPTY_S = 3.2
const ROAD_DURATION_SPAN_S = 4.9
/**
 * ⚠️ O balanço tem **piso**: derivado só da carga ele sumia no caminhão cheio (0,28 px, invisível) e
 * o veículo parecia um adesivo. Cheio ele balança pouco, mas balança.
 */
const SWAY_MIN_UNITS = 0.7
const SWAY_MAX_UNITS = 2.2
const SMOKE_PUFFS = [0, 1, 2] as const
/**
 * ⚠️ As duas cópias ficam **atrás e sobre** a faixa (`-span` e `0`), nunca `0` e `+span`. O cenário
 * corre para a direita: com as cópias à frente, no fim do ciclo as duas saíam pela direita e a
 * esquerda ficava vazia — a tela piscava e tudo repontava do nada. Com uma cópia entrando pela
 * esquerda enquanto a outra sai, a rolagem é contínua e o laço não tem emenda visível.
 */
const SCENERY_REPEATS = [-VIEWBOX_SCENERY_SPAN, 0] as const

/**
 * ⚠️ **Caixas de tamanhos diferentes**, como a carga real: a mesma nota mistura CX12 de líquido com
 * CX96 de sachê. Uma grade de quadrados iguais desenha um tabuleiro, não um baú carregado.
 *
 * ⚠️ A escolha **parece** sorteada e **não é**: sai de um hash do índice, não de `Math.random`. Com
 * sorteio de verdade a carga se remexeria a cada render — o baú mudaria de arrumação enquanto o
 * operador olha, e o desenho passaria a piscar em vez de assentar.
 */
const BOX_VARIANTS = [
  { heightM: 0.62, tone: 1, widthM: 0.62 },
  { heightM: 0.44, tone: 0.72, widthM: 0.94 },
  { heightM: 0.78, tone: 0.94, widthM: 0.48 },
  { heightM: 0.52, tone: 0.64, widthM: 0.76 },
  { heightM: 0.34, tone: 0.86, widthM: 0.58 },
  { heightM: 0.68, tone: 0.58, widthM: 0.84 },
  { heightM: 0.5, tone: 1, widthM: 0.4 },
] as const

/**
 * O horizonte é **gerado**, não uma lista escrita à mão: três montanhas iguais repetidas viram
 * padrão, e padrão é a única coisa que o olho não perdoa num fundo que passa em laço.
 *
 * ⚠️ Gerado com o mesmo hash das caixas, e pelo mesmo motivo: parece sorteado e é sempre igual. Com
 * `Math.random` a serra mudaria de forma a cada render, no canto do olho de quem confere nota.
 */
const MOUNTAINS = buildMountains()
const CLOUDS = buildClouds()
const STARS = buildStars()
const SCENERY_POSTS = buildPosts()

/**
 * As proporções reais de cada tipo. A carreta é o maior, e é ela que define a régua — o resto
 * aparece na fração que ocupa dela.
 *
 * O mapa é total por construção (`Record<VehicleType, …>` não compila sem todos), então tipo novo
 * no catálogo não entra sem desenho — a mesma garantia de `VEHICLE_TYPE_ICONS`.
 */
const VEHICLE_SHAPES: Record<VehicleType, VehicleShape> = {
  motorcycle: {
    axles: [{ atM: 0.4 }, { atM: 1.8 }],
    bodyFloorM: 0.62,
    bodyHeightM: 0.45,
    bodyLengthM: 0.5,
    bodyStartM: 1.5,
    cabDropM: 0.0,
    cabLengthM: 1.3,
    totalLengthM: 2.2,
    unibody: true,
    wheelRadiusM: 0.3,
  },
  car: {
    axles: [{ atM: 0.9 }, { atM: 3.5 }],
    bodyFloorM: 0.5,
    bodyHeightM: 0.55,
    bodyLengthM: 1.1,
    bodyStartM: 3.1,
    cabDropM: 0.0,
    cabLengthM: 3.0,
    totalLengthM: 4.4,
    unibody: true,
    wheelRadiusM: 0.32,
  },
  utility: {
    axles: [{ atM: 0.78 }, { atM: 3.29 }],
    bodyFloorM: 0.52,
    bodyHeightM: 1.24,
    bodyLengthM: 2.15,
    bodyStartM: 1.95,
    cabDropM: 0.12,
    cabLengthM: 1.75,
    totalLengthM: 4.26,
    unibody: true,
    wheelRadiusM: 0.31,
  },
  /** Furgão: cabine e compartimento no mesmo volume, e é por isso que o baú começa cedo. */
  van: {
    axles: [{ atM: 1.05 }, { atM: 4.55 }],
    bodyFloorM: 0.55,
    bodyHeightM: 1.9,
    bodyLengthM: 3.45,
    bodyStartM: 2.15,
    cabDropM: 0.08,
    cabLengthM: 2.05,
    totalLengthM: 5.93,
    unibody: true,
    wheelRadiusM: 0.36,
  },
  vuc: {
    axles: [{ atM: 1.1 }, { atM: 4.8 }],
    bodyFloorM: 0.78,
    bodyHeightM: 2.1,
    bodyLengthM: 4.2,
    bodyStartM: 2.0,
    cabDropM: 0.25,
    cabLengthM: 1.9,
    totalLengthM: 6.3,
    wheelRadiusM: 0.42,
  },
  three_quarter: {
    axles: [{ atM: 1.2 }, { atM: 5.8 }],
    bodyFloorM: 0.82,
    bodyHeightM: 2.2,
    bodyLengthM: 5.3,
    bodyStartM: 2.1,
    cabDropM: 0.25,
    cabLengthM: 2.0,
    totalLengthM: 7.5,
    wheelRadiusM: 0.45,
  },
  toco: {
    axles: [{ atM: 1.4 }, { atM: 7.0 }],
    bodyFloorM: 0.88,
    bodyHeightM: 2.5,
    bodyLengthM: 6.6,
    bodyStartM: 2.3,
    cabDropM: 0.3,
    cabLengthM: 2.2,
    totalLengthM: 9.0,
    wheelRadiusM: 0.5,
  },
  truck: {
    axles: [{ atM: 1.5 }, { atM: 8.0, double: true }],
    bodyFloorM: 0.95,
    bodyHeightM: 2.7,
    bodyLengthM: 8.4,
    bodyStartM: 2.4,
    cabDropM: 0.3,
    cabLengthM: 2.3,
    totalLengthM: 11.0,
    wheelRadiusM: 0.52,
  },
  /**
   * Cavalo mecânico com o semirreboque: a carga é do implemento, e desenhar só o cavalo mostraria
   * um veículo sem lugar nenhum para a carga que o painel está medindo.
   */
  tractor_unit: {
    axles: [{ atM: 1.6 }, { atM: 4.4, double: true }, { atM: 15.0, double: true }],
    bodyFloorM: 1.02,
    bodyHeightM: 2.8,
    bodyLengthM: 12.4,
    bodyStartM: 5.6,
    cabDropM: 0.3,
    cabLengthM: 2.6,
    totalLengthM: 18.6,
    wheelRadiusM: 0.52,
  },
  other: {
    axles: [{ atM: 1.1 }, { atM: 4.8 }],
    bodyFloorM: 0.78,
    bodyHeightM: 2.1,
    bodyLengthM: 4.2,
    bodyStartM: 2.0,
    cabDropM: 0.25,
    cabLengthM: 1.9,
    totalLengthM: 6.3,
    wheelRadiusM: 0.42,
  },
}

/** Sem tipo escolhido o desenho é o genérico: melhor um contorno neutro que nenhum. */
const FALLBACK_SHAPE = VEHICLE_SHAPES.other

export function CargoVehicle({ percent, vehicleType }: CargoVehicleProps) {
  const shape = vehicleType === '' ? FALLBACK_SHAPE : VEHICLE_SHAPES[vehicleType]
  const isOverCapacity = percent > FULL_PERCENT

  const stack = buildStack(shape)
  const filled = countFilledBoxes({ percent, slots: stack.length })

  /**
   * ⚠️ **Quanto mais carga, mais devagar.** O cenário corre no ritmo do caminhão carregado: vazio
   * ele voa, cheio ele arrasta. É a única parte da animação que carrega informação — e por isso ela
   * acompanha o mesmo percentual das medidas, aparado em 100 (acima do teto ele não fica mais lento
   * que o mais lento).
   */
  const load = Math.min(percent, FULL_PERCENT) / FULL_PERCENT
  const style = {
    '--road-duration': `${String(round(ROAD_DURATION_EMPTY_S + load * ROAD_DURATION_SPAN_S))}s`,
    /** Caminhão vazio balança solto na suspensão; carregado, a carga o assenta. */
    '--sway-amplitude': `${String(round(SWAY_MIN_UNITS + (SWAY_MAX_UNITS - SWAY_MIN_UNITS) * (1 - load)))}px`,
    /** A carroceria pende junto: só subir e descer lê como elevador, não como suspensão. */
    '--sway-tilt': `${String(round(0.5 + (1 - load) * 0.7))}deg`,
    /**
     * ⚠️ A roda gira **na velocidade do chão**: uma volta por circunferência percorrida. Com uma
     * volta por ciclo do cenário — que é o que ela fazia — o pneu patinava, e o olho percebe isso
     * antes de saber o porquê.
     */
    '--wheel-duration': `${String(round(wheelTurnsRatio(shape.wheelRadiusM) * (ROAD_DURATION_EMPTY_S + load * ROAD_DURATION_SPAN_S)))}s`,
    /**
     * ⚠️ A pista corre **na mesma velocidade** do cenário: um período do tracejado leva a fração do
     * ciclo que ele representa da faixa. Com uma duração escolhida à parte, o chão andava num ritmo
     * e o mundo em outro — e nada no desenho parecia estar no mesmo lugar.
     */
    '--road-dash-duration': `${String(round(roadDashRatio() * (ROAD_DURATION_EMPTY_S + load * ROAD_DURATION_SPAN_S), 4))}s`,
  } as CSSProperties

  return (
    <svg
      aria-hidden="true"
      className={cn(styles.vehicle, isOverCapacity && styles.vehicleOver)}
      /** Ancorado à esquerda e no chão: os tipos alinham pela mesma linha, como numa prancha. */
      preserveAspectRatio="xMinYMax slice"
      style={style}
      viewBox={`0 0 ${String(VIEWBOX.width)} ${String(VIEWBOX.height)}`}
    >
      {/*
        O ambiente corre para trás; o caminhão fica no lugar. É o mesmo truque do desenho animado, e
        é o que permite manter a silhueta na escala sem tirá-la da tela.
      */}
      {/*
        ⚠️ Três camadas, três ritmos — é a paralaxe que dá profundidade: a montanha quase não sai do
        lugar, a nuvem passa devagar e o poste voa. Todas no mesmo sentido do veículo, e todas
        derivadas da **mesma** duração, que é a que a carga define.
      */}
      <g className={styles.sceneryFar}>
        {SCENERY_REPEATS.map((offset) =>
          MOUNTAINS.map((mountain) => (
            <polyline
              className={styles.mountain}
              key={`${String(offset)}-${String(mountain.atM)}`}
              points={buildMountain({ mountain, offset })}
            />
          )),
        )}
      </g>

      {/*
        ⚠️ O céu segue o tema: **estrelas no escuro, nuvens no claro**. Os dois grupos são
        renderizados e o CSS esconde um — alternar no React exigiria ler o tema em JavaScript, e o
        tema aqui tem duas portas (o botão e a media query do sistema), das quais só o CSS conhece
        as duas.
        As estrelas **não correm**: o céu está longe demais para passar. Elas cintilam, e é isso.
      */}
      <g className={styles.stars}>
        {STARS.map((star) => (
          <circle
            className={styles.star}
            cx={toUnits(star.atM)}
            cy={star.y}
            key={`${String(star.atM)}-${String(star.y)}`}
            r={star.r}
            style={{ '--star-index': star.index } as CSSProperties}
          />
        ))}
      </g>

      <g className={styles.sceneryMid}>
        {SCENERY_REPEATS.map((offset) =>
          CLOUDS.map((cloud) => (
            <g className={styles.cloud} key={`${String(offset)}-${String(cloud.atM)}`}>
              <circle cx={toUnits(cloud.atM) + offset} cy={cloud.y} r={cloud.r} />
              <circle
                cx={toUnits(cloud.atM) + offset + cloud.r}
                cy={cloud.y + 1}
                r={cloud.r * 0.8}
              />
              <circle
                cx={toUnits(cloud.atM) + offset - cloud.r * 0.9}
                cy={cloud.y + 1.2}
                r={cloud.r * 0.65}
              />
            </g>
          )),
        )}
      </g>

      <g className={styles.scenery}>
        {SCENERY_REPEATS.map((offset) => (
          <g key={offset}>
            {/*
              Os fios entre os postes, em catenária. Eles são o que faz uma linha vertical solta
              virar poste de energia à beira da estrada — sem eles são só riscos passando.
            */}
            {SCENERY_POSTS.map((post, index) => {
              /**
               * ⚠️ O último poste liga ao **primeiro da cópia seguinte**, deslocado de uma faixa
               * inteira: sem isso o fio morre no fim de cada cópia e reaparece do nada na próxima,
               * e a linha de energia fica picada a cada volta do laço.
               */
              const next = SCENERY_POSTS[index + 1] ?? {
                atM: (SCENERY_POSTS[0]?.atM ?? 0) + SCENERY_SPAN_M,
                heightM: SCENERY_POSTS[0]?.heightM ?? 0,
              }
              return WIRE_SAGS.map((sag) => (
                <path
                  className={styles.wire}
                  d={buildWire({ from: post, offset, sag, to: next })}
                  key={`${String(offset)}-${String(post.atM)}-${String(sag)}`}
                />
              ))
            })}
            {SCENERY_POSTS.map((post) => (
              <g key={`${String(offset)}-${String(post.atM)}`}>
                <line
                  className={styles.post}
                  x1={toUnits(post.atM) + offset}
                  x2={toUnits(post.atM) + offset}
                  y1={GROUND - toUnits(post.heightM)}
                  y2={GROUND}
                />
                {/* A cruzeta: é ela que sustenta os fios, e sem ela eles nascem do nada. */}
                <line
                  className={styles.post}
                  x1={toUnits(post.atM - 0.4) + offset}
                  x2={toUnits(post.atM + 0.4) + offset}
                  y1={GROUND - toUnits(post.heightM - 0.15)}
                  y2={GROUND - toUnits(post.heightM - 0.15)}
                />
              </g>
            ))}
          </g>
        ))}
      </g>

      <line
        className={styles.road}
        strokeDasharray={`${String(ROAD_DASH.stroke)} ${String(ROAD_DASH.gap)}`}
        x1="0"
        x2={VIEWBOX.width}
        y1={ROAD_Y}
        y2={ROAD_Y}
      />

      {/*
        ⚠️ Posição **fixa** ao meio da faixa. O vai-e-vem que havia aqui fazia o caminhão andar de
        ré metade do tempo — quem anda é o mundo, e o veículo só balança na suspensão.
      */}
      <g transform={`translate(${String(resolveStageOffset(shape))} 0)`}>
        <g className={styles.rig}>
          {/* O chassi liga a cabine ao baú: sem ele o compartimento flutua, e a traseira parece
            montada em cima da frente. */}
          <line
            className={styles.chassis}
            x1={toUnits(0.6)}
            x2={toUnits(shape.bodyStartM + shape.bodyLengthM)}
            y1={GROUND - toUnits(shape.bodyFloorM)}
            y2={GROUND - toUnits(shape.bodyFloorM)}
          />

          {shape.unibody === true ? (
            /* Van, utilitário e carro: um contorno só, do capô à traseira. */
            <path className={styles.cab} d={buildUnibodyPath(shape)} />
          ) : (
            <>
              {shape.cabLengthM > 0 ? (
                <path className={styles.cab} d={buildCabPath(shape)} />
              ) : null}
              <rect
                className={styles.body}
                height={toUnits(shape.bodyHeightM)}
                width={toUnits(shape.bodyLengthM)}
                x={toUnits(shape.bodyStartM)}
                y={GROUND - toUnits(shape.bodyFloorM + shape.bodyHeightM)}
              />
            </>
          )}
          {/* O para-brisa: a cabine sem vidro é uma caixa, e é o vidro que diz onde é a frente. */}
          {shape.cabLengthM > 0 ? (
            <path className={styles.glass} d={buildGlassPath(shape)} />
          ) : null}

          {/* A carga sacode mais que o chassi: é ela que está solta no baú. */}
          <g className={styles.cargo}>
            {stack.slice(0, filled).map((box, index) => (
              <rect
                className={styles.box}
                height={toUnits(box.heightM)}
                key={`${String(box.xM)}-${String(box.yM)}`}
                style={{ '--box-index': index, '--box-tone': box.tone } as CSSProperties}
                width={toUnits(box.widthM)}
                x={toUnits(box.xM)}
                y={GROUND - toUnits(box.yM + box.heightM)}
              />
            ))}
          </g>

          {shape.axles.flatMap((axle) =>
            (axle.double === true ? [axle.atM, axle.atM + 1.3] : [axle.atM]).map((atM) => (
              <Wheel atM={atM} key={atM} radiusM={shape.wheelRadiusM} />
            )),
          )}

          {/*
          ⚠️ O escapamento fica na **traseira e embaixo** — a direita é a traseira, porque o veículo
          aponta para a esquerda. Ele saía colado à cabine, que é onde o cano não termina.
        */}
          {shape.cabLengthM > 0 ? (
            <>
              <line
                className={styles.pipe}
                x1={toUnits(shape.bodyStartM + shape.bodyLengthM - 0.6)}
                x2={toUnits(shape.bodyStartM + shape.bodyLengthM + 0.2)}
                y1={GROUND - toUnits(shape.bodyFloorM * 0.45)}
                y2={GROUND - toUnits(shape.bodyFloorM * 0.45)}
              />
              {SMOKE_PUFFS.map((puff) => (
                <circle
                  className={styles.smoke}
                  cx={toUnits(shape.bodyStartM + shape.bodyLengthM + 0.3)}
                  cy={GROUND - toUnits(shape.bodyFloorM * 0.45)}
                  key={puff}
                  r={toUnits(0.22)}
                  style={{ '--puff-index': puff } as CSSProperties}
                />
              ))}
            </>
          ) : null}
        </g>
      </g>
    </svg>
  )
}

/**
 * ⚠️ A roda **gira**, e gira no sentido da viagem: a cabine aponta para a esquerda, então o veículo
 * anda para a esquerda e a roda vira no sentido anti-horário. Um círculo parado num desenho que
 * corre é o detalhe que faz tudo parecer travado.
 *
 * Os raios são o que torna o giro visível — um círculo girando em torno do próprio centro não muda
 * nada na tela.
 */
function Wheel({ atM, radiusM }: Readonly<{ atM: number; radiusM: number }>) {
  const cx = toUnits(atM)
  const radius = toUnits(radiusM)
  /** ⚠️ Centro **acima** da estrada por um raio: com o centro na linha, meia roda ficava enterrada. */
  const cy = ROAD_Y - radius

  return (
    <g className={styles.wheelGroup}>
      <circle className={styles.wheel} cx={cx} cy={cy} r={radius} />
      <circle className={styles.hub} cx={cx} cy={cy} r={radius * 0.34} />
      <line
        className={styles.spoke}
        x1={cx - radius * 0.72}
        x2={cx + radius * 0.72}
        y1={cy}
        y2={cy}
      />
      <line
        className={styles.spoke}
        x1={cx}
        x2={cx}
        y1={cy - radius * 0.72}
        y2={cy + radius * 0.72}
      />
    </g>
  )
}

/**
 * Hash inteiro do índice — mistura o suficiente para o olho não achar o padrão, e é a mesma resposta
 * toda vez. É o que dá aparência sorteada sem a carga se remexer entre renders.
 */
/** Um inteiro estável por semente — a base de tudo que "parece sorteado" aqui. */
function hash(seed: number): number {
  let mixed = Math.imul(seed + 1, 2654435761) >>> 0
  mixed ^= mixed >>> 15
  mixed = Math.imul(mixed, 2246822519) >>> 0
  mixed ^= mixed >>> 13

  return (mixed >>> 0) / 4294967296
}

/** Espalha `count` itens ao longo da faixa do cenário, com folga irregular entre eles. */
function spread(input: Readonly<{ count: number; salt: number }>): readonly number[] {
  const stepM = SCENERY_SPAN_M / input.count

  return Array.from(
    { length: input.count },
    (_, index) => index * stepM + hash(index * 7 + input.salt) * stepM * 0.8,
  )
}

function buildMountains(): readonly Readonly<{ atM: number; heightM: number; widthM: number }>[] {
  return spread({ count: 9, salt: 11 }).map((atM, index) => ({
    atM,
    heightM: 1.4 + hash(index * 5 + 3) * 2.0,
    widthM: 6 + hash(index * 5 + 4) * 10,
  }))
}

function buildClouds(): readonly Readonly<{ atM: number; r: number; y: number }>[] {
  return spread({ count: 8, salt: 29 }).map((atM, index) => ({
    atM,
    r: 1.6 + hash(index * 9 + 6) * 1.8,
    y: 4 + hash(index * 9 + 7) * 8,
  }))
}

/**
 * O céu noturno. Espalhadas pela faixa inteira e por toda a altura acima do horizonte — estrela
 * alinhada numa fileira é a coisa mais artificial que um céu pode ter.
 */
function buildStars(): readonly Readonly<{ atM: number; index: number; r: number; y: number }>[] {
  return Array.from({ length: 26 }, (_, index) => ({
    atM: hash(index * 17 + 61) * SCENERY_SPAN_M,
    index,
    r: 0.35 + hash(index * 17 + 62) * 0.55,
    y: 1.5 + hash(index * 17 + 63) * (GROUND - 12),
  }))
}

function buildPosts(): readonly Readonly<{ atM: number; heightM: number }>[] {
  return spread({ count: 9, salt: 47 })
    .map((atM, index) => ({ atM, heightM: 2.0 + hash(index * 3 + 8) * 1.2 }))
    .sort((first, second) => first.atM - second.atM)
}

function pickVariant(index: number): number {
  return Math.floor(hash(index * 3 + 101) * BOX_VARIANTS.length) % BOX_VARIANTS.length
}

/** Dois fios, com barrigas diferentes — um par sozinho lê como risco, e três já vira ruído. */
const WIRE_SAGS = [1.4, 2.6] as const

/**
 * O contorno único da van: capô curto, para-brisa inclinado, teto reto e traseira vertical. É o
 * perfil que distingue um furgão de um caminhãozinho com baú, e a diferença é o desenho **não** ter
 * emenda entre a frente e a carga.
 */
function buildUnibodyPath(shape: VehicleShape): string {
  const topM = shape.bodyFloorM + shape.bodyHeightM
  const noseM = resolveNoseHeightM(shape)
  const front = toUnits(0.1)
  const back = toUnits(shape.bodyStartM + shape.bodyLengthM)
  const floor = GROUND - toUnits(shape.bodyFloorM * 0.35)
  const top = GROUND - toUnits(topM)
  const nose = GROUND - toUnits(noseM)
  const windshieldEnd = front + toUnits(shape.cabLengthM * 0.75)

  return [
    `M ${String(front)} ${String(floor)}`,
    `L ${String(front)} ${String(nose)}`,
    `L ${String(windshieldEnd)} ${String(top)}`,
    `L ${String(back)} ${String(top)}`,
    `L ${String(back)} ${String(floor)}`,
    'Z',
  ].join(' ')
}

/**
 * O para-brisa, **dentro** do contorno da cabine — e as duas cabines são diferentes: o pesado tem
 * capô curto e teto reto, o monovolume sobe do nariz ao teto numa diagonal só.
 *
 * ⚠️ Tudo em metros, derivado da mesma geometria que desenha a cabine. Com folgas fixas em unidades
 * do `viewBox`, calibradas para uma escala e um formato, o vidro escapava do contorno assim que
 * qualquer um dos dois mudava — foi o que aconteceu quando a escala dobrou e os leves viraram
 * monovolume.
 */
function buildGlassPath(shape: VehicleShape): string {
  const cabHeightM = resolveCabHeightM(shape)
  const insetM = 0.12

  if (shape.unibody === true) {
    const noseM = resolveNoseHeightM(shape)
    const windshieldEndM = shape.cabLengthM * 0.75
    const topM = shape.bodyFloorM + shape.bodyHeightM

    return [
      `M ${String(toUnits(0.1 + insetM * 1.6))} ${String(GROUND - toUnits(noseM + insetM))}`,
      `L ${String(toUnits(windshieldEndM))} ${String(GROUND - toUnits(topM - insetM))}`,
      `L ${String(toUnits(shape.cabLengthM))} ${String(GROUND - toUnits(topM - insetM))}`,
      `L ${String(toUnits(shape.cabLengthM))} ${String(GROUND - toUnits(topM - insetM - cabHeightM * 0.32))}`,
      `L ${String(toUnits(0.1 + insetM * 1.6))} ${String(GROUND - toUnits(noseM + insetM - cabHeightM * 0.16))}`,
      'Z',
    ].join(' ')
  }

  /** Cabine de caminhão: o vidro ocupa o terço de cima, do para-brisa à quina de trás. */
  const noseTopM = cabHeightM * 0.7
  const glassBottomM = cabHeightM * 0.52

  return [
    `M ${String(toUnits(0.1 + insetM))} ${String(GROUND - toUnits(noseTopM))}`,
    `L ${String(toUnits(0.55))} ${String(GROUND - toUnits(cabHeightM - insetM))}`,
    `L ${String(toUnits(shape.cabLengthM - insetM))} ${String(GROUND - toUnits(cabHeightM - insetM))}`,
    `L ${String(toUnits(shape.cabLengthM - insetM))} ${String(GROUND - toUnits(glassBottomM))}`,
    `L ${String(toUnits(0.1 + insetM))} ${String(GROUND - toUnits(glassBottomM))}`,
    'Z',
  ].join(' ')
}

function buildWire(
  input: Readonly<{
    from: Readonly<{ atM: number; heightM: number }>
    offset: number
    sag: number
    to: Readonly<{ atM: number; heightM: number }>
  }>,
): string {
  const x1 = toUnits(input.from.atM) + input.offset
  const x2 = toUnits(input.to.atM) + input.offset
  const y1 = GROUND - toUnits(input.from.heightM - 0.15)
  const y2 = GROUND - toUnits(input.to.heightM - 0.15)
  const midX = (x1 + x2) / 2
  /** A barriga do fio é o que o distingue de uma reta ligando dois pontos. */
  const midY = Math.max(y1, y2) + input.sag

  return `M ${String(x1)} ${String(y1)} Q ${String(midX)} ${String(midY)} ${String(x2)} ${String(y2)}`
}

function buildMountain(
  input: Readonly<{
    mountain: Readonly<{ atM: number; heightM: number; widthM: number }>
    offset: number
  }>,
): string {
  const base = toUnits(input.mountain.atM) + input.offset
  const half = toUnits(input.mountain.widthM) / 2
  const peak = GROUND - toUnits(input.mountain.heightM)

  return `${String(base - half)},${String(GROUND)} ${String(base)},${String(peak)} ${String(base + half)},${String(GROUND)}`
}

/** Quanto do ciclo do cenário cabe numa volta da roda: circunferência ÷ faixa percorrida. */
/** Onde o veículo assenta na faixa: pouco antes do meio, para a carga ficar no centro do olhar. */
function resolveStageOffset(shape: VehicleShape): number {
  return round(Math.max(0, (VIEWBOX.width - toUnits(shape.totalLengthM)) * 0.42))
}

function wheelTurnsRatio(radiusM: number): number {
  const circumferenceM = 2 * Math.PI * radiusM

  return circumferenceM / (VIEWBOX_SCENERY_SPAN / UNITS_PER_METRE)
}

function round(value: number, places = 2): number {
  const factor = 10 ** places

  return Math.round(value * factor) / factor
}

/** Que fração da faixa um período do tracejado ocupa — é ela que casa as duas velocidades. */
function roadDashRatio(): number {
  return (ROAD_DASH.stroke + ROAD_DASH.gap) / VIEWBOX_SCENERY_SPAN
}

function toUnits(metres: number): number {
  return Math.round(metres * UNITS_PER_METRE * 100) / 100
}

/**
 * A cabine em linha, com o para-brisa inclinado — é o que faz um caminhão parecer um caminhão de
 * lado, e o que distingue o VUC do baú solto de um implemento.
 */
/** O teto da cabine sai do topo do baú, menos a folga do tipo: a frente acompanha a carga. */
function resolveCabHeightM(shape: VehicleShape): number {
  return Math.max(0.9, shape.bodyFloorM + shape.bodyHeightM - shape.cabDropM)
}

/** A quina do capô — onde o para-brisa começa a subir. */
function resolveNoseHeightM(shape: VehicleShape): number {
  return Math.max(0.6, (shape.bodyFloorM + shape.bodyHeightM) * 0.42)
}

function buildCabPath(shape: VehicleShape): string {
  const front = toUnits(0.1)
  const back = toUnits(shape.cabLengthM)
  const cabHeightM = resolveCabHeightM(shape)
  const top = GROUND - toUnits(cabHeightM)
  const noseTop = top + toUnits(cabHeightM * 0.3)
  /**
   * ⚠️ A cabine assenta no **mesmo chassi** do baú. Ela descia até 0,35 m enquanto o compartimento
   * se apoiava a 1,15 m, e a frente aparecia afundada em relação à carga — dois pisos diferentes no
   * mesmo veículo.
   */
  const floor = GROUND - toUnits(shape.bodyFloorM)

  return [
    `M ${String(front)} ${String(floor)}`,
    `L ${String(front)} ${String(noseTop)}`,
    `L ${String(front + toUnits(0.45))} ${String(top)}`,
    `L ${String(back)} ${String(top)}`,
    `L ${String(back)} ${String(floor)}`,
    'Z',
  ].join(' ')
}

/**
 * ⚠️ **Uma caixa é o mínimo visível de carga que existe.** Carga que não chega a 1% do baú ainda é
 * carga, e um desenho vazio diria que o caminhão está livre. Acima do teto o baú aparece cheio — a
 * cor é o que separa "coube" de "passou", como na barra.
 */
export function countFilledBoxes(input: Readonly<{ percent: number; slots: number }>): number {
  if (input.percent <= 0) return 0
  if (input.percent >= FULL_PERCENT) return input.slots

  return Math.max(1, Math.round((input.percent / FULL_PERCENT) * input.slots))
}

/**
 * A pilha inteira que cabe no baú, do piso para cima e do fundo para a porta. É ela que dá o
 * denominador do desenho — nunca o do cálculo, que sai da cubagem.
 *
 * Empacota por linha: cada caixa entra enquanto couber no comprimento, e a linha seguinte começa na
 * altura da mais alta da anterior. Não é estiva — é a aparência de uma carga arrumada, com peças de
 * tamanhos diferentes, que é o que um baú carregado tem.
 */
function buildStack(shape: VehicleShape): readonly CargoBox[] {
  const boxes: CargoBox[] = []
  let rowBottomM = BOX_GAP_M
  let index = 0

  while (rowBottomM < shape.bodyHeightM) {
    let cursorM = BOX_GAP_M
    let rowHeightM = 0
    let placed = false

    while (cursorM < shape.bodyLengthM) {
      const variant = BOX_VARIANTS[pickVariant(index)] ?? BOX_VARIANTS[0]
      if (cursorM + variant.widthM > shape.bodyLengthM) break
      if (rowBottomM + variant.heightM > shape.bodyHeightM) break

      /** Um empurrãozinho por caixa: carga arrumada à mão não fica alinhada como tabuleiro. */
      const jitterM = (hash(index * 11 + 7) - 0.5) * BOX_GAP_M
      boxes.push({
        heightM: variant.heightM,
        tone: variant.tone,
        widthM: variant.widthM,
        xM: shape.bodyStartM + cursorM,
        yM: shape.bodyFloorM + rowBottomM + Math.max(0, jitterM),
      })
      cursorM += variant.widthM + BOX_GAP_M * (0.6 + hash(index * 13 + 5))
      rowHeightM = Math.max(rowHeightM, variant.heightM)
      index += 1
      placed = true
    }

    /** Linha em que nada coube encerra a pilha: sem isto o laço não avança e trava a renderização. */
    if (!placed) break
    rowBottomM += rowHeightM + BOX_GAP_M
  }

  return boxes
}

/** Exportado para o contrato: tipo novo no catálogo não passa sem desenho. */
export const CARGO_VEHICLE_TYPES = VEHICLE_TYPES
