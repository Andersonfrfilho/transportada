/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 121: **a caixa é pintada pela cor da NOTA**, não pela cor da parada.
 *
 * A 119 dava à nota um *tom* da cor da parada, e o tom pagava caro: a paleta de paradas é densa em
 * CIELab, e a trava que impedia um tom de ler como outra parada devolvia poucos tons — na viagem de
 * 85 paradas as notas de uma parada repetiam tom. Hoje cada nota tem cor própria, e é a parada que
 * deixa de ser um bloco de uma cor só — ver `TripCargoLayers`, onde ela continua identificável pela
 * ficha (que lista as notas dela, com as cores que estão no desenho), pelo número da entrega, pela
 * divisa entre fatias e pelo destaque ao clicar.
 *
 * ## Como a lista foi montada, e como acrescentar cor
 *
 * Ela é **ponto mais distante** em CIELab, como a paleta das paradas, e está **ordenada das cores
 * mais diferentes para as menos**: a nota N recebe a posição N, então a viagem pequena usa só o topo
 * da lista, onde as cores são bem distintas, e a variedade extra só entra quando a viagem cresce.
 * Medido no prefixo: ΔE mínimo 18,3 com 4 notas · 12,9 com 16 · 10,6 com 32 · 9,4 com 64 · 8,5 com
 * 94 (a maior viagem real) · 8,1 com as 128. A garantia é essa monotonia, e é ela que o contrato
 * cobra — nunca um valor cravado em cima de uma cor.
 *
 * Cor nova **entra no fim**, nunca no meio: inserir no meio troca a cor de toda nota depois dela, e
 * a mesma nota mudaria de cor entre dois carregamentos da mesma tela. O contrato exige de cada item:
 * seis dígitos hexadecimais em caixa baixa, luminância relativa dentro da janela que serve aos dois
 * temas (~0,11 a 0,33), contraste ≥ 2,4 contra os dois fundos, e distância CIELab suficiente de toda
 * outra cor da lista, do `MAP_SURFACE` e das primeiras cores de parada.
 *
 * ⚠️ **Ela não colide com a cor de parada, e isso custou separação.** `TripAssemblyMap` (discos e
 * traços por parada) e `TripCargoPanel` ficam **na mesma tela** na proposta e no diálogo de criação:
 * gerar a paleta da nota só contra o `MAP_SURFACE` devolvia exatamente a sequência de
 * `stopColorOf` — cor de nota **idêntica** à cor de uma parada ao lado. Por isso a geração é semeada
 * também com as 96 primeiras cores de parada (a maior viagem real tem 85), e a densidade da grade de
 * candidatos foi aumentada para pagar a conta: 2° de matiz e cinco saturações, contra 4° e três da
 * paleta de paradas. Medido com 128 cores: sem semear, ΔE 9,28 entre notas e **identidade** com as
 * paradas; semeando na grade antiga, 6,61 — abaixo dos 6,2 que a 119 mediu como "a mesma cor"; com a
 * grade densa, **8,09**, e ΔE 8,21 até a cor de parada mais próxima.
 *
 * ⚠️ **A luminância continua presa à janela dos dois temas.** A paleta **não é redeclarada por
 * tema**, exatamente como a das paradas: os três alvos de luminância relativa são os mesmos
 * (0,15 · 0,22 · 0,30), e o contraste medido é 3,09 contra o fundo escuro e 2,84 contra o claro.
 *
 * ⚠️ **Acabando a lista, a nota 129 repete a cor da nota 1** — a repetição mais distante possível na
 * ordem —, e a tela **diz quantas notas repetiram**. Repetir calado é o defeito que a paleta de
 * paradas já corrigiu uma vez: a cor deixa de identificar, e ninguém descobre. Nenhuma viagem real
 * chega lá: a maior medida tem 94 notas.
 */
