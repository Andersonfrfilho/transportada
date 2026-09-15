/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createPackageBoxClient,
  packageBoxQueueFromApi,
} from '@/modules/nfe-workspace/shared/packageBoxClient.service'

const BOX = {
  cartonGtin: null,
  commercialUnit: 'CX24',
  cumulativeShare: 0.6,
  description: 'ENERG RED BULL 250ML',
  emitterTaxId: '05868574001090',
  grossWeightGrams: 10867,
  heightMm: null,
  id: '11111111-1111-4111-8111-111111111111',
  lengthMm: null,
  measuredAt: null,
  productCode: '18245',
  share: 0.6,
  transportedVolumes: 60,
  unitsPerBox: 1,
  widthMm: null,
  withinCoverage: true,
}

function buildFetch(body: unknown, captured?: { url?: string; init?: RequestInit | undefined }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (captured !== undefined) {
      captured.url = input instanceof URL ? input.href : (input as string)
      captured.init = init
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )
  }
}

function buildClient(body: unknown, captured?: { url?: string; init?: RequestInit | undefined }) {
  return createPackageBoxClient({
    apiUrl: 'https://api.test',
    fetch: buildFetch(body, captured),
    getAccessToken: () => Promise.resolve('token'),
  })
}

describe('a fila de medição vista pelo conferente (spec 085 G005)', () => {
  it('lê a fila que a API serve', () => {
    const queue = packageBoxQueueFromApi({
      data: { coveredCount: 1, items: [BOX], totalVolumes: 100 },
    })

    expect(queue.coveredCount).toBe(1)
    expect(queue.items[0]?.productCode).toBe('18245')
  })

  /**
   * ⚠️ Corpo que não é a fila **lança**, nunca vira lista vazia: fila vazia é "não há o que medir",
   * e mostrar isso para uma resposta que não entendemos manda o conferente embora sem trabalho.
   */
  it('recusa corpo que não é a fila', () => {
    expect(() => packageBoxQueueFromApi({ data: { items: [{ id: 1 }] } })).toThrow()
    expect(() => packageBoxQueueFromApi(null)).toThrow()
  })

  /** A fila abre no que falta medir: ela existe para dizer o que medir agora. */
  it('a situação padrão é o que falta medir', async () => {
    const captured: { url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes({ status: 'pending' })

    expect(captured.url).toContain('status=pending')
  })

  /** Ver o já medido é o caminho de conferir e corrigir uma caixa — não some atrás de um checkbox. */
  it('pede as medidas quando o operador troca a situação', async () => {
    const captured: { url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes({ status: 'all' })

    expect(captured.url).toContain('status=all')
  })

  /** O que o leitor bipa vai como `scanned`: quem reduz DUN-14 a GTIN-13 é a API, não a tela. */
  it('manda a etiqueta lida como scanned, sem reduzi-la aqui', async () => {
    const captured: { url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes({ scanned: '17896004003405' })

    expect(captured.url).toContain('scanned=17896004003405')
    expect(captured.url).not.toContain('7896004003405&')
  })

  /** Gravar é `PUT` na caixa: medir de novo substitui a medida, não acrescenta uma segunda. */
  it('grava a medida por PUT na própria caixa', async () => {
    const captured: { init?: RequestInit; url?: string } = {}
    await buildClient({ data: BOX }, captured).measureBox({
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      unitsPerBox: 1,
      widthMm: 300,
    })

    expect(captured.url).toBe(`https://api.test/nfe-package-boxes/${BOX.id}`)
    expect(captured.init?.method).toBe('PUT')
  })
})

/**
 * ⚠️ Contrato por texto de fonte: esta app não tem DOM nos testes, e o ciclo bipar → medir → bipar
 * é justamente o que some quando alguém "simplifica" o painel. Sem ele o conferente toca "Ler
 * etiqueta" uma vez por caixa, com a fita na outra mão.
 */
describe('o ciclo do leitor no painel de medição', () => {
  it('reabre a câmera depois de gravar quando a caixa veio de uma leitura', async () => {
    const source = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(source).toContain('if (cameFromScan) setIsScannerOpen(true)')
    expect(source).toContain('setCameFromScan(true)')
    /** Digitar sai do modo varredura: ali a pessoa procura uma caixa, não passa uma pilha. */
    expect(source).toContain('setCameFromScan(false)')
  })
})

/**
 * ⚠️ Os tetos da medida são cópia por valor dos CHECKs da coluna. Divergir deles devolve `400`
 * genérico do servidor, que a tela não sabe ancorar em campo nenhum — o operador lê "não foi
 * possível gravar" numa ficha de três campos e não sabe qual refazer.
 */
describe('os tetos da medida na tela e no banco', () => {
  it('a tela declara os mesmos limites do CHECK da coluna', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('{ heightMm: 300, lengthMm: 600, widthMm: 300 }')
    expect(panel).toContain('aria-invalid=')
  })

  /**
   * ⚠️ **A tela fala centímetro e o banco guarda milímetro**, e é aqui que um erro de ordem de
   * grandeza entraria calado: 38 cm virando 38 mm passa em qualquer CHECK, cabe em qualquer coluna,
   * e só aparece quando a ocupação da viagem der um décimo do que deveria. A conversão mora num
   * lugar só, e é este teste que a prende ali.
   */
  it('converte centímetro em milímetro num lugar só, aceitando vírgula', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('const MILLIMETRES_PER_CENTIMETRE = 10')
    expect(panel).toContain('Math.round(centimetres * MILLIMETRES_PER_CENTIMETRE)')
    /** O teclado do celular manda `38,5`, e meio centímetro é medida legítima. */
    expect(panel).toContain("replace(',', '.')")
    /** O teto é conferido **em centímetro**, antes de multiplicar: senão 600 cm passaria. */
    expect(panel).toContain('if (centimetres > MAX_CENTIMETRES[field]) return null')
  })
})

/**
 * ⚠️ O CORS da API só admite `Authorization` em metodo sem corpo (`BODYLESS_METHODS` em
 * `cors.service.ts`). Mandar `content-type` num `GET` faz o navegador pedir
 * `authorization,content-type` no preflight e receber **403** — a fila some da tela inteira, e
 * nenhum teste desta app pega, porque preflight so existe no navegador. Medido em 06/09/2026.
 */
describe('os cabeçalhos que cada método manda', () => {
  it('a leitura da fila manda só Authorization', async () => {
    const captured: { init?: RequestInit | undefined; url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes()

    const headers = captured.init?.headers as Record<string, string>
    expect(Object.keys(headers)).toEqual(['authorization'])
  })

  /** A gravação tem corpo, e aí o cabeçalho descreve algo — e o método deixa de ser sem corpo. */
  it('a gravação manda Authorization e content-type', async () => {
    const captured: { init?: RequestInit | undefined; url?: string } = {}
    await buildClient(null, captured).measureBox({
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      unitsPerBox: 1,
      widthMm: 300,
    })

    const headers = captured.init?.headers as Record<string, string>
    expect(Object.keys(headers).sort()).toEqual(['authorization', 'content-type'])
  })
})

/**
 * ⚠️ **Editar uma medida abre preenchido.** Campo em branco sobre dado que existe é a falha que o
 * registro evita (mesma regra de `CargoVolumeFactorPanel`) — e aqui ela era pior que estética: com
 * `unidades por caixa` voltando a `1`, gravar por cima **apagava** a medida em silêncio, e a
 * ocupação da viagem passava a contar cada unidade como uma caixa inteira.
 */
/**
 * ⚠️ O leitor abre em camada de tela cheia (primitivo `BarcodeScanner`) e precisa continuar montado
 * enquanto a fila reconsulta a API por causa de um bipe — senão o retorno ao estado de
 * carregamento (`loading`) desmontava a câmera no meio da leitura. O ciclo bipar → achar a caixa →
 * abrir a medição é a ponte para a medição por câmera (spec separada em andamento); o defeito
 * relatado era o leitor nascer atrás da lista sem preview algum.
 */
describe('o leitor de etiqueta continua montado em toda situação da fila', () => {
  it('o scanner é renderizado nos estados negado, carregando e falho — não só no corpo principal', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('if (denied)')
    expect(panel).toContain('if (loading)')
    expect(panel).toContain('if (failed)')
    /** As três saídas antecipadas devolvem o mesmo elemento `scanner`, não uma cópia. */
    const scannerReturns = panel.match(/\{scanner\}/g) ?? []
    expect(scannerReturns.length).toBeGreaterThanOrEqual(4)
  })
})

/**
 * ⚠️ Bipar substitui procurar na lista: achando a caixa, a medição dela abre sozinha — o
 * conferente não caça a linha certa numa fila que pode ter dezenas. Não achando, o leitor avisa e
 * continua lendo, porque a próxima etiqueta pode ser a certa.
 */
describe('bipar leva direto à medição da caixa achada', () => {
  it('acertar a fila abre a edição da caixa achada, com feedback visual e vibração', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('function openMeasurementForScannedBox(id: string): void {')
    expect(panel).toContain("kind: 'found'")
    expect(panel).toContain('setEditingId(id)')
    expect(panel).toContain('setCameFromScan(true)')
  })

  it('não achar mantém o leitor aberto e lendo, com aviso', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("kind: 'notFound'")
    /** Não achar não fecha o leitor — o bloco que trata a ausência de caixa não chama `setIsScannerOpen`. */
    const notFoundBlock = panel.split('if (items.length === 0) {')[1]?.split('}')[0]
    expect(notFoundBlock).toBeDefined()
    expect(notFoundBlock).not.toContain('setIsScannerOpen')
  })

  it('o ponto de entrada da medição é isolado — a câmera de medida (spec separada) entra por ali', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('Ponto de entrada isolado de propósito')
    expect(panel).toContain('medição por câmera')
  })

  it('usa o sinal de refetch da fila (isFetching), não o carregamento inicial, para saber quando avaliar', async () => {
    const hook = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()
    expect(hook).toContain('isMatching: query.isFetching')

    const page = await Bun.file(
      new URL('../../src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx', import.meta.url),
    ).text()
    expect(page).toContain('matching={packageBoxes.isMatching}')
  })
})

