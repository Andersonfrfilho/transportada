/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Põe o modelo e o runtime do recorte de fundo em `public/background-removal/`, uma vez por
 * ambiente. Eles **não vivem no repositório**: são 16 MB de artefato de terceiro, e binário grande
 * no Git é peso que entra e nunca sai — todo clone paga, para sempre, por um arquivo que se baixa
 * em segundos.
 *
 * O script é idempotente por conteúdo: arquivo presente e com o `sha256` esperado é no-op silencioso.
 * Rodar de novo não baixa nada; rodar com o arquivo corrompido pela metade baixa outra vez.
 */
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

const TARGET_DIRECTORY = new URL('../public/background-removal/', import.meta.url)

/**
 * Os pesos do U²-Net (Apache-2.0), convertidos para ONNX. Vêm de uma URL fixa e são conferidos por
 * `sha256`: sem a conferência, uma release trocada no meio do caminho entraria no nosso domínio como
 * se fosse nossa (`security.md` §4 — supply chain).
 */
const MODEL = {
  name: 'u2netp.onnx',
  sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
  url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
} as const

/**
 * O runtime não é baixado: ele vem de `onnxruntime-web`, dependência de desenvolvimento fixada no
 * `package.json` e conferida pelo lockfile. Quem já resolve integridade de pacote é o gerenciador —
 * repetir isso à mão seria inventar um segundo caminho, pior, para o mesmo problema.
 *
 * Copiar para `public/` em vez de importar é exigência do próprio pacote de recorte: o runtime
 * carrega o loader `.mjs` em tempo de execução, e todo bundler reescreve esse import do seu jeito.
 */
const RUNTIME_FILES = [
  'ort.wasm.min.js',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
] as const

async function digestOf(file: Bun.BunFile): Promise<string | null> {
  if (!(await file.exists())) return null
  return createHash('sha256')
    .update(new Uint8Array(await file.arrayBuffer()))
    .digest('hex')
}

/**
 * A falha ao baixar **não derruba o build**, e essa é uma escolha: recorte de fundo é conveniência,
 * e amarrar o deploy do produto inteiro à disponibilidade de uma release de terceiro trocaria uma
 * degradação pequena por uma parada grande. Sem o modelo, o botão de recortar falha na tela com o
 * aviso de que a foto original continua valendo — que é o caminho que a pessoa já tinha.
 *
 * O que **não** é tolerado é arquivo com conteúdo diferente do esperado: aí é `sha256` divergente, e
 * ele para tudo. Baixar errado em silêncio é como um artefato trocado entra num domínio confiável.
 */
async function ensureModel(): Promise<boolean> {
  const target = Bun.file(new URL(MODEL.name, TARGET_DIRECTORY))
  if ((await digestOf(target)) === MODEL.sha256) return false

  const response = await fetch(MODEL.url).catch(() => undefined)
  if (response === undefined || !response.ok) {
    console.warn(
      `[background-removal] ${MODEL.name} indisponível — o recorte de fundo fica fora deste build.`,
    )
    return false
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== MODEL.sha256) {
    throw new Error(`sha256 inesperado para ${MODEL.name}: ${digest}`)
  }

  await Bun.write(new URL(MODEL.name, TARGET_DIRECTORY), bytes)
  return true
}

/**
 * O caminho do pacote é **resolvido**, não montado à mão: num monorepo a dependência pode ficar na
 * raiz ou dentro da app, e um `../node_modules/` cravado quebra no dia em que o gerenciador decide
 * o contrário — em produção, e não aqui.
 */
function runtimeDirectory(): URL {
  const manifest = Bun.resolveSync('onnxruntime-web/package.json', import.meta.dir)
  return new URL('./dist/', Bun.pathToFileURL(manifest))
}

async function ensureRuntimeFile(name: string): Promise<boolean> {
  const source = Bun.file(new URL(name, runtimeDirectory()))
  if (!(await source.exists())) {
    throw new Error(`onnxruntime-web não instalado: ${name} não encontrado. Rode a instalação.`)
  }

  const target = new URL(name, TARGET_DIRECTORY)
  const [sourceDigest, targetDigest] = await Promise.all([
    digestOf(source),
    digestOf(Bun.file(target)),
  ])
  if (sourceDigest === targetDigest) return false

  await Bun.write(target, source)
  return true
}

await mkdir(TARGET_DIRECTORY, { recursive: true })
const changes = await Promise.all([
  ensureModel(),
  ...RUNTIME_FILES.map((name) => ensureRuntimeFile(name)),
])

/** Silêncio quando nada muda: o caminho normal é o segundo `build` em diante, e ele não tem notícia. */
if (changes.some(Boolean)) {
  console.info(`[background-removal] ${String(changes.filter(Boolean).length)} arquivo(s) em dia.`)
}