export const NOTE_COLORS: readonly string[] = [
  '#d77e5d',
  '#bc2f97',
  '#b04f2c',
  '#bf53d4',
  '#377b1f',
  '#c53163',
  '#c03082',
  '#d55864',
  '#da6bcf',
  '#9742d0',
  '#f84cd6',
  '#a159ff',
  '#dc749a',
  '#f300aa',
  '#5d741d',
  '#6597d9',
  '#e200e9',
  '#dd777a',
  '#b22fbb',
  '#932ff7',
  '#f3638e',
  '#ef2e82',
  '#a361e5',
  '#0b9090',
  '#7e6b1f',
  '#ff005d',
  '#db5800',
  '#df3da9',
  '#288da1',
  '#ac5306',
  '#0d72ac',
  '#cc39f0',
  '#b4902d',
  '#7d51d4',
  '#ff123a',
  '#986000',
  '#d249bb',
  '#d25d4b',
  '#c34ae2',
  '#635bd6',
  '#ca009b',
  '#2c9aef',
  '#06a797',
  '#db70b4',
  '#f0346c',
  '#7649f1',
  '#078cb4',
  '#76a30c',
  '#9185ff',
  '#0081f1',
  '#f46770',
  '#e04296',
  '#1cac2a',
  '#6075f9',
  '#9d7d27',
  '#44aa00',
  '#aa772b',
  '#d45483',
  '#888ee1',
  '#4ca92a',
  '#dc5626',
  '#ed49ff',
  '#f3695f',
  '#3485cc',
  '#c16a30',
  '#806b00',
  '#057c48',
  '#e05040',
  '#6b7ada',
  '#d35197',
  '#189452',
  '#f86649',
  '#8970db',
  '#ff549e',
  '#ab7bff',
  '#c933ff',
  '#e14971',
  '#e37900',
  '#a066d9',
  '#0b9627',
  '#84a028',
  '#316bc2',
  '#956125',
  '#dd7c31',
  '#da7a6c',
  '#00ac56',
  '#e37655',
  '#317c00',
  '#d043d0',
  '#fa0085',
  '#8d64ff',
  '#c00eba',
  '#b64ff2',
  '#5a5ae4',
  '#0085de',
  '#0089c4',
  '#698c23',
  '#aa09ef',
  '#c83246',
  '#bd7ade',
  '#e900d2',
  '#ff578f',
  '#d561ff',
  '#c1401f',
  '#647300',
  '#df39b8',
  '#8a3cf0',
  '#c33170',
  '#f35fa9',
  '#f0394b',
  '#ff5c6c',
  '#d22310',
  '#ef3e2b',
  '#ba462f',
  '#f258c4',
  '#ff28ff',
  '#00aa77',
  '#d24daa',
  '#d70846',
  '#ff3edf',
  '#0b768c',
  '#147d26',
  '#c18c0f',
  '#519bd4',
  '#949b27',
  '#007b5e',
  '#e24b64',
  '#b456e4',
]

/** A cor de cada nota, pelo `documentId`. Nota ausente do mapa é caixa sem nota conhecida. */
export type NoteColors = ReadonlyMap<string, string>

type NoteBox = Readonly<{ documentId?: string | null | undefined; stopSequence: number }>

export type StopNote = Readonly<{
  boxes: number
  /** A cor que as caixas desta nota têm no desenho — a amostra da ficha usa a mesma string. */
  color: string
  documentId: string
  documentNumber: string | null
  /** Spec 120: quantos pedaços a nota virou no desenho. Ausente é "não foi dividida". */
  pieces?: number
}>

type RawSplitNote = Readonly<{ documentId: string; pieces: number }>

/**
 * Spec 120: as notas que o desenho dividiu em mais de um pedaço, lidas de `placement.splitNotes`.
 *
 * ⚠️ **Leitura tolerante, nunca validação.** A API antiga não manda o campo — `undefined` é lista
 * vazia — e um item malformado não pode derrubar a planta inteira por causa de uma nota que a ficha
 * nem chegaria a marcar sozinha: o item ruim é só ignorado.
 */
export function resolveSplitPieces(splitNotes: unknown): ReadonlyMap<string, number> {
  const pieces = new Map<string, number>()
  if (!Array.isArray(splitNotes)) return pieces
  for (const entry of splitNotes) {
    const candidate = entry as Partial<RawSplitNote> | null
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      typeof candidate.documentId === 'string' &&
      typeof candidate.pieces === 'number' &&
      Number.isInteger(candidate.pieces) &&
      candidate.pieces > 1
    ) {
      pieces.set(candidate.documentId, candidate.pieces)
    }
  }
  return pieces
}

