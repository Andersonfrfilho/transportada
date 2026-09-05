/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const SERVICE = new URL('../../src/modules/trip/shared/vectorBasemap.service.ts', import.meta.url)
const ASSEMBLY = new URL(
  '../../src/modules/trip/components/AssemblyVectorMap.component.tsx',
  import.meta.url,
)
const STYLES = new URL('../../src/styles/index.css', import.meta.url)

/**
 * Tokens que **trocam de significado** entre o tema claro e o escuro do painel. Névoa é quase branca
 * num e quase preta no outro; asfalto e grafite fazem o mesmo, ao contrário.
 */
const INVERTEM_COM_O_TEMA = [
  '--color-fog',
  '--color-asphalt',
  '--color-graphite',
  '--color-slate',
  '--color-copper',
  '--color-ready',
  '--color-alert',
] as const

describe('a cartografia do basemap não segue o tema do painel', () => {
  /**
   * ⚠️ **A raiz de "nos outros temas não dá para enxergar nada".** A paleta do basemap era montada
   * com tokens do painel, e o tema "claro" do mapa pintava terra com `--color-fog`: certo com o
   * painel escuro, **invertido** com o painel claro — terra quase preta e rótulo quase branco.
   *
   * O arquivo já registrava dois incidentes desta mesma família antes deste contrato existir. A
   * diferença é que os dois foram consertados caso a caso, e a causa continuou de pé.
   */
  it('nenhum tema do mapa pede token que inverte com o documento', () => {
    const source = readFileSync(SERVICE, 'utf8')
    const paleta = source.slice(
      source.indexOf('const PALETTE'),
      source.indexOf('\n}\n', source.indexOf('const PALETTE')),
    )

    for (const token of INVERTEM_COM_O_TEMA) {
      expect(paleta).not.toContain(`'${token}'`)
    }
  })

  it('toda cor do basemap sai da paleta própria', () => {
    const source = readFileSync(SERVICE, 'utf8')
    const paleta = source.slice(
      source.indexOf('const PALETTE'),
      source.indexOf('\n}\n', source.indexOf('const PALETTE')),
    )
    const tokens = [...paleta.matchAll(/'(--color-[a-z0-9-]+)'/gu)].map((match) => match[1] ?? '')

    expect(tokens.length).toBeGreaterThan(20)
    for (const token of tokens) expect(token).toStartWith('--color-basemap-')
  })

  /** Declarados uma vez, fora dos blocos de tema — é isso que os faz não inverter. */
  it('os tokens do basemap não são redeclarados no tema claro', () => {
    const css = readFileSync(STYLES, 'utf8')
    const nomes = [...css.matchAll(/(--color-basemap-[a-z-]+):/gu)].map((match) => match[1] ?? '')

    expect(new Set(nomes).size).toBeGreaterThan(8)
    for (const nome of new Set(nomes)) {
      const ocorrencias = [...css.matchAll(new RegExp(`${nome}:`, 'gu'))].length
      expect(ocorrencias).toBe(1)
    }
  })

  /**
   * ⚠️ **`styledata` dispara antes de o estilo estar pronto.** Trocar o tema chama `setStyle`, que
   * descarta fonte e camada customizadas; com `styledata` os efeitos remontavam a linha do roteiro
   * cedo demais e o estilo, ao terminar de carregar, a descartava de novo.
   *
   * O sintoma não era simétrico e por isso enganava: pino é marcador de DOM e sobrevivia; a linha é
   * camada do estilo e sumia. Ficavam os pontos e nenhum traço.
   */
  it('espera o estilo carregar antes de remontar a rota', () => {
    const source = readFileSync(ASSEMBLY, 'utf8')

    expect(source).toContain("map.once('style.load'")
    expect(source).toContain('isStyleLoaded()')
  })
})

function hexOf(css: string, token: string): string {
  const match = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'u').exec(css)
  if (match === null) throw new Error(`token sem valor: ${token}`)
  return match[1] ?? ''
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const linear = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

