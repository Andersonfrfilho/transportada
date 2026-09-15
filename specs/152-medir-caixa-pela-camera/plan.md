# Spec 152 — Plano

## Onde o código está hoje

| Peça             | Arquivo                                                                                                    | O que faz                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tela da fila     | `apps/frontend-transportada/src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx` | Busca, "Ler etiqueta", formulário por linha em cm (converte para mm na borda), tetos 600/300/300 cm, `cameFromScan`.                                 |
| Query/mutação    | `…/nfe-workspace/hooks/usePackageBoxQueue.hook.ts`                                                         | `scanned` e `search` são a mesma pergunta; `measure` invalida `nfe-package-boxes`.                                                                   |
| Client HTTP      | `…/nfe-workspace/shared/packageBoxClient.service.ts`                                                       | `GET /nfe-package-boxes` (`scanned` cru), `PUT /nfe-package-boxes/:id`, type guards.                                                                 |
| Leitor           | `src/components/ui/barcode-scanner.tsx` + `useBarcodeScanner.hook.ts` + `barcodeScanner.service.ts`        | Abre o stream **dentro** do hook, `BarcodeDetector` ou worker ZXing, apaga ao fechar. Em `work/leitor-etiqueta` vira diálogo de tela cheia com guia. |
| Fila (API)       | `apps/api-transportada/src/nfe-documents/application/list-package-boxes.use-case.ts`                       | `reduceToGtin13`, leitura ilegível vira lista vazia.                                                                                                 |
| Política da fila | `…/domain/package-box-queue.policy.ts`                                                                     | Ordem por volume, cobertura de 80%.                                                                                                                  |
| Repositório      | `…/infrastructure/drizzle-package-box.repository.ts`                                                       | `measure` faz `UPDATE` que substitui a medida, filtrado por `companyId`.                                                                             |
| Schema da rota   | `…/presentation/package-box.schema.ts`                                                                     | Zod `.strict()`, tetos iguais aos CHECKs.                                                                                                            |
| Tabela           | `src/database/nfe.schema.ts` → `nfe_package_boxes` (migration `20260905130000_nfe_package_boxes`)          | `length_mm`/`width_mm`/`height_mm`, `measured_at`, sem origem.                                                                                       |
| CSP              | `src/modules/shared/contentSecurityPolicy.service.ts`                                                      | `script-src 'self' 'wasm-unsafe-eval'` (entrou pelo `image-cutout`), `worker-src 'self'`.                                                            |
| Headers          | `apps/frontend-transportada/server.ts`                                                                     | `Permissions-Policy: camera=(self), …`.                                                                                                              |

## Pesquisa

Consultada em 2026-09-15. As fontes estão listadas no fim desta seção.

### WebXR (abordagem B)

Hit-test, anchors, depth-sensing e light-estimation existem no Chrome Android com ARCore, mas o
suporte varia por aparelho: é preciso `isSessionSupported` e feature-detect por módulo. A sessão
exige HTTPS, gesto do usuário e ARCore certificado. Não há precisão oficial: relatos de campo falam
em 1–3 cm a 0,5–1 m, com piora em superfície lisa.

No Safari do iPhone não existe AR imersivo: WebXR só no visionOS. Firefox Android não implementa AR.
A sessão `immersive-ar` toma a câmera, e o stream do `getUserMedia` precisa ser fechado antes. É
isso que quebra a D4.

### Marcador + OpenCV.js (abordagem A)

Um ArUco dá 4 cantos com identidade, então a homografia sai sem calibração prévia. `solvePnP` sobre
os cantos dá a pose da câmera em relação à face superior, e com ela dá para projetar a aresta
vertical e medir a altura na mesma foto. A homografia só é exata no plano do marcador, por isso ele
vai **sobre** a face superior.

`@techstark/opencv-js` é mantido (OpenCV 5.0.0, Emscripten 4). O WASM tem vários MB e o tamanho
exato vai ser medido no spike. Um build próprio só com `imgproc` + `calib3d` + `objdetect` é a
alternativa. Na CSP, precisa de `'wasm-unsafe-eval'` e não de `'unsafe-eval'`, e esta app já tem a
diretiva.

### Profundidade monocular (abordagem C)

MiDaS / Depth Anything dão profundidade relativa, com escala ambígua. Sem referência não há métrica,
e com referência a abordagem vira a A com um modelo de centenas de MB a mais.