/**
 * ⚠️ O GTIN ainda não é gravado nas caixas (chega com o pacote fiscal numa etapa seguinte) — hoje
 * a etiqueta casa por chave de acesso ou código de produto, e o segundo pode achar a mesma caixa em
 * emitentes diferentes. Escolher a primeira sozinha (o `[match] = queue?.items ?? []` antigo) seria
 * adivinhar; o operador decide, tocando na candidata certa.
 */
describe('mais de uma caixa achada pela mesma etiqueta', () => {
  it('uma candidata só continua abrindo a medição direto, sem lista', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('if (items.length === 0) {')
    expect(panel).toContain('if (items.length > 1) {')
    expect(panel).toContain('setCandidates(items)')
    expect(panel).toContain('const [match] = items')
    expect(panel).toContain('if (match !== undefined) openMeasurementForScannedBox(match.id)')
  })

  it('nenhuma candidata segue mostrando o aviso de não achou, sem abrir a lista', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const zeroBlock = panel.split('if (items.length === 0) {')[1]?.split('}')[0]
    expect(zeroBlock).toBeDefined()
    expect(zeroBlock).toContain("kind: 'notFound'")
    expect(zeroBlock).not.toContain('setCandidates')
  })

  it('mais de uma candidata nunca escolhe sozinha — guarda a lista, não abre medição nenhuma', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const manyBlock = panel.split('if (items.length > 1) {')[1]?.split('}')[0]
    expect(manyBlock).toBeDefined()
    expect(manyBlock).toContain('setCandidates(items)')
    expect(manyBlock).not.toContain('openMeasurementForScannedBox')
  })

  it('a lista mora no bipe, não na fila — não reabre a escolha quando a fila recarrega por outro motivo', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain(
      'const [candidates, setCandidates] = useState<readonly PackageBox[] | null>(null)',
    )
  })

  /** Acima do teto a lista para de crescer — refinar a busca é mais rápido que rolar dezenas de linhas. */
  it('tem um teto de quantas candidatas mostra, com aviso do total quando passa dele', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('const MAX_CANDIDATES_SHOWN = 8')
    expect(panel).toContain('const shown = candidates.slice(0, MAX_CANDIDATES_SHOWN)')
    expect(panel).toContain('total > MAX_CANDIDATES_SHOWN')
    expect(panel).toContain("t('packageBoxes.scanner.candidates.overflow'")
  })

  /** Esc volta a ler, não fecha o leitor inteiro — só o botão de voltar/fechar do leitor faz isso. */
  it('Esc na lista volta a ler, e não fecha o leitor', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('useModalDialog({ isOpen: true, onClose: onBack })')
    expect(panel).toContain('onBack={() => setCandidates(null)}')
  })

  /** Foco no primeiro item, não no contêiner: quem chegou aqui vai tocar ou apertar Enter direto. */
  it('o foco entra na primeira candidata ao abrir a lista', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("querySelector<HTMLElement>('[data-candidate] button')?.focus()")
  })

  /** Cada candidata é um botão do design system, largo o bastante para o alvo de toque de 44px. */
  it('cada candidata é um botão de toque grande, não uma linha de texto clicável', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('<Button')
    expect(panel).toContain('className={styles.candidateButton}')
    expect(panel).toContain('onClick={() => onSelect(box.id)}')

    const css = await Bun.file(
      new URL('../../src/modules/nfe-workspace/styles/packageBoxes.module.css', import.meta.url),
    ).text()
    expect(css).toContain('.candidateButton {')
    expect(css).toContain('min-height: var(--control-height);')
  })

  /** Situação não pode depender só de cor — a caixa já medida ganha texto próprio na candidata. */
  it('a caixa já medida diz isso em texto na candidata, não só numa cor', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("t('packageBoxes.scanner.candidates.measured')")
    expect(panel).toContain('box.measuredAt === null ? null :')
  })
})

