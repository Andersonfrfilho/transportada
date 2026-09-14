/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { countFilledBoxes } from '@/components/ui/cargo-vehicle'
import { VEHICLE_TYPES } from '@/modules/shared/vehicleType.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

describe('silhueta do veículo com a carga', () => {
  /**
   * O mapa é `Record<VehicleType, …>`: tipo novo no catálogo **não compila** sem desenho. Este teste
   * é a segunda metade — ele falha se alguém trocar o `Record` por um mapa parcial, que compilaria
   * e deixaria o tipo novo sair sem contorno.
   */
  test('desenha todos os tipos do catálogo', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('Record<VehicleType, VehicleShape>')
    for (const vehicleType of VEHICLE_TYPES) {
      expect(source).toContain(`${vehicleType}:`)
    }
  })

  /**
   * ⚠️ **Uma caixa é o mínimo visível de carga que existe.** Carga que não chega a 1% do baú ainda é
   * carga, e um baú desenhado vazio diria que o caminhão está livre.
   */
  test('nunca desenha o baú vazio com carga dentro', () => {
    expect(countFilledBoxes({ percent: 0.4, slots: 24 })).toBe(1)
    expect(countFilledBoxes({ percent: 50, slots: 24 })).toBe(12)
    /** Vazio de verdade é vazio: zero não vira uma caixa por educação. */
    expect(countFilledBoxes({ percent: 0, slots: 24 })).toBe(0)
  })

  /** Acima do teto o baú aparece cheio — não há como desenhar mais caixas que o contorno cabe. */
  test('enche o baú no estouro, e a cor é o que separa dos 100% exatos', () => {
    expect(countFilledBoxes({ percent: 166, slots: 24 })).toBe(24)

    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    expect(source).toContain('percent > FULL_PERCENT')
    expect(css).toContain('.vehicleOver .box')
    expect(css).toContain('var(--color-alert)')
  })

  /**
   * ⚠️ Decorativo, e por isso `aria-hidden`: o percentual e a barra ao lado são a informação. E as
   * caixas **não dizem posição** — todas iguais, sem cor por parada, pela mesma razão que o painel
   * de fileiras não sugere onde cada peça vai.
   */
  test('é decorativo e não sugere posição de carga', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('aria-hidden="true"')
    expect(source).not.toContain('stopColorOf')
  })

  /**
   * ⚠️ **A carga entra uma vez; o mundo lá fora fica em laço.** São animações com propósitos
   * diferentes: a caixa que assenta conta o carregamento e não precisa se repetir, e a estrada que
   * corre conta que a viagem está acontecendo. Pôr a carga em laço faria as caixas piscarem para
   * sempre no canto do olho de quem confere nota.
   */
  test('a carga entra uma vez, sacode sempre, e o cenário roda em laço', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')
    const box = css.slice(css.indexOf('.box {'), css.indexOf('.vehicleOver'))

    /** A **entrada** não se repete: caixa que reaparece pisca no canto do olho. */
    expect(box).toContain('cargoBoxIn 0.42s ease-out forwards')
    /** O sacolejo, sim — carga no baú não fica imóvel. */
    expect(box).toContain('cargoBoxShake 1.05s ease-in-out infinite')
    expect(css).toContain('cargoScenery var(--road-duration')
    expect(css).toContain('cargoSmoke 1.6s ease-out infinite')
  })

  /**
   * ⚠️ A entrada anima **só a opacidade**. Enquanto ela animava `transform` com `forwards`, a
   * propriedade ficava presa nela para sempre e o balanço da caixa não tinha por onde acontecer.
   */
  test('a entrada da caixa não sequestra o transform', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')
    const keyframe = css.slice(
      css.indexOf('@keyframes cargoBoxIn'),
      css.indexOf('@keyframes cargoBoxShake'),
    )

    expect(keyframe).not.toContain('transform')
  })

  /**
   * ⚠️ O sacolejo da caixa é **sutil**: carga amarrada num baú, não bagunça saltando. O bastante
   * para não parecer pintada, pouco o bastante para ninguém reparar enquanto lê o número ao lado.
   */
  test('a caixa sacode pouco', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')
    const keyframe = css.slice(css.indexOf('@keyframes cargoBoxShake'))

    expect(keyframe).toContain('translate(0.1px, -0.35px)')
  })

  /** Fases desencontradas: em uníssono a carga vira um bloco só subindo e descendo. */
  test('cada caixa sacode com a própria fase', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    expect(css).toContain('calc(var(--box-index, 0) * -37ms)')
  })

  /**
   * ⚠️ **A velocidade é a carga**: vazio o ciclo é curto e o cenário voa; cheio, ele arrasta. É a
   * única parte da animação que informa, e por isso ela sai do mesmo percentual das medidas — aparado
   * em 100, senão o caminhão estourado ficaria mais lento a cada nota a mais, para sempre.
   */
  test('a impressão de velocidade cai com a carga', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('Math.min(percent, FULL_PERCENT)')
    expect(source).toContain("'--road-duration'")
    expect(source).toContain('ROAD_DURATION_EMPTY_S + load * ROAD_DURATION_SPAN_S')
    /**
     * ⚠️ Vazio balança solto, carregado assenta — **mas balança**. Derivada só da carga a amplitude
     * sumia no caminhão cheio (0,28 px) e o veículo virava um adesivo com o mundo passando atrás.
     */
    expect(source).toContain('SWAY_MIN_UNITS + (SWAY_MAX_UNITS - SWAY_MIN_UNITS) * (1 - load)')
    /** Pender é o que faz o eixo trabalhar: só subir e descer lê como elevador. */
    expect(source).toContain("'--sway-tilt'")
    /**
     * ⚠️ A roda gira na velocidade do chão — uma volta por circunferência percorrida. Com uma volta
     * por ciclo do cenário o pneu patinava, e o olho percebe isso antes de saber o porquê.
     */
    expect(source).toContain('wheelTurnsRatio(shape.wheelRadiusM)')
    expect(source).toContain('circumferenceM / (VIEWBOX_SCENERY_SPAN / UNITS_PER_METRE)')
  })

  /**
   * Caixas de tamanhos diferentes, como a carga real — a mesma nota mistura CX12 de líquido com
   * CX96 de sachê. E a variante sai do índice, **nunca de sorteio**: a mesma ocupação desenha sempre
   * o mesmo baú, e a carga não se remexe a cada render.
   */
  test('a carga tem caixas variadas, e sempre as mesmas', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('BOX_VARIANTS')
    /** Hash do índice: aparência sorteada, resposta estável. */
    expect(source).toContain('pickVariant(index)')
    expect(source).toContain('Math.imul')
    /** A chamada, não a palavra: o próprio arquivo explica por que ela não está ali. */
    expect(source).not.toContain('Math.random(')
  })

  /**
   * ⚠️ O chassi liga a cabine ao baú. Sem ele o compartimento flutua acima das rodas e a traseira
   * parece montada em cima da frente — foi o que o desenho fazia antes.
   */
  test('o baú se apoia num chassi, não no ar', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('styles.chassis')
  })

  /**
   * ⚠️ O fundo tem três camadas com ritmos diferentes — montanha, nuvem e poste —, e as três saem de
   * múltiplos da **mesma** duração: durações independentes as fariam dessincronizar da velocidade
   * que a carga define.
   */
  test('o fundo tem paralaxe de três camadas, todas no ritmo da carga', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    expect(source).toContain('MOUNTAINS')
    expect(source).toContain('CLOUDS')
    expect(source).toContain('SCENERY_POSTS')
    expect(css).toContain('calc(var(--road-duration, 2s) * 2.4)')
    expect(css).toContain('calc(var(--road-duration, 2s) * 6)')
  })

  /**
   * ⚠️ O veículo aponta para a **esquerda**, então o mundo corre para a direita e a roda gira no
   * anti-horário. Com o sentido invertido o caminhão anda de ré — foi o que o desenho fazia antes.
   */
  test('o mundo corre no sentido da viagem, e a roda gira', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    expect(css).toContain('translateX(587px)')
    /** ⚠️ Negativo: positivo empurra o tracejado para trás, e a pista corria contra o cenário. */
    expect(css).toContain('stroke-dashoffset: -11')
    /** E no mesmo ritmo: a duração da pista é a fração da faixa que um período do risco ocupa. */
    expect(readApplicationFile('src/components/ui/cargo-vehicle.tsx')).toContain('roadDashRatio()')
    expect(css).toContain('cargoWheel var(--wheel-duration, 0.1s) linear infinite reverse')
    /** Sem raios o giro é invisível: um círculo girando no próprio centro não muda nada. */
    expect(readApplicationFile('src/components/ui/cargo-vehicle.tsx')).toContain('styles.spoke')
  })

  /**
   * ⚠️ O veículo fica parado ao meio da faixa: quem anda é o mundo. O vai-e-vem que havia aqui o
   * fazia andar de ré metade do tempo.
   */
  test('o veículo assenta no meio e não vai e volta', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    expect(source).toContain('resolveStageOffset(shape)')
    expect(css).not.toContain('cargoAdvance')
  })

  /** ⚠️ A roda **toca** a estrada: com o centro na linha do chão, meia roda ficava enterrada. */
  test('a roda encosta no chão em vez de afundar nele', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('const cy = ROAD_Y - radius')
  })

  /**
   * ⚠️ Todo elemento que **escala ou gira** precisa de `transform-box: fill-box`. Sem ele a origem é
   * o canto do SVG, e a peça descreve uma órbita em vez de girar (a roda) ou é empurrada para longe
   * em vez de crescer no lugar (a fumaça, que descia).
   */
  test('o que gira ou escala tem origem no próprio contorno', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    for (const scaled of ['.wheelGroup', '.smoke']) {
      const block = css.slice(
        css.indexOf(`${scaled} {`),
        css.indexOf('}', css.indexOf(`${scaled} {`)),
      )
      expect(block).toContain('transform-box: fill-box')
    }
  })

  /** A carga sacode mais que o chassi — é ela que está solta no baú. */
  test('as caixas balançam', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    expect(css).toContain('cargoShake')
    expect(readApplicationFile('src/components/ui/cargo-vehicle.tsx')).toContain('styles.cargo')
  })

  /**
   * ⚠️ A cabine sai do **topo do baú**, não de uma altura absoluta — e assenta no **mesmo chassi**.
   * Eram os dois jeitos de a frente sair errada: teto solto da carga, e piso mais baixo que ela.
   */
  test('a frente acompanha a carga em cima e embaixo', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('shape.bodyFloorM + shape.bodyHeightM - shape.cabDropM')
    expect(source).toContain('const floor = GROUND - toUnits(shape.bodyFloorM)')
    expect(source).not.toContain('cabHeightM: ')
  })

  /**
   * ⚠️ O horizonte é **gerado**, não uma lista escrita à mão: itens repetidos viram padrão, e padrão
   * é a única coisa que o olho não perdoa num fundo que passa em laço. Gerado com o mesmo hash das
   * caixas — parece sorteado e é sempre igual.
   */
  test('montanhas, nuvens e postes são gerados e variados', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    for (const builder of ['buildMountains()', 'buildClouds()', 'buildPosts()']) {
      expect(source).toContain(builder)
    }
    expect(source).toContain('function hash(seed: number)')
  })

  /**
   * ⚠️ **A rolagem não tem emenda.** As cópias do cenário ficam atrás da faixa (`-span` e `0`), e a
   * animação as traz para dentro: com elas à frente (`0` e `+span`) as duas saíam pela direita no
   * fim do ciclo, a esquerda ficava vazia e a tela piscava com tudo repontando do nada.
   */
  test('o cenário rola sem emenda', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('const SCENERY_REPEATS = [-VIEWBOX_SCENERY_SPAN, 0]')
  })

  /** Poste sem fio é um risco vertical passando; com fio e cruzeta, vira beira de estrada. */
  test('os postes têm cruzeta e fios em catenária', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('WIRE_SAGS')
    expect(source).toContain('buildWire(')
    /** A barriga é o que distingue o fio de uma reta ligando dois pontos. */
    expect(source).toContain('Math.max(y1, y2) + input.sag')
  })

  /**
   * ⚠️ O raio da roda é **por tipo**. Fixo, dava um pneu de 1,04 m de diâmetro numa Fiorino — maior
   * que o de um truck real —, e o desenho inteiro se desmanchava em volta disso.
   */
  test('cada tipo tem a roda do seu porte', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('wheelRadiusM: number')
    expect(source).toContain('wheelRadiusM: 0.31')
    expect(source).toContain('wheelRadiusM: 0.52')
    /** E o giro acompanha o raio: pneu pequeno dá mais voltas no mesmo trecho. */
    expect(source).toContain('2 * Math.PI * radiusM')
  })

  /**
   * ⚠️ O céu segue o tema — estrela no escuro, nuvem no claro —, e o tema tem **duas portas**: o
   * botão (`data-theme`) e a media query do sistema. Um bloco só cobriria metade dos usuários.
   */
  test('o céu troca com o tema, nas duas portas', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')

    expect(css).toContain(":root[data-theme='light'] .stars")
    expect(css).toContain('@media (prefers-color-scheme: light)')
    expect(css).toContain(":root:not([data-theme='dark']) .stars")
    /** Estrela não corre: o céu está longe demais para passar. Ela cintila, e é isso. */
    expect(css).toContain('cargoStar')
  })

  /** Quem pediu menos movimento vê o caminhão parado, a carga pronta e nenhuma fumaça. */
  test('respeita prefers-reduced-motion em tudo que se move', () => {
    const css = readApplicationFile('src/components/ui/cargo-vehicle.module.css')
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion'))

    for (const animated of [
      '.box',
      '.road',
      '.scenery',
      '.sceneryMid',
      '.sceneryFar',
      '.rig',
      '.smoke',
      '.wheelGroup',
    ]) {
      expect(reduced).toContain(animated)
    }
  })

  /**
   * ⚠️ A escala **entre** os tipos é a informação: um `viewBox` por tipo faria a moto e a carreta
   * saírem do mesmo tamanho na tela, e o desenho passaria a mentir sobre porte. A régua é uma só, e
   * cada veículo ocupa a fração dela que lhe cabe.
   */
  test('mantém uma régua só para todos os tipos', () => {
    const source = readApplicationFile('src/components/ui/cargo-vehicle.tsx')

    expect(source).toContain('UNITS_PER_METRE')
    expect(source).toContain('totalLengthM')
    /** `viewBox` fixo: a largura não pode sair do tipo, senão a régua muda a cada veículo. */
    /** ⚠️ A proporção do `viewBox` acompanha a da faixa: descasadas, `slice` corta o caminhão. */
    expect(source).toContain('const VIEWBOX = { height: 44, width: 587 }')
    /** ⚠️ `slice`: o cenário cobre a faixa inteira. Em proporção real o veículo nunca cobriria uma
     * faixa de 8:1, e esticá-lo para isso desenharia um caminhão que não existe. */
    expect(source).toContain('preserveAspectRatio="xMinYMax slice"')
  })

  /**
   * O corpo do detalhe da viagem traz `vehicleId` e nada mais — o tipo vem da frota carregada. Sem
   * essa busca a silhueta cai no contorno genérico, e quem abre o detalhe de um truck vê um VUC.
   */
  test('o detalhe da viagem informa o tipo do veículo', () => {
    const detail = readApplicationFile('src/modules/trip/components/TripDetail.component.tsx')

    expect(detail).toContain('vehicleType={vehicles.find((entry) => entry.id === trip.vehicleId)')
  })
})