### `getUserMedia`

Expõe `torch`, `zoom` e `focusDistance` via `applyConstraints` no Chrome Android.
`mediacapture-depth` foi descontinuada em 2022: não há profundidade pela web.

### Teto de referência

Apps nativos com LiDAR: ±0,5–1 cm (estudo do iPhone 12 Pro: ±1 cm em objetos acima de 10 cm). Um
PWA não tem acesso a LiDAR.

### Fontes

- WebXR vs ARCore: https://developers.google.com/ar/develop/webxr/arcore-comparison
- Hit Test: https://www.w3.org/TR/webxr-hit-test-1/
- Depth sensing: https://github.com/immersive-web/depth-sensing/blob/main/explainer.md
- MDN WebXR: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API
- WebXR no iOS: https://xrdoctors.pro/blog/webxr-on-ios-what-actually-works
- OpenCV.js: https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html
- `@techstark/opencv-js`: https://www.npmjs.com/package/@techstark/opencv-js
- CSP `script-src`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src
- Image Capture: https://www.w3.org/TR/image-capture/
- `mediacapture-depth` descontinuada: https://github.com/w3c/mediacapture-depth
- Depth relativo vs métrico: https://huggingface.co/blog/Isayoften/monocular-depth-estimation-guide

## Arquitetura

```
PackageBoxMeasurementPanel
  └─ PackageBoxCameraFlow (nfe-workspace)        ← máquina de etapas (D4), dono do diálogo
       ├─ useCameraStream (components/ui)          ← abre UMA vez, apaga ao sair
       ├─ etapa label    → useBarcodeScanner({ stream })
       ├─ etapa identified → lista de candidatas / "Medir esta caixa"
       ├─ etapa measure  → BoxDimensionScanner (components/ui) → worker de medida (OpenCV)
       └─ etapa review   → PackageBoxMeasurementForm (formulário atual extraído) + aviso + confirmação
```

### Frontend — design system (`src/components/ui/`)

O CLAUDE.md da app proíbe "implementação própria de câmera" fora do DS, então tudo o que toca
câmera e medida mora aqui.

- `useCameraStream.hook.ts`: extraído de `useBarcodeScanner`. Faz `openCameraStream`/
  `stopCameraStream`, o status (`starting` · `ready` · `denied` · `unavailable`) e a lanterna quando
  `getCapabilities().torch`. Um consumidor abre, os filhos recebem o `MediaStream`.
- `useBarcodeScanner.hook.ts`: passa a aceitar `stream` de fora. Sem `stream`, mantém o
  comportamento atual, então os outros usos do leitor (spec 055) não mudam.
- `box-dimension-scanner.tsx` + `useBoxDimensionScanner.hook.ts` + `box-dimension-scanner.module.css`:
  o primitivo de medida. Props:
  - `stream`, `isActive`, `onMeasured(result)`, `onUnsupported(reason)`;
  - textos por prop, sem traduzir nada, como o leitor.

  Mostra o vídeo, o guia, o indicador ao vivo (motivo atual), "Capturar", a foto congelada com os 4
  pontos arrastáveis (com lupa e setas do teclado) e "Usar esta medida".

- `boxDimension.service.ts` (**puro**, sem I/O, é o que o contrato testa):
  - `measureFromPose({ markerCorners, markerSideMm, points, cameraMatrix })` → dimensões em mm;
  - `estimateMargins({ …, cornerSigmaPx, reprojectionErrorPx, samples, random })` → Monte Carlo
    determinístico com semente injetada, `m = 2σ + piso de impressão`;
  - `classifyMeasurement(margins)` → `reliable` · `imprecise` · `unreliable` por dimensão (D6);
  - `detectWarnings(frameStats)` → códigos de D9;
  - constantes em `boxDimension.constant.ts`: `MARGIN_RELIABLE_MM = 10`,
    `MARGIN_UNRELIABLE_MM = 30`, `MARKER_SIDE_MM = 150`, `MARKER_DICTIONARY`, `MARKER_ID`, limites de
    luz, nitidez e ângulo (calibrados no spike).