/**
 * ⚠️ Contrato por texto de fonte (spec do bipe físico): esta app não tem DOM nos testes, e a
 * pistola USB/Bluetooth que "digita" o código e manda Enter precisa cair no MESMO caminho de
 * `onScan`/`scanned` da câmera — nunca no filtro de texto simples do campo de busca.
 */
describe('o leitor físico (pistola) no campo de busca', () => {
  it('reconhece o formato de código: GTIN de 8/12/13/14 dígitos ou chave de acesso de 44', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('const SCANNED_CODE_LENGTHS = new Set([8, 12, 13, 14])')
    expect(panel).toContain('const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/')
    expect(panel).toContain('function looksLikeScannedCode(value: string): boolean {')
  })

  it('Enter com código bipado manda pelo mesmo caminho de onScan da câmera', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const searchField = panel.split('id="package-box-search"')[1]?.split('/>')[0]
    expect(searchField).toBeDefined()
    expect(searchField).toContain("if (event.key !== 'Enter') return")
    expect(searchField).toContain('if (!looksLikeScannedCode(value)) return')
    expect(searchField).toContain("scanOriginRef.current = 'keyboard'")
    expect(searchField).toContain('setAwaitingScan(true)')
    expect(searchField).toContain('onScan(value)')
  })

  /** Digitação comum (texto que não tem forma de código) segue filtrando a lista, como hoje. */
  it('Enter sem formato de código não dispara o caminho de scan', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onKeyDown = panel.split('onKeyDown={(event) => {')[1]?.split('}}')[0]
    expect(onKeyDown).toBeDefined()
    expect(onKeyDown).toContain('if (!looksLikeScannedCode(value)) return')
  })

  it('achar a caixa pela pistola marca a origem separada da câmera, e não abre câmera nenhuma', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("if (scanOriginRef.current === 'keyboard') {")
    expect(panel).toContain('setCameFromKeyboardScan(true)')
  })

  /** Ao gravar uma medida aberta pela pistola, o foco volta ao campo de busca — nunca a câmera. */
  it('gravar uma medida aberta pela pistola devolve o foco ao campo de busca', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onMeasureBlock = panel
      .split('onMeasure={(measurement) => {')[1]
      ?.split('}}\n              onOpen=')[0]
    expect(onMeasureBlock).toBeDefined()
    expect(onMeasureBlock).toContain('if (cameFromKeyboardScan) {')
    expect(onMeasureBlock).toContain('setCameFromKeyboardScan(false)')
    expect(onMeasureBlock).toContain('searchInputRef.current?.focus()')
  })

  /** Digitar manualmente cancela o modo "veio da pistola", igual já cancela o modo câmera. */
  it('digitar no campo cancela os dois modos de retorno, câmera e pistola', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const onChangeBlock = panel.split('onChange={(event) => {')[1]?.split('}}')[0]
    expect(onChangeBlock).toBeDefined()
    expect(onChangeBlock).toContain('setCameFromScan(false)')
    expect(onChangeBlock).toContain('setCameFromKeyboardScan(false)')
  })

  it('o campo tem placeholder curto convidando a buscar ou bipar', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain("placeholder={t('packageBoxes.searchPlaceholder')}")

    const ptLocale = await Bun.file(
      new URL('../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json', import.meta.url),
    ).text()
    expect(ptLocale).toContain('"searchPlaceholder": "Busque ou bipe a etiqueta"')

    const enLocale = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json',
        import.meta.url,
      ),
    ).text()
    expect(enLocale).toContain('"searchPlaceholder": "Search or scan the label"')
  })

  /** Nada de listener global: o Enter só é tratado no próprio campo de busca. */
  it('não existe listener global de teclado — só o onKeyDown do campo de busca', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).not.toContain("addEventListener('keydown'")
    expect(panel).not.toContain('window.addEventListener')
    expect(panel).not.toContain('document.addEventListener')
    /** Os dois `onKeyDown` que existem são de elemento: o campo de busca e o diálogo de candidatas. */
    const keydownOccurrences = panel.match(/onKeyDown=/g) ?? []
    expect(keydownOccurrences.length).toBe(2)
  })
})

describe('editar a medida de uma caixa já medida', () => {
  it('abre com o que está gravado, convertido de volta para centímetro', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('useState(() => toCentimetres(box.lengthMm))')
    expect(panel).toContain('useState(() => String(box.unitsPerBox))')
    /** A linha remonta quando a medida muda: sem isso o estado inicial ficaria preso ao antigo. */
    expect(panel).toContain("key={`${box.id}:${box.measuredAt ?? 'sem-medida'}`}")
    /** E a medida aparece na linha, para conferir sem precisar abrir o formulário. */
    expect(panel).toContain("t('packageBoxes.measured'")
  })
})
