# Medida de caixa pela câmera

`@/components/ui/box-dimension-scanner` é o primitivo que propõe C×L×A de uma caixa a partir da
câmera e de um cartão impresso com marcador ArUco. Como o leitor de etiqueta
(`docs/frontend/barcode-scanner.md`), é o único lugar do produto que pode tocar nisso —
implementação própria de câmera ou de medida fora daqui é proibida pelo CLAUDE.md da app.

Experimental (spec 152, ADR-0065): desligada por padrão em toda instalação
(`company_cargo_settings.camera_measurement_enabled`), com selo "Experimental" na tela — quem
mostra o selo e monta o fluxo de etapas é o `nfe-workspace` (T9–T11), não este primitivo.

## Duas peças, uma no worker e uma fora dele

`boxDimension.service.ts` (T6) é o motor **puro**: homografia, pose, altura pela aresta vertical,
Monte Carlo da margem e classificação. Não faz I/O, não conhece OpenCV, e é o que
`test/nfe-workspace/box-dimension.contract.ts` testa isoladamente.

`boxDimension.worker.ts` só acha o marcador e as estatísticas do quadro — luminância, contraste,
variância do Laplaciano (nitidez) — usando `cv.aruco_ArucoDetector`, `cvtColor`, `meanStdDev` e
`Laplacian` do build próprio do OpenCV (ADR-0065). Pose e margem **nunca** entram no worker: o
`useBoxDimensionScanner.hook.ts` recebe os cantos do marcador de volta e chama o motor puro no
thread principal.

## O OpenCV é só deste worker, carregado sob demanda

```ts
const namespace = (await import('../../../vendor/opencv/opencv.js')) as OpenCvArtifactNamespace
```

Import **dinâmico e literal**: dinâmico para o OpenCV nunca entrar no chunk inicial (o `preload`
só roda quando alguém abre a etapa Medida), literal para o Vite conseguir achar o módulo em tempo
de build e separá-lo num chunk próprio (`assets/opencv-*.js`, ~3 MB). `/* @vite-ignore */` com um
caminho em variável quebraria isso — o import viraria uma URL relativa resolvida em runtime a
partir do chunk do worker, que não existe no layout do `dist`.

O wrapper UMD do artefato (ADR-0065 §3) resolve de dois jeitos, e o worker aceita os dois:
empacotado pelo Rollup, `module.exports = factory()` vira `.default`; carregado cru (sem bundler,
como em alguns cenários de dev), o UMD cai no ramo de navegador/worker e atribui a `globalThis.cv`.

Função fora da whitelist (`deploy/opencv-build/opencv_js.config.py`) não existe no `cv` — o worker
falhava no teste, nunca em produção silenciosamente.

## Carga, cache e compressão (D18)

- O worker expõe o ciclo `preload` → `ready`/`error`; quem chama `preload` e mede os 15s de teto é
  `useBoxDimensionScanner.hook.ts` (`ENGINE_LOAD_TIMEOUT_MS`).
- `vite.config.ts`: o chunk do OpenCV (`assets/opencv-*.js`) entra em `globIgnores` do Workbox —
  fora do precache, como o recorte de fundo — e ganha uma regra `runtimeCaching` `CacheFirst`
  própria (`transportada-opencv`, `maxEntries: 2`): o service worker só o guarda depois do
  primeiro uso, nunca na instalação.
- `worker: { format: 'es' }` no `vite.config.ts`: sem isso o Vite empacota o worker em IIFE, que
  não tem `import()` dinâmico — o OpenCV voltaria a entrar no bundle do worker inteiro.
- `openCvCompressionPlugin` grava `.gz` e `.br` ao lado do chunk no build (3,05 MB → 891 KB gzip /
  698 KB brotli — números medidos, ADR-0065 § Medições). `server.ts` não comprime nada por padrão;
  só para este chunk (`OPENCV_CHUNK_PATTERN`), `precompressedResponse` escolhe pelo
  `Accept-Encoding` do pedido e responde com `Content-Encoding` + `Vary: Accept-Encoding`.