- `boxDimension.worker.ts`: carrega o OpenCV **dentro do worker**, com `import()` dinâmico, no
  primeiro `postMessage`. Detecta o marcador (`ArucoDetector`), calcula pose, estatísticas do quadro
  e proposta de cantos. Transfere `ImageData` e luminância como `Transferable`. Criado via
  `new Worker(new URL('./boxDimension.worker.ts', import.meta.url), { type: 'module' })`.
  Dependência fixada `@techstark/opencv-js@5.0.0-release.1` (a do spike; o detector é
  `cv.aruco_ArucoDetector`, e o tipo mínimo do aruco vem do `src/opencv.types.ts` do spike). O
  arquivo é único (`SINGLE_FILE`: o WASM vai embutido no JS), então o que se cacheia é o chunk.
  A pose e a margem **não** usam `cv.solvePnP`: o motor puro portado do spike faz isso em TS.
- **Carga e cache (D18)**:
  - o worker expõe `preload()`; o fluxo chama ao abrir "Ler etiqueta" com a função ligada, salvo
    `navigator.connection?.saveData`;
  - `vite.config.ts`: o chunk do OpenCV entra em `globIgnores` do Workbox (como `background-removal`)
    e ganha uma regra `runtimeCaching` `CacheFirst` só para ele (`cacheName`
    `transportada-opencv`, `maxEntries: 2`, `cacheableResponse: { statuses: [200] }`);
  - `server.ts`: conferir se o chunk sai comprimido; se não, servir `.gz`/`.br` pré-gerados no build
    com `Content-Encoding` e `Vary: Accept-Encoding` (não é CSP nem Permissions-Policy);
  - nenhuma diretiva de CSP muda: `'wasm-unsafe-eval'` já cobre o `WebAssembly.instantiate` a partir
    de bytes, e o worker é da própria origem (`worker-src 'self'`, sem `blob:`). Se algo pedir
    diretiva nova, **parar**.
- `cameraMeasurement.constant.ts` (nfe-workspace): `CAMERA_MEASUREMENT_IS_EXPERIMENTAL = true` (D13).
- `docs/frontend/box-dimension-scanner.md` (regra) + linha nova na tabela do
  `apps/frontend-transportada/CLAUDE.md` ("Medida de caixa pela câmera") +
  `test/design-system/box-dimension-scanner.contract.ts`.

### Frontend — `nfe-workspace`

- `components/PackageBoxCameraFlow.component.tsx`: o diálogo de tela cheia (mesmo padrão
  `useModalDialog` + portal que chega de `work/leitor-etiqueta`), com as etapas de D4. Toda etapa
  tem instrução própria e o botão "Voltar para a etiqueta".
- `shared/packageBoxCameraFlow.service.ts`: reducer puro das etapas.
  - Estados: `label` · `identifying` · `choose` · `identified` · `measure` · `review` · `saving`.
  - Eventos: `labelRead`, `matchesLoaded(n)`, `measureRequested`, `measured`, `unsupported`,
    `typeRequested`, `backToLabel`, `saved`, `closed`.

  Testado sem DOM.

- `components/PackageBoxMeasurementForm.component.tsx`: o `PackageBoxRow` em modo edição,
  extraído para ser usado na linha e no fluxo. Ganha:
  - `proposal?` (valores, margens e motivos por dimensão), que preenche os campos;
  - aviso por dimensão (texto + `Icon name="warning"` + `role="alert"`), mostrando "±X cm" ao lado
    do campo;
  - rastreio de origem: edição em campo que veio da câmera muda para `camera_adjusted`;
  - confirmação de imprecisão: um diálogo com "Gravar assim" e "Digitar a medida".
- `shared/packageBoxClient.service.ts`: `PackageBoxMeasurementInput` ganha `source` e `camera?`, e
  `PackageBox` ganha `measurementSource` e `measurementMarginMm` (type guards atualizados).
  `shared/packageBoxCamera.validation.ts` só se o guard crescer demais.
- `hooks/useCameraMeasurementSettings.hook.ts`: lê `GET /nfe-package-boxes/measurement-settings`.
  Desligado → o fluxo não oferece "Medir esta caixa" e não cria o worker de medida.
- `components/CameraMeasurementSettingsPanel.component.tsx`: o painel de D14 na aba `packageBoxes`
  (só `settings.manage`), com o interruptor, o texto "Experimental: a medida pela câmera é uma
  estimativa…", o export CSV do período e o resumo da validação. O resumo é
  `shared/cameraMeasurementValidation.service.ts` (puro, porta o `session.ts` do spike: % com erro
  ≤ 10 mm, % dentro da margem, n). Registrado em `SETTINGS_PANELS`, `SETTINGS_PANEL_PLACEMENT`
  (`cameraMeasurement`, fonte `cargoSettings`, aba `packageBoxes`).
