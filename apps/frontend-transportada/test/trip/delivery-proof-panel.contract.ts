/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import { DELIVERY_PROOF_RECEIVED_BY_OPTIONS } from '../../src/modules/trip/shared/trip.constant'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripDeliveryProof.component.tsx',
  import.meta.url,
)
const READINGS = new URL(
  '../../src/modules/trip/components/ProofReadings.component.tsx',
  import.meta.url,
)
const TRIP_STYLES = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const ROW = new URL('../../src/modules/trip/components/TripStopList.component.tsx', import.meta.url)
/**
 * A spec 220 tirou a miniatura do painel para arquivo próprio (T5.8) e abriu a galeria (T5.4). A
 * URL assinada passou a ser tocada nos três — e uma guarda que só lê o painel deixaria de ver
 * justamente os arquivos onde a URL agora vive.
 */
const PROOF_IMAGE = new URL(
  '../../src/modules/trip/components/ProofImage.component.tsx',
  import.meta.url,
)
const GALLERY = new URL(
  '../../src/modules/trip/components/ProofGalleryDialog.component.tsx',
  import.meta.url,
)

const HELD_URL_IN_STATE = /useState\b[^\n]*[Uu]rl/
const URL_INTO_SETTER = /set[A-Z]\w*\([^)]*downloadUrl/

/**
 * Spec 079 T006 e T025 — são a mesma tela: "ver anexos da entrega" é abrir o comprovante. Contrato
 * por texto de fonte, porque o teste desta app não tem DOM.
 */