Nenhuma diretiva de CSP ou Permissions-Policy muda: `script-src 'self' 'wasm-unsafe-eval'` e
`worker-src 'self'` (ADR-0042) já cobrem o build próprio, porque ele nunca usa `new Function`/
`eval` (`-s DYNAMIC_EXECUTION=0`) nem `blob:`.

## Fallback: cai no digitado, nunca trava a tela

Ordem de detecção, uma vez por ativação:

1. `typeof WebAssembly === 'undefined'` → `onUnsupported('noWasm')`, sem sequer criar o worker.
2. O worker não chega a `ready` em 15s ou lança erro → `onUnsupported('engineFailed')`.
3. Três quadros seguidos acima de 800ms → `onUnsupported('tooSlow')`.

Em qualquer um dos três, quem monta a etapa Medida (T9–T11) volta ao formulário digitado com o
aviso — nada é gravado pelo primitivo em nenhum caminho de falha.

## A imagem nunca sai do aparelho

Nem o worker, nem o hook, nem o componente chamam `fetch`. A "foto congelada" que os pontos
arrastáveis marcam é um `canvas.toDataURL` local (`snapshotDataUrl`), guardado só em memória —
alimenta a tela e a lupa, nunca uma requisição. `test/design-system/box-dimension-scanner.contract.ts`
varre as três fontes por `fetch(` para garantir isso.

## A câmera apaga ao fechar

Como o leitor de etiqueta: desativar ou desmontar encerra o worker (`worker.terminate()`) e limpa
`video.srcObject`. O `stream` é sempre injetado por quem hospeda (`useCameraStream`, D19) — o
primitivo nunca chama `getUserMedia` sozinho.

## Pontos arrastáveis: lupa e setas

`boxDimensionMarking.service.ts` (puro, porta o `marking.ts` do spike) faz a aritmética: prender o
ponto dentro do quadro (`clampPointToBounds`), mover 1px (ou 8px com Shift) por seta do teclado
(`nudgePoint`), e o recorte da lupa (`magnifierViewportFor`). Cada ponto é um `<button>` de
44×44px (alvo de toque), arrastável por ponteiro e navegável por teclado, com `aria-label` próprio
por prop — o primitivo não traduz nada.

## Props

| Prop               | Tipo                                              | Papel                                         |
| ------------------ | ------------------------------------------------- | --------------------------------------------- |
| `isActive`         | `boolean`                                         | Ativa o worker e o vídeo.                     |
| `stream`           | `MediaStreamLike \| undefined`                    | Sessão de câmera de `useCameraStream` (D19).  |
| `onMeasured`       | `(result) => void`                                | Proposta pronta: dimensões, margens, motivos. |
| `onUnsupported`    | `(reason) => void`                                | `noWasm` · `engineFailed` · `tooSlow`.        |
| `title`            | `string`                                          | Rótulo da seção e do vídeo.                   |
| `instructionLabel` | `string`                                          | Instrução ao vivo, sem motivo de imprecisão.  |
| `warningLabels`    | `Partial<Record<BoxDimensionDomainWarning, ...>>` | Texto por motivo (D9), mostrado ao vivo.      |
| `captureLabel`     | `string`                                          | Botão "Capturar".                             |
| `confirmLabel`     | `string`                                          | Botão "Usar esta medida".                     |
| `retryLabel`       | `string`                                          | Botão de voltar ao vídeo ao vivo.             |
| `pointLabels`      | `Record<MarkedPointKey, string>`                  | `aria-label` de cada ponto arrastável.        |

Contrato: `test/design-system/box-dimension-scanner.contract.ts`. Decisão de dependência, CSP e
build do OpenCV: `docs/adr/0065-a-caixa-se-mede-com-cartao-e-nunca-grava-sozinha.md`.