- O selo "Experimental" (`Badge` do DS + `Icon`) no cabeçalho das etapas Medida e Conferência.
- `PackageBoxMeasurementPanel`: o botão "Ler etiqueta" abre o `PackageBoxCameraFlow` em vez do
  `BarcodeScanner` solto. A linha medida mostra a origem ("pela câmera, ±X cm" · "digitada" ·
  "origem não registrada").
- `components/MeasurementCardPrint.component.tsx`: a página imprimível do cartão (D3). O ArUco é
  desenhado com `<svg>` do DS via `Icon`/primitivo de desenho, **nunca `<svg>` cru**, e a matriz de
  bits fica numa constante. Tem uma régua de 100 mm, `@media print` e tamanho em `mm`. Aberta por
  "Imprimir cartão de medição" na tela da fila.

### API — `nfe-documents`

- Migration aditiva `YYYYMMDDHHMMSS_nfe_package_box_measurement_source`, com timestamp posterior a
  `20260915025926_nfe_document_protocol_presence` (a última em `origin/staging`), `snapshot.json` e
  `rollback.sql`. Além do que segue, ela acrescenta
  `company_cargo_settings.camera_measurement_enabled boolean not null default false` (D14) e as
  colunas `proposed_length_mm` / `proposed_width_mm` / `proposed_height_mm integer null` no histórico
  (D17). Nenhuma coluna existente muda:
  - `nfe_package_boxes.measurement_source varchar(16) null` + CHECK
    `in ('typed','camera','camera_adjusted')`;
  - `nfe_package_boxes.measurement_margin_mm integer null` + CHECK `>= 0 and <= 3000`;
  - tabela `nfe_package_box_measurements`: - `id uuid pk`, `company_id uuid not null` (FK `companies`), `package_box_id uuid not null`
    (FK `nfe_package_boxes`, `on delete restrict`); - `source varchar(16) not null`, `length_mm`/`width_mm`/`height_mm integer not null`; - `length_margin_mm`/`width_margin_mm`/`height_margin_mm integer null`; - `warnings varchar(32)[] not null default '{}'`, `imprecise_confirmed boolean not null default
false`, `engine varchar(32) null`; - `measured_by_user_id uuid not null`, `created_at timestamptz not null default now()`; - índice `(company_id, package_box_id, created_at desc)`.
- `presentation/package-box.schema.ts`:
  - o corpo aceita `source` (padrão `typed`) e `camera?` (`.strict()`, com `lengthMarginMm`,
    `widthMarginMm`, `heightMarginMm`, `warnings` do enum de D9, `impreciseConfirmed` e `engine`);
  - `refine` para: `camera` só com `source ≠ typed`; margem acima de 10 sem `impreciseConfirmed`
    dá 400; margem acima de 30 com `source = camera` dá 400;
  - os códigos de motivo ficam em `domain/package-box-measurement.constant.ts`, cópia por valor com
    o frontend e guardada por contrato de paridade.
- `domain/package-box-measurement.policy.ts`: `resolveMeasurementMargin(camera)` (a maior margem) e
  `assertCameraMeasurementAcceptable(...)`. Erro de domínio próprio (`PackageBoxMeasurementError`,
  código em `shared/errors/codes.ts` do domínio), nunca `AppError` direto.
- `application/measure-package-box.use-case.ts`: grava a caixa (substitui, como hoje) **e** insere
  o histórico na **mesma transação**. O ator vem do contexto autenticado, nunca do corpo.
- `infrastructure/drizzle-package-box.repository.ts`: `measure` recebe `source`, `margin` e
  `history`, e `list` devolve `measurementSource` e `measurementMarginMm`.
- A OpenAPI gerada inclui os campos novos (teste de rota no documento).
- **Interruptor (D14)**, em `companies` (dono de `company_cargo_settings`):
  - `GET /company-settings/cargo` ganha `cameraMeasurementEnabled` (retrocompatível);
  - `PUT /company-settings/cargo/camera-measurement` `{ enabled: boolean }` (`.strict()`,
    `settings.manage`, upsert da linha como o peso padrão já faz);
  - em `nfe-documents`, `GET /nfe-package-boxes/measurement-settings` (`cargo.measure`) lê a mesma
    coluna por uma porta (`CameraMeasurementSettingsReader`), sem importar o repositório de
    `companies` direto; ausência de linha = `false`;
  - o use case de medida consulta a porta e lança `PackageBoxCameraMeasurementDisabledError` (`422`,
    `PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED`) para `source ≠ typed` com a função desligada.