function contrast(first: string, second: string): number {
  const [brighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  )
  return ((brighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

/** Extrai `{papel: token}` de um bloco de tema da constante `PALETTE`. */
function themeTokens(source: string, theme: string): Readonly<Record<string, string>> {
  const start = source.indexOf(`  ${theme}: {`)
  const block = source.slice(start, source.indexOf('\n  },', start))
  return Object.fromEntries(
    [...block.matchAll(/(\w+): '(--color-basemap-[a-z-]+)'/gu)].map((match) => [
      match[1] ?? '',
      match[2] ?? '',
    ]),
  )
}

describe('os três temas do mapa são legíveis', () => {
  const source = readFileSync(SERVICE, 'utf8')
  const css = readFileSync(STYLES, 'utf8')

  /**
   * ⚠️ **A água tinha um tom só, e a terra tem dois.** `#17298a` sobre o papel claro dá 10,6; sobre
   * a terra escura dava **1,34** — rio, represa e o próprio litoral desapareciam no tema escuro,
   * que é exatamente o "não dá para enxergar nada". Medir foi o que apontou isso: no desenho o mapa
   * escuro parecia só um mapa escuro.
   */
  it('a água se separa da terra em todo tema', () => {
    for (const theme of ['claro', 'escuro', 'contraste'] as const) {
      const tokens = themeTokens(source, theme)
      const razao = contrast(hexOf(css, tokens.agua ?? ''), hexOf(css, tokens.terra ?? ''))

      expect({ razao: razao >= 2, theme }).toEqual({ razao: true, theme })
    }
  })

  /** Rótulo é texto: ele não se contenta com "aparece", ele precisa do piso de leitura da WCAG. */
  it('o rótulo lê contra a terra em todo tema', () => {
    for (const theme of ['claro', 'escuro', 'contraste'] as const) {
      const tokens = themeTokens(source, theme)

      expect(
        contrast(hexOf(css, tokens.rotulo ?? ''), hexOf(css, tokens.terra ?? '')),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('arrastar o mapa não o derruba', () => {
  const source = readFileSync(ASSEMBLY, 'utf8')

  /**
   * ⚠️ **A raiz do "a tela toda está piscando".** O tratador de `error` chamava `onBasemapMissing()`
   * sem olhar o quê: o MapLibre emite `error` **por tile**, e arrastar o mapa produz um punhado
   * deles. Um tile que falhava desmontava o mapa inteiro, o pai remontava, o mapa rebuscava tudo e
   * falhava de novo — o laço rodava a cada arrasto, e por isso o sintoma era pisca **e** lentidão,
   * nunca "o mapa sumiu".
   *
   * Depois do `load` o arquivo já provou que existe. Só a falha **antes** de abrir é a ausência que
   * a ADR-0044 §6 manda degradar para a lista.
   */
  it('erro depois de o mapa abrir não degrada para a lista', () => {
    const inicio = source.indexOf("map.on('error'")
    const handler = source.slice(inicio, source.indexOf('\n    })', inicio))

    /** A guarda vem **antes** da degradação, senão ela não guarda nada. */
    const guarda = handler.indexOf('if (basemapLoaded.current) return')
    const degrada = handler.lastIndexOf('onBasemapMissing()')

    expect(guarda).toBeGreaterThan(-1)
    expect(degrada).toBeGreaterThan(guarda)
  })

  /** O cross-fade redesenha o quadro inteiro a cada tile que entra — é pisca por construção. */
  it('o mapa nasce sem cross-fade de tile', () => {
    expect(source).toMatch(/fadeDuration: 0/u)
  })

  /**
   * ⚠️ **O padrão é o papel bege.** Seguir o tema do painel fazia o mapa nascer quase preto para
   * quem usa o painel escuro. A escolha explícita continua mandando; o que muda é o ponto de
   * partida de quem nunca escolheu.
   */
  it('sem escolha, o mapa abre no tema claro', () => {
    expect(source).toMatch(/chosenTheme \?\? 'claro'/u)
    expect(source).not.toContain('basemapThemeForApp')
  })
})

describe('o roteiro sobrevive a toda troca de tema', () => {
  const source = readFileSync(ASSEMBLY, 'utf8')

  /**
   * ⚠️ **Três tentativas anteriores falharam por tratar "o estilo mudou" como um instante.** O
   * `setStyle` da troca de tema resolve por **diff**: ele aplica as diferenças em vez de recarregar,
   * e por isso `style.load` **nunca é emitido** — a espera por evento não terminava, e a camada do
   * roteiro, que é acrescentada em tempo de execução e não existe no estilo novo, era apagada pelo
   * próprio diff. Medido: a primeira troca voltava a funcionar e a segunda não.
   *
   * A resposta é idempotente e repetida — reaplicar em todo `styledata`, acrescentando só o que
   * falta. Por isso a inscrição é `on`, nunca `once`.
   */
  it('a camada se recoloca a cada mudança de estilo', () => {
    expect(source).toContain("map.on('styledata', () => applyRoute(map))")
    expect(source).not.toContain("map.once('styledata'")
  })

  /**
   * ⚠️ **`isStyleLoaded()` não é a pergunta certa, e usá-la como portão apagava o traço sempre.**
   * Medido: ela responde `false` em toda a janela em que este código roda, porque significa "toda
   * fonte e telha terminou de carregar" — não "dá para acrescentar camada".
   */
  it('a aplicação do roteiro não é barrada por isStyleLoaded', () => {
    const aplicacao = source.slice(
      source.indexOf('const applyRoute'),
      source.indexOf('}, [])', source.indexOf('const applyRoute')),
    )

    expect(aplicacao).toContain('addLayer')
    /** A prosa pode citá-lo; o que não pode existir é o portão. */
    expect(aplicacao).not.toMatch(/if \(!map\.isStyleLoaded\(\)\) return/u)
  })
})