/**
 * A cor de cada nota do desenho.
 *
 * ⚠️ **A nota recebe a cor pela posição do id dela entre todos os ids do desenho, ordenados** — nunca
 * pela ordem em que as caixas chegam, e nunca pela parada. A mesma nota sai na mesma cor em todo
 * redesenho, e **trocar a ordem das paradas não repinta a carga**: fosse a ordenação por parada, a
 * reordenação da proposta (spec 111) trocaria a cor de tudo a cada seta clicada.
 *
 * ⚠️ **A posição é global, não por parada.** Duas notas da mesma parada precisam se distinguir uma da
 * outra, e é só isso que a cor por parada não entregava.
 */
export function resolveNoteColors(boxes: readonly NoteBox[]): NoteColors {
  const identifiers = new Set<string>()
  for (const box of boxes) {
    if (box.documentId !== null && box.documentId !== undefined) identifiers.add(box.documentId)
  }

  return new Map(
    [...identifiers]
      .sort()
      .map(
        (documentId, rank) => [documentId, NOTE_COLORS[rank % NOTE_COLORS.length] ?? ''] as const,
      ),
  )
}

/**
 * A cor da caixa. **Caixa sem nota conhecida volta à cor da parada** — `documentId` nulo é "não se
 * sabe" (spec 119), e inventar uma cor de nota para ela afirmaria uma nota que ninguém carimbou.
 * Medido nas quatro viagens reais de 2026-09-10: 693 de 693 caixas do Atego trazem nota.
 */
export function noteColorOf(colors: NoteColors, box: NoteBox, fallback: string): string {
  if (box.documentId === null || box.documentId === undefined) return fallback

  return colors.get(box.documentId) ?? fallback
}

/**
 * Quantas notas do desenho tiveram de repetir cor por a lista ter acabado. A tela imprime este
 * número: repetir calado faz a cor deixar de identificar sem ninguém perceber.
 */
export function countNotesSharingColor(colors: NoteColors): number {
  return Math.max(0, colors.size - NOTE_COLORS.length)
}

/**
 * As notas de cada parada, pelo número impresso — é por ele que a nota é procurada. Caixa sem nota
 * conhecida não vira linha: não há o que acender por ela.
 */
export function buildStopNotes(
  boxes: readonly (NoteBox & Readonly<{ documentNumber?: string | null | undefined }>)[],
  colors: NoteColors = resolveNoteColors(boxes),
  /** Spec 120: quantos pedaços cada nota dividida virou — ausente da nota é "não dividida". */
  splitPieces: ReadonlyMap<string, number> = new Map(),
): ReadonlyMap<number, readonly StopNote[]> {
  const byStop = new Map<number, Map<string, { boxes: number; documentNumber: string | null }>>()
  for (const box of boxes) {
    if (box.documentId === null || box.documentId === undefined) continue
    const notes =
      byStop.get(box.stopSequence) ??
      new Map<string, { boxes: number; documentNumber: string | null }>()
    const current = notes.get(box.documentId) ?? {
      boxes: 0,
      documentNumber: box.documentNumber ?? null,
    }
    current.boxes += 1
    notes.set(box.documentId, current)
    byStop.set(box.stopSequence, notes)
  }

  return new Map(
    [...byStop].map(([sequence, notes]) => [
      sequence,
      [...notes]
        .map(([documentId, note]) => {
          const pieces = splitPieces.get(documentId)
          return {
            boxes: note.boxes,
            color: colors.get(documentId) ?? '',
            documentId,
            documentNumber: note.documentNumber,
            ...(pieces === undefined ? {} : { pieces }),
          }
        })
        .sort(compareNotes),
    ]),
  )
}

function compareNotes(first: StopNote, second: StopNote): number {
  if (first.documentNumber === null || second.documentNumber === null) {
    if (first.documentNumber !== second.documentNumber)
      return first.documentNumber === null ? 1 : -1
    return first.documentId < second.documentId ? -1 : 1
  }
  const byNumber = first.documentNumber.localeCompare(second.documentNumber, 'pt-BR', {
    numeric: true,
  })
  if (byNumber !== 0) return byNumber

  return first.documentId < second.documentId ? -1 : 1
}