- **Export da validação (D16)**: `GET /nfe-package-box-measurements?from=&to=&cursor=`
  (`settings.manage`, cursor, `perPage` ≤ 100) devolve as linhas do histórico da empresa do token com
  código do produto, GTIN da caixa, proposta, gravado, margens, motivos, origem e data. Nunca a
  descrição do produto nem o CNPJ do emitente.
- A invalidação da planta segue como está: medir a caixa já enfileira a planta pelo hash (spec
  145), e esta spec não mexe nisso.

## Contratos

`PUT /nfe-package-boxes/:id` (`cargo.measure`). O corpo antigo continua válido:

```json
{
  "lengthMm": 384,
  "widthMm": 292,
  "heightMm": 215,
  "unitsPerBox": 1,
  "grossWeightGrams": null,
  "source": "camera",
  "camera": {
    "engine": "aruco-homography-v1",
    "lengthMarginMm": 7,
    "widthMarginMm": 8,
    "heightMarginMm": 14,
    "warnings": ["steepAngle"],
    "impreciseConfirmed": true
  }
}
```

Respostas: `204` quando grava. `400` para: corpo inválido, `camera` com `source: typed`, margem
acima de 10 sem `impreciseConfirmed`, ou margem acima de 30 com `source: camera`. `404` para caixa
de outra empresa ou inexistente.

`GET /nfe-package-boxes`: cada item ganha `measurementSource: null | 'typed' | 'camera' |
'camera_adjusted'` e `measurementMarginMm: null | number`.

## Fallback

Ordem de detecção, feita **uma vez** na entrada da etapa Medida:

0. Função desligada na empresa (D14) → não há etapa Medida: "Produto identificado" só oferece
   "Digitar medida".
1. Sem stream (`denied`/`unavailable`) → comportamento de hoje (aviso + busca digitada).
2. `typeof WebAssembly === 'undefined'` → formulário digitado da caixa lida (`onUnsupported('noWasm')`).
3. O worker não carrega o OpenCV em 15 s ou lança erro → `onUnsupported('engineFailed')`.
4. A análise de quadro passa de 800 ms em 3 quadros seguidos → `onUnsupported('tooSlow')`.

Em 2, 3 e 4 o conferente vê o aviso "Este aparelho não mede pela câmera — digite a medida", com o
formulário aberto e o produto já identificado. O stream continua aberto para a próxima etiqueta.

## Design system, i18n, a11y e tokens

- Diálogo, botões, ícones (`camera`, `warning`, `check`, `ruler` — conferir no `Icon` e acrescentar
  pelo processo de `docs/frontend/icons.md` se faltar), `Tooltip` e `Skeleton` durante o
  carregamento do OpenCV, na forma do vídeo.
- Cores: estado confiável em `--color-ready`, imprecisão em `--color-alert`, **sempre** com ícone e
  texto. Pontos arrastáveis com contraste ≥ 3:1 sobre o vídeo (borda dupla clara e escura).
- Alvos de toque em `--control-height`, e ponto arrastável com área de toque ≥ 44 px. Breakpoints
  em `min-width` (`docs/frontend/responsive.md`).
- Chaves novas em `packageBoxes.camera.*` e `packageBoxes.source.*` nos dois locales. Os motivos de
  D9 ficam em `packageBoxes.camera.warning.<código>`.
- `aria-live="polite"` para a instrução da etapa e o motivo ao vivo, sem repetir o mesmo texto.
  `role="alert"` para o aviso de imprecisão no formulário. O foco vai para o primeiro campo sem
  leitura confiável.

## Segurança

- Imagem nunca sai do aparelho: não há `fetch` com `Blob`/`ImageData` no módulo. O contrato varre a
  fonte de `boxDimension*` e do fluxo.
- Nenhum header ou CSP novo. O contrato de CSP continua igual, e o contrato de headers segue
  `camera=(self)`.
- A API valida tudo com Zod `.strict()`. O ator e o `companyId` vêm do token. O histórico é
  append-only: nenhuma rota atualiza ou apaga.