describe('comprovante da entrega na tela (spec 079 T006/T025)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  /**
   * O que importa não é o componente citar os quatro nomes — `delivered-with-proof` é a queda, e
   * exigir o literal seria cobrar forma. O que importa é que os três fatos que se confundem tenham
   * **rótulos diferentes**: "não entregue", "entregue sem comprovante" e "devolvida".
   */
  it('separa na tela os estados que se confundem', () => {
    for (const state of ['delivered-without-proof', 'not-delivered', 'returned']) {
      expect(source).toInclude(state)
    }

    const rotulos = [
      trip.deliveryProof.notDelivered,
      trip.deliveryProof.withoutProof,
      trip.deliveryProof.returned,
    ]

    expect(new Set(rotulos).size).toBe(rotulos.length)
    expect(trip.deliveryProof.withoutProof).toInclude('sem comprovante')
    expect(trip.deliveryProof.notDelivered).not.toInclude('sem comprovante')
  })

  /**
   * ⚠️ A URL do comprovante **expira**. Uma tela que a guarda em estado e a reusa depois mostra
   * imagem quebrada sem dizer por quê; o componente a consome direto do que a consulta trouxe.
   *
   * A guarda mira a URL, não o tipo `string`. A redação anterior (`not.toInclude('useState<string')`)
   * errava dos dois lados: reprovava estado legítimo de `string` — o id do comprovante aberto, na
   * spec 220 — e **deixava passar** a URL guardada sob qualquer apelido de tipo. Foi o que
   * aconteceu: a T5.3 nasceu com um `type OpenProofId = string | null` cuja única razão de existir
   * era escapar do texto. Contrato que se contorna com um `type` não guarda nada.
   */
  it('não guarda a URL assinada em estado próprio', () => {
    const ondeAUrlVive = [COMPONENT, PROOF_IMAGE, GALLERY]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    expect(ondeAUrlVive).not.toMatch(HELD_URL_IN_STATE)
    expect(ondeAUrlVive).not.toMatch(URL_INTO_SETTER)
    expect(ondeAUrlVive).toInclude('resolveDeliveryProofImageSource(proof)')
  })

  /** Guarda que não morde não guarda: as três formas de esconder a URL no estado são plantadas aqui. */
  it('a guarda acusa a URL plantada no estado, com ou sem apelido de tipo', () => {
    expect('const [url, setUrl] = useState<string>(proof.downloadUrl)').toMatch(HELD_URL_IN_STATE)
    expect('const [source, setSource] = useState<ProofUrl>(null)').toMatch(HELD_URL_IN_STATE)
    expect('setOpenProofSource(proof.downloadUrl)').toMatch(URL_INTO_SETTER)
    expect('const [openProofId, setOpenProofId] = useState<string | null>(null)').not.toMatch(
      HELD_URL_IN_STATE,
    )
  })

  /** Foto de canhoto não tem quem assine: o nome só aparece quando o serviço o resolveu. */
  it('imprime quem recebeu apenas quando existe', () => {
    expect(source).toInclude('view.receiverName === null ? null :')
  })

  /** Imagem sem alternativa textual é inacessível — e aqui ela descreve o que a foto é. */
  it('descreve a imagem para quem não a vê', () => {
    expect(readFileSync(PROOF_IMAGE, 'utf8')).toInclude('alt={alt}')
    expect(trip.deliveryProof.photoAlt).toBeString()
  })

  /**
   * ⚠️ **Componente órfão não é entrega.** Escrever o painel e não montá-lo passa em todo teste de
   * render por texto de fonte e não muda nada na tela de ninguém — é a forma mais fácil de dar uma
   * task por pronta sem ela estar.
   */
  it('está montado, e a linha da nota tem como abri-lo', () => {
    // ⚠️ Regex com limite de identificador, **nunca** `toInclude('<TripDeliveryProof')`: renomear
    // o componente para `<TripDeliveryProofDESLIGADO` mantém a substring e a afirmação passa. Foi o
    // que aconteceu na primeira escrita, e a mutação revelou.
    expect(readFileSync(DETAIL, 'utf8')).toMatch(/<TripDeliveryProof[\s/>]/u)
    expect(readFileSync(ROW, 'utf8')).toInclude('actions.onToggleProof(document.id)')
  })

  /** Ler o canhoto não é administrar a viagem: quem acompanha a operação o abre sem `trip.manage`. */
  it('não esconde o comprovante atrás de permissão de escrita', () => {
    const source = readFileSync(ROW, 'utf8')
    const inicio = source.indexOf('actions.onToggleProof')
    const trecho = source.slice(source.lastIndexOf('{', inicio - 200), inicio)

    expect(trecho).not.toInclude('canManage')
  })

  /**
   * Spec 079 T019 / spec 181 RF7 (T303). ⚠️ A lista de itens continua **alcançável** em todos os
   * estados, inclusive antes da entrega: é justamente antes que alguém confere se a carga está
   * completa. Amarrá-la à entrega esconderia a informação de quem mais precisa dela. RF7 mudou
   * **como** ela aparece (por trás de uma expansão, não despejada) — nunca **onde** ela existe.
   */
  it('lista os itens da nota mesmo antes de ela ser entregue', () => {
    const naoEntregue = source.slice(
      source.indexOf("view.state === 'not-delivered'"),
      source.indexOf("view.state === 'returned'"),
    )

    expect(naoEntregue).toMatch(/<TripDeliveryProofDetail[\s/>]/u)
  })

  /** Classificação fiscal é ruído para quem confere carga — e a API não a publica. */
  it('não imprime NCM nem CFOP', () => {
    expect(source).not.toInclude('ncm')
    expect(source).not.toInclude('cfop')
  })
})

/**
 * Spec 220 T4.1 (RF13): "quem recebeu" na tela, com o rótulo em português do enumerado. Contrato
 * por texto de fonte, como o resto deste arquivo.
 */
