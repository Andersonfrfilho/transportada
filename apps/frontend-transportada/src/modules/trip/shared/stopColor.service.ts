/**
 * A cor da parada — o disco na lista, o traço no mapa e as caixas na planta do baú.
 *
 * ⚠️ **Nenhuma parada repete a cor de outra.** A paleta eram seis tons com volta na sétima: medido
 * na tela em 2026-09-09, uma viagem de 24 paradas pintava quatro delas de verde, e a cor deixava de
 * identificar a parada — que é a única coisa que ela faz aqui. Uma tabela maior só adiaria o
 * problema para a parada seguinte ao fim dela.
 *
 * A cor é escolhida por **ponto mais distante**: a próxima parada recebe, de um conjunto de
 * candidatos, aquela cuja distância em CIELab às cores **já usadas e ao que se desenha sobre mapa**
 * é a maior possível. Duas tentativas mais simples ficaram pelo caminho, e as duas foram medidas:
 * matiz por ângulo áureo isolado dá ΔE 6,2 entre 24 paradas (perceptualmente a mesma cor), e
 * empurrar o matiz para longe do tema derruba a separação entre paradas para 2,8.
 *
 * ⚠️ **A luminância não é livre.** A mesma paleta serve o tema escuro e o claro — ela não é
 * redeclarada —, e contraste ≥ 2,4 contra os dois fundos só existe numa janela estreita de
 * luminância relativa, entre ~0,11 e ~0,33. É ela que exclui o pastel e o quase preto, que numa
 * tela leem bem e na outra somem.
 */

/**
 * O que já se desenha **sobre mapa**: o tema e as zonas de frete.
 *
 * ⚠️ Cópia por valor dos tokens de `index.css`, porque a cor é calculada sem DOM e
 * `getComputedStyle` devolveria vazio no teste. O contrato compara as duas listas — a colisão que
 * originou esta regra era **literal**: `--color-cargo-stop-2` era exatamente `--color-copper`, e o
 * roteiro sumia dentro dos outros traços do mapa.
 */
const MAP_SURFACE = [
  /** Tema escuro. */
  '#d58a47',
  '#6aae8c',
  '#ff5f57',
  '#8fa3ad',
  '#f0f2ee',
  '#1c2b33',
  '#10222c',
  /** ⚠️ **E o tema claro**, que redeclara os mesmos tokens: a parada precisa se ver nos dois. */
  '#a3591f',
  '#2e7d54',
  '#c2382f',
  '#5a6b74',
  '#1d2b33',
  '#fbf9f5',
  '#f2efe9',
  /** As zonas do mapa de frete, que não mudam com o tema. */
  '#4a86b8',
  '#4aa8a0',
  '#7bb85a',
  '#d9b13c',
  '#d9603c',
] as const

/** Alvos de **luminância relativa**, todos dentro da janela que serve aos dois temas. */
const LUMINANCE_TARGETS = [0.15, 0.22, 0.3] as const
const SATURATIONS = [0.72, 0.86, 1] as const
const HUE_STEP_DEGREES = 4

const candidates = buildCandidates()
const chosen: string[] = []
const chosenLabs: (readonly number[])[] = MAP_SURFACE.map((hex) => toLab(toChannels(hex)))

/**
 * A parada é numerada a partir de **1**, e é essa a entrada: quem tem índice de array converte na
 * chamada, e não aqui — dois contratos de numeração na mesma função é como a divergência começa.
 */
export function stopColorOf(sequence: number): string {
  const position = Math.max(0, Math.trunc(sequence) - 1)
  while (chosen.length <= position) chosen.push(pickFarthest())

  return chosen[position] ?? chosen[0] ?? '#ffffff'
}

/**
 * ⚠️ O MapLibre pinta em canvas e **não resolve `var()`** — foi por isso que a paleta viveu em
 * tokens com um resolvedor de `getComputedStyle` ao lado. Com a cor calculada o valor já é literal,
 * e o canvas, o SVG e o CSS recebem a mesma string: some a chance de o traço divergir do disco por
 * causa de onde cada um leu a cor.
 */
export function resolveStopColor(sequence: number): string {
  return stopColorOf(sequence)
}

/** ⚠️ O sorteio é **determinístico**: mesma parada, mesma cor, em toda tela e em todo recarregamento. */
function pickFarthest(): string {
  let best = candidates[0]
  let bestDistance = -1

  for (const candidate of candidates) {
    let nearest = Number.POSITIVE_INFINITY
    for (const used of chosenLabs) nearest = Math.min(nearest, labDistance(candidate.lab, used))
    if (nearest > bestDistance) {
      best = candidate
      bestDistance = nearest
    }
  }

  const picked = best ?? candidates[0]
  if (picked === undefined) return '#ffffff'
  chosenLabs.push(picked.lab)

  return picked.hex
}

function buildCandidates(): readonly Readonly<{ hex: string; lab: readonly number[] }>[] {
  const built: { hex: string; lab: readonly number[] }[] = []
  for (let hue = 0; hue < 360; hue += HUE_STEP_DEGREES) {
    for (const saturation of SATURATIONS) {
      for (const target of LUMINANCE_TARGETS) {
        const channels = atLuminance({ hue, saturation, target })
        built.push({ hex: toHex(channels), lab: toLab(channels) })
      }
    }
  }

  return built
}

function labDistance(first: readonly number[], second: readonly number[]): number {
  return Math.hypot(...first.map((value, index) => value - (second[index] ?? 0)))
}

/**
 * A lightness que põe a cor **na luminância pedida**. Ela não é a lightness do HSL: o amarelo a 50%
 * pesa muito mais que o azul a 50%, e fixá-la daria contraste diferente por matiz — que é o que a
 * janela dos dois temas não admite.
 */
function atLuminance(
  input: Readonly<{ hue: number; saturation: number; target: number }>,
): readonly number[] {
  let low = 0
  let high = 1
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2
    if (relativeLuminance(toRgb({ ...input, lightness: middle })) < input.target) low = middle
    else high = middle
  }

  return toRgb({ ...input, lightness: (low + high) / 2 })
}

function toRgb(
  input: Readonly<{ hue: number; lightness: number; saturation: number }>,
): readonly number[] {
  const amplitude = input.saturation * Math.min(input.lightness, 1 - input.lightness)
  const channel = (offset: number): number => {
    const position = (offset + input.hue / 30) % 12

    return input.lightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1))
  }

  return [channel(0), channel(8), channel(4)]
}

function toChannels(hex: string): readonly number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
}

function linearise(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(channels: readonly number[]): number {
  const [red = 0, green = 0, blue = 0] = channels.map(linearise)

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** CIELab, que é onde "parece a mesma cor" vira número — RGB cru mente em torno do verde. */
function toLab(channels: readonly number[]): readonly number[] {
  const [red = 0, green = 0, blue = 0] = channels.map(linearise)
  const x = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047
  const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const z = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883
  const pivot = (value: number): number =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116

  return [116 * pivot(y) - 16, 500 * (pivot(x) - pivot(y)), 200 * (pivot(y) - pivot(z))]
}

function toHex(channels: readonly number[]): string {
  const pair = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${channels.map(pair).join('')}`
}