- Os logs levam `packageBoxId` e `source`, e nunca a descrição do produto nem o CNPJ do emitente.

## Riscos e mitigação

| Risco                                            | Mitigação                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Precisão real pior que 10 mm                     | Experimental + desligada por padrão; validação T15 decide o selo (D16). No-go mantém desligada.        |
| Margem estimada otimista                         | Critério de cobertura de 90% na validação. `MARGIN_*` e o piso de impressão recalibrados com os dados. |
| Aba antiga aberta depois de desligar             | A API recusa `source ≠ typed` com `422` quando desligada (D14).                                        |
| Validação contaminada (aceite sem fita)          | Protocolo de D16, histórico com proposta e gravado (D17), export por período.                          |
| OpenCV pesado ou lento em Android de entrada     | Carregamento sob demanda, worker, cache SW, build customizado avaliado no spike, `tooSlow` → digitado. |
| `ArucoDetector` ausente no build do `@techstark` | O spike confere. Alternativa: build próprio com `objdetect`, que vai para a ADR.                       |
| Conflito com `work/leitor-etiqueta`              | T0: só começar com ela em `staging`. A extração do `useCameraStream` parte da versão nova do leitor.   |
| Cartão impresso fora de escala                   | Régua de controle, instrução de 100% e o spike mede o erro com impressão de escritório comum.          |

## Testes (antes do código)

- **API:** `test/nfe-package-box/measurement-source.contract.ts` (schema e `refine`, 400 e 204),
  `…/measurement-history.integration.ts` (a transação grava a caixa e o histórico, tenant 404, e
  corpo antigo = `typed`), o contrato de paridade dos códigos de motivo, e o snapshot de migration.
  Tudo entra no `package.json` da API.
- **Frontend:**
  - `test/design-system/box-dimension-scanner.contract.ts` (worker por URL, sem `blob:`, OpenCV fora
    do chunk inicial, stream apagado ao sair, props obrigatórias);
  - `test/nfe-workspace/box-dimension.contract.ts` (`measureFromPose` com pose sintética conhecida:
    erro menor que 1 mm; `estimateMargins` determinístico; `classifyMeasurement` nas fronteiras
    10/30; `detectWarnings`);
  - `test/nfe-workspace/package-box-camera-flow.contract.ts` (reducer: etiqueta → identificada →
    medida → conferência → gravado → etiqueta; voltar; 0/1/N candidatas; `unsupported` abre o
    digitado);
  - `test/nfe-workspace/package-box-measurement.contract.ts` estendido (sem `PUT` antes de Salvar,
    confirmação de imprecisão, `camera_adjusted` ao editar, campo vazio acima de 30 mm, aviso com
    texto + `role=alert`).

  - `test/nfe-workspace/camera-measurement-settings.contract.ts` (desligado → sem "Medir esta
    caixa" e sem pedido do chunk; selo com texto + ícone; resumo da validação nas fronteiras 80/90%);
  - `test/company-settings/tabs.contract.ts` estendido com `cameraMeasurement`;
  - contrato do bundle/PWA: o chunk do OpenCV fora do `index` e fora do manifest de precache, e com
    a regra `runtimeCaching` própria.

  Tudo entra no `package.json` do frontend.

- **API (interruptor e export):** `test/company-settings/camera-measurement-flag.contract.ts`
  (`PUT` com `settings.manage`, `403` sem ela, `GET /company-settings/cargo` retrocompatível),
  `test/integration/camera-measurement-flag.integration.ts` (desligado → `422` para `camera` e
  `camera_adjusted`, `typed` grava; ausência de linha = `false`; tenant) e
  `test/integration/package-box-measurement-export.integration.ts` (período, cursor, só a empresa do
  token, sem descrição do produto).

- **Smoke Playwright:** câmera falsa do Chromium (`--use-file-for-fake-video-capture` com um vídeo
  `.y4m` de uma caixa com o cartão) exercita o ciclo completo e verifica `getUserMedia` chamado uma
  vez.

## Observabilidade

A API loga `package_box_measured` com `packageBoxId`, `source`, `marginMm` e `warnings`. O
frontend não manda telemetria de imagem. A taxa de `camera` vs `camera_adjusted` vs `typed` sai do
histórico por consulta, e isso responde depois se a câmera está servindo.