describe('quem recebeu no comprovante (spec 220 T4.1)', () => {
  const source = readFileSync(READINGS, 'utf8')
  const labels = (trip.deliveryProof as { receivedByOptions?: Record<string, string> })
    .receivedByOptions

  it('tem rótulo em português, acentuado, para cada valor do enumerado', () => {
    expect(labels).toBeDefined()

    for (const option of DELIVERY_PROOF_RECEIVED_BY_OPTIONS) {
      expect(labels?.[option]).toBeString()
      expect(labels?.[option]?.length).toBeGreaterThan(0)
    }

    expect(new Set(Object.values(labels ?? {})).size).toBe(
      DELIVERY_PROOF_RECEIVED_BY_OPTIONS.length,
    )
    expect(labels?.neighbor).toBe('Vizinho')
    expect(labels?.doorman).toBe('Porteiro')
    expect(labels?.recipient).toBe('O próprio cliente')
  })

  it('renderiza a relação a partir do rótulo, não do valor cru', () => {
    expect(source).toInclude('receivedBy')
    expect(source).toInclude('deliveryProof.receivedByOptions')
  })

  /** Comprovante antigo traz `null` (spec 193 D11): sem a linha, e sem quebrar. */
  it('não renderiza a linha quando receivedBy é null ou ausente', () => {
    expect(source).toMatch(
      /receivedBy\s*(?:===|!==|==|!=)\s*(?:null|undefined)|receivedBy\s*(?:\?\?|\?\.|&&)/u,
    )
  })

  /** Spec 193 D10: só para a tela — nunca para log, auditoria, notificação nem linha do tempo. */
  it('não deixa receivedBy vazar para log nem para a linha do tempo', () => {
    expect(source).not.toMatch(/console\./u)

    const timeline = new URL('../../src/modules/trip/components/', import.meta.url)

    for (const file of ['TripTimeline.component.tsx', 'TripTimelineItem.component.tsx']) {
      try {
        expect(readFileSync(new URL(file, timeline), 'utf8')).not.toInclude('receivedBy')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  })
})

type ProofReadingLabels = {
  readonly readings?: { readonly capturedAt?: string }
  readonly distanceKilometers?: string
  readonly distanceMeters?: string
  readonly lateRegistration?: string
  readonly punctuality?: Record<string, string>
  readonly withoutLocation?: string
}

const PROOF_LABELS = trip.deliveryProof as ProofReadingLabels
const PUNCTUALITY_BADGE_VALUES = ['on_time', 'late', 'away', 'late_and_away'] as const

/**
 * Spec 220 T4.2 (RF14/RF15): hora da captura e distância legível ao lado de cada imagem. A tela
 * recebe só `distanceMeters` — a coordenada nunca sai do servidor e nunca é impressa.
 */
describe('hora e distância da captura no comprovante (spec 220 T4.2)', () => {
  const source = readFileSync(READINGS, 'utf8')

  it('mostra a hora da captura a partir de capturedAt', () => {
    expect(source).toInclude('capturedAt')
    expect(PROOF_LABELS.readings?.capturedAt).toBe('Captura')
    expect(source).toInclude('deliveryProof.readings.capturedAt')
    expect(source).toInclude('formatMoment(capturedAt)')
  })

  it('escreve a distância em metros abaixo de 1 km e em quilômetros, com vírgula, acima', () => {
    expect(PROOF_LABELS.distanceMeters).toBe('a {{distance}} m do ponto')
    expect(PROOF_LABELS.distanceKilometers).toBe('a {{distance}} km do ponto')
    expect(source).toInclude('distanceMeters')
    expect(source).toMatch(/METERS_PER_KILOMETER\s*=\s*1000/u)
    expect(source).toMatch(/distanceMeters\s*<\s*METERS_PER_KILOMETER/u)
    expect(source).toInclude('deliveryProof.distanceKilometers')
    expect(source).toInclude('deliveryProof.distanceMeters')
    expect(source).toInclude("'pt-BR'")
  })

  it('diz "sem localização" quando o comprovante não tem posição', () => {
    expect(PROOF_LABELS.withoutLocation).toBe('sem localização')
    expect(source).toInclude('deliveryProof.withoutLocation')
    expect(source).toMatch(
      /distanceMeters\s*(?:===|==)\s*undefined|distanceMeters\s*(?:\?\?|\?\.)/u,
    )
  })

  it('renderiza sem a linha e sem quebrar quando o campo é ausente', () => {
    expect(source).toMatch(
      /capturedAt\s*(?:===|!==|==|!=)\s*undefined|capturedAt\s*(?:\?\?|\?\.|&&)/u,
    )
  })

  /** LGPD: a posição do motorista é dado pessoal — nem em texto, nem em `href`/`src`, nem em mapa. */
  it('nunca imprime nem linka coordenada', () => {
    for (const text of [source, readFileSync(COMPONENT, 'utf8')]) {
      expect(text).not.toMatch(/latitude|longitude|accuracyMeters/iu)
      expect(text).not.toMatch(/google\.com\/maps|openstreetmap|maps\.apple|geo:/iu)
      expect(text).not.toMatch(/(?:href|src)=\{[^}]*(?:latitude|longitude|distanceMeters)/iu)
    }

    for (const label of Object.values(PROOF_LABELS)) {
      if (typeof label === 'string') expect(label).not.toMatch(/latitude|longitude|coordenad/iu)
    }
  })
})

/**
 * Spec 220 T4.3 (RF16): selo de pontualidade (vem de `punctuality`) e selo de registro tardio (vem
 * de `lateRegistration`) — dois campos, dois selos, por imagem.
 */
describe('selos do comprovante (spec 220 T4.3)', () => {
  const source = readFileSync(READINGS, 'utf8')

  it('tem rótulo acentuado, distinto, para cada veredito que merece selo', () => {
    const labels = PROOF_LABELS.punctuality

    expect(labels).toBeDefined()

    for (const value of PUNCTUALITY_BADGE_VALUES) {
      expect(labels?.[value]).toBeString()
      expect(labels?.[value]?.length).toBeGreaterThan(0)
    }

    expect(new Set(PUNCTUALITY_BADGE_VALUES.map((value) => labels?.[value])).size).toBe(
      PUNCTUALITY_BADGE_VALUES.length,
    )
  })

  it('renderiza o selo a partir do rótulo de punctuality, e não para not_required', () => {
    expect(source).toInclude('punctuality')
    expect(source).toInclude('deliveryProof.punctuality')
    expect(source).toInclude('not_required')
  })

  it('tem selo próprio de registro tardio, a partir de lateRegistration', () => {
    expect(PROOF_LABELS.lateRegistration).toBeString()
    expect(PROOF_LABELS.lateRegistration?.length).toBeGreaterThan(0)
    expect(source).toInclude('lateRegistration')
    expect(source).toInclude('deliveryProof.lateRegistration')
    expect(PROOF_LABELS.lateRegistration).not.toBe(PROOF_LABELS.punctuality?.late)
  })

  it('comprovante antigo sem punctuality renderiza sem selo e sem quebrar', () => {
    expect(source).toMatch(
      /punctuality\s*(?:===|!==|==|!=)\s*undefined|punctuality\s*(?:\?\?|\?\.|&&)/u,
    )
  })

  it('pinta cada veredito com a sua variante: bom em success, ruim em warning', () => {
    expect(source).toMatch(/on_time:\s*'success'/u)
    for (const verdict of ['late', 'away', 'late_and_away']) {
      expect(source).toMatch(new RegExp(`${verdict}:\\s*'warning'`, 'u'))
    }
    expect(source).toMatch(/<Badge variant=\{PUNCTUALITY_BADGE_VARIANT\[punctuality\]\}/u)
  })

  it('pinta o registro tardio como secondary, distinto do veredito de pontualidade', () => {
    expect(source).toMatch(/<Badge variant="secondary">\{t\('deliveryProof\.lateRegistration'\)/u)
  })

  it('separa os selos da mesma linha: contêiner flex com gap e wrap', () => {
    const styles = readFileSync(TRIP_STYLES, 'utf8')
    const block = /\.proofBadges\s*\{([^}]*)\}/u.exec(styles)?.[1] ?? ''

    expect(source).toInclude('styles.proofBadges')
    expect(block).toMatch(/display:\s*flex/u)
    expect(block).toMatch(/flex-wrap:\s*wrap/u)
    expect(block).toMatch(/gap:\s*var\(--space-\d+\)/u)
  })
})
