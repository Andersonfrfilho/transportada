# ADR-0065 — A caixa se mede com cartão e nunca grava sozinha

- **Status:** aceita
- **Data:** 2026-09-15
- **Decisores:** usuário (build próprio do OpenCV, opção 1 da parada da T1) e revisão Opus
- **Fecha:** a T1 da spec 152 (`specs/152-medir-caixa-pela-camera/`)

## Contexto

O conferente mede a caixa com fita e digita C×L×A, e essas medidas alimentam a planta de carga. A
spec 152 põe a câmera do celular para propor a medida, na mesma sessão de câmera do leitor de
etiqueta (ADR-0042), num PWA que roda em Android **e** iPhone.

Duas coisas tornam a escolha arquitetural, e não de conveniência:

1. **A CSP desta app nasce no build e não afrouxa por conveniência.** `script-src` é
   `'self' 'wasm-unsafe-eval'` e `worker-src` é `'self'`, e o `server.ts` aplica a mesma política a
   **toda** resposta — inclusive ao script do worker, que é quem governa o que roda dentro dele.
2. **Medida errada não pode entrar calada na planta.** Caixa de fora com `bedFull` é o defeito nº 1
   do produto; a medida pela câmera só vale se a margem for honesta e se o operador confirmar.

A spec partia de que `'wasm-unsafe-eval'` bastava para o OpenCV.js. **A sonda da T1 mostrou que
não** (§ Medições).

## Decisão

### 1. Abordagem A: cartão impresso (ArUco) + OpenCV.js

| Abordagem                                  | Precisão (caixa 30–80 cm)                         | Aparelhos                                      | Veredito  |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------- | --------- |
| **A. ArUco `DICT_4X4_50` 150 mm + OpenCV** | ±0,5–1 cm no plano, ±1–2 cm na altura (a validar) | qualquer navegador com câmera, iPhone incluído | escolhida |
| B. WebXR `immersive-ar` + `hit-test`       | ~1–3 cm, sem número oficial                       | só Android com ARCore; nenhum iPhone           | fora      |
| C. Profundidade monocular (ONNX/TF.js)     | não métrica sem referência                        | modelo de dezenas a centenas de MB             | fora      |

B exclui o iPhone e toma a câmera numa sessão própria, o que quebra a sessão única etiqueta →
medida (D2, D4); também exigiria `xr-spatial-tracking` na Permissions-Policy. C, com referência,
vira A com um modelo gigante a mais.

Spike (desktop, pacote npm, sem CSP): `cv.aruco_ArucoDetector` presente, WASM de 11,96 MB / 3,50 MB
gzip, chunk do Vite de 15,5 MB / 3,90 MB gzip, ~0,7 s de carga no worker e 4,3 ms por quadro 720p no
Chromium headless. O celular médio é medido na validação (T15).

### 2. O OpenCV é um build próprio, sem execução dinâmica

O pacote `@techstark/opencv-js@5.0.0-release.1` **não inicia sob a nossa CSP**: o embind do
Emscripten monta os invocadores com `new Function`, que exige `'unsafe-eval'`. Em vez de abrir a
CSP, o OpenCV é compilado com `-s DYNAMIC_EXECUTION=0`:

| Item               | Valor                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emscripten         | 4.0.20 (a mesma do CI do `@techstark/opencv-js`), emsdk no commit `33aee63c`                                                                                            |
| OpenCV             | tag `5.0.0`, commit `40738fb16ceddb5fb3fea747585f7ce6abb0605b`                                                                                                          |
| Flags              | `build_js.py --build_wasm` · `-s DYNAMIC_EXECUTION=0` · `SINGLE_FILE=1` (padrão) · `-DCMAKE_CXX_STANDARD=17` · `SOURCE_DATE_EPOCH` = data do commit                     |
| Módulos ligados    | `core`, `imgproc`, `objdetect` (aruco) e as dependências obrigatórias `geometry`, `features`, `flann`; mais `photo`, exigido sem condição pelo `core_bindings.cpp`      |
| Módulos desligados | `3d`, `calib`, `dnn`, `stereo`, `video`, `ml`, testes, perf e exemplos                                                                                                  |
| Whitelist          | `deploy/opencv-build/opencv_js.config.py`: só `copyMakeBorder`, `meanStdDev`, `cvtColor`, `resize`, `Laplacian`, `getPerspectiveTransform`, `warpPerspective` e o aruco |
| Pós-build          | o wrapper UMD usa `globalThis` e `var Module` (o mesmo ajuste do pacote npm), e o script recusa a saída se sobrar `new Function` ou `eval(`                             |

A pose e a margem continuam em **TS puro** (desvio do plano original, vindo do spike): o build não
precisa de `solvePnP`, e `3d`/`calib` saem.

**Arquivo único (`SINGLE_FILE`)**, e não `.wasm` separado: o WASM é instanciado a partir de bytes em
memória, que `'wasm-unsafe-eval'` cobre. Um arquivo só é um chunk com hash, uma entrada de cache e
nenhuma URL de `.wasm` para o `locateFile` resolver dentro do worker.

**O build é reproduzível e não carrega a máquina de quem compilou.** O `getBuildInformation()` é
trocado por uma linha fixa (ele embutia host, hora e o caminho de cada ferramenta), e
`-ffile-prefix-map` reescreve o `__FILE__` dos `CV_Error` para `/opencv-build/…` e `/emsdk/…` — a
primeira versão do artefato levava 77 caminhos absolutos da máquina local. Dois builds limpos
seguidos dão o mesmo sha256, e o script recusa a saída se sobrar o caminho de trabalho.

**Procedência.** O caminho canônico é `deploy/opencv-build/build-in-docker.sh`, que roda o
`build.sh` na imagem `emscripten/emsdk:4.0.20` fixada por digest
(`sha256:460fff8f8ac87e11b16447fbd66538a686eafa0e4fb977aa0989ed19fe2079f7`), e o workflow
`.github/workflows/opencv-reproducibility.yml` (manual, mensal e em mudança de
`deploy/opencv-build/**` ou `vendor/opencv/**`) recompila no contêiner e falha se o sha256 não for o
do contrato. O Docker local não respondeu na T1, então o artefato versionado hoje saiu do build
**nativo**: macOS 26.5.1 (25F80) arm64, cmake 4.4.3, Python 3.14.6, GNU Make 3.81, emsdk 4.0.20
(commit `33aee63c`, emcc `6913738e`).

⏳ **Pendência:** o hash canônico passa a ser o do contêiner. Na primeira execução do workflow, se o
sha256 do contêiner divergir do nativo, o workflow falha e sobe o artefato gerado
(`opencv-js-rebuild`); a troca é versionar esse arquivo e o sha256 do contrato num commit só.

### 3. Onde o artefato mora: script versionado + artefato versionado

- `deploy/opencv-build/build.sh` e `opencv_js.config.py`: versões fixadas, flags e whitelist.
  Qualquer pessoa regenera com `deploy/opencv-build/build.sh <trabalho> <saída>` (~4 min do zero).
- `apps/frontend-transportada/vendor/opencv/opencv.js` (2.657.964 B, sha256
  `0299ef7bd89155591f8d8fb100354100030a8af916e5221b4e172da30d824d5d`), com a `LICENSE` Apache-2.0,
  o `COPYRIGHT` do OpenCV, o `NOTICE` do build modificado (flags, módulos, whitelist, patch UMD) e
  `third-party-licenses/` (componentes do `cmake --install --component licenses` e o runtime do
  Emscripten) — o `build.sh` copia tudo. `.gitattributes` marca o `.js` como `binary`: o literal do
  WASM tem bytes NUL.
- O contrato `test/shared/opencv-build.contract.ts` confere o sha256, a ausência de `new Function` e
  `eval(`, as versões do script, que `@techstark/opencv-js` não é dependência, que só o worker de
  medida importa o artefato, que ele fica fora de `public/` e que a CSP não mudou.

Trade-off registrado:

| Opção                                              | Por que não (ou por que sim)                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Artefato versionado + script (escolhida)**       | 2,6 MB uma vez no Git; o build do frontend não muda; nada é publicado. Atualizar o OpenCV é um commit revisável   |
| Gerar no build do frontend                         | emsdk (~1 GB) e ~4 min de compilação em todo CI e todo deploy do Railway, por um arquivo que muda uma vez por ano |
| Baixar de URL externa conferida por sha256         | o precedente do `background-removal`, mas exige publicar o artefato em algum lugar — publicação é parada          |
| Pacote em `adatechnology-packages`                 | exige publicar pacote (parada); sem segundo consumidor hoje                                                       |
| `@techstark/opencv-js` com `'unsafe-eval'` global  | abre `eval` para o app inteiro, para sempre                                                                       |
| `'unsafe-eval'` só na resposta do worker (plano B) | funciona (sonda), mas é mudança de CSP e abre `eval` dentro do worker; fica como plano B, com nova decisão        |

O `background-removal` evita binário no Git porque são 16 MB de terceiro com fonte oficial para
baixar. Aqui o artefato é **nosso** (não há onde baixá-lo sem publicar) e tem um sexto do tamanho.

### 4. Carga: sob demanda, num worker da própria origem, fora do precache (D18)

- Só o worker de medida (`src/components/ui/boxDimension.worker.ts`, T8) importa o artefato, por
  `import()` dinâmico; o worker nasce por `new Worker(new URL(…), { type: 'module' })`, nunca por
  `blob:`. O Vite emite o OpenCV como chunk com hash (`assets/opencv-*.js`).
- O artefato fica **fora de `public/`**, que o Workbox varreria para o precache. A T8 põe o chunk em
  `globIgnores` e numa regra `runtimeCaching` `CacheFirst` própria (`transportada-opencv`,
  `maxEntries: 2`).
- Pré-carga ao abrir "Ler etiqueta" com a função ligada, salvo `navigator.connection.saveData`.
- **Peso na rede: 3,05 MB brutos; 0,89 MB com compressão (T8).** O `server.ts` **não comprime**
  hoje. Pré-requisitos da T8: servir o chunk com gzip/brotli (pré-comprimido no build ou na hora,
  com `Content-Encoding` e `Vary: Accept-Encoding`) e declarar `worker: { format: 'es' }` no
  `vite.config.ts`.
- **Fallback:** se o WASM ou o worker falhar (iOS < 16 sem `'wasm-unsafe-eval'`, CSP, memória), a
  tela cai no formulário digitado com aviso, e nada grava.

### 5. CSP e Permissions-Policy não mudam

Nenhuma diretiva nova: `script-src 'self' 'wasm-unsafe-eval'` e `worker-src 'self'` (ADR-0042) cobrem
o build próprio, e a sonda roda com a política gerada pela própria `buildContentSecurityPolicy`.
Permissions-Policy segue `camera=(self)`: a câmera é o mesmo stream do leitor.

### 6. Experimental, desligada por padrão, validada depois

Selo "Experimental" na tela de medição (D13); interruptor por empresa em
`company_cargo_settings.camera_measurement_enabled`, padrão `false` em todo ambiente (D14); limites
10/30 mm provisórios (D15); a sessão com caixas reais decide tirar o selo e ligar em produção (D16).

### 7. A imagem não sai do aparelho; a origem fica gravada

Nenhum quadro, foto ou recorte vai para a rede. A caixa grava `measurement_source` e
`measurement_margin_mm`, e o histórico guarda a proposta da câmera ao lado do valor gravado (D17),
com o ator do token. Nada grava sem o operador tocar Salvar.

## Medições

Sonda: build do Vite 7.3.6 com um worker que carrega o OpenCV, cria o `aruco_ArucoDetector` e detecta
um marcador id 0 gerado pelo próprio OpenCV; servida com a CSP de `buildContentSecurityPolicy` em
toda resposta; Chromium headless (Playwright 1.58.2), Mac arm64, arquivo local.

| Artefato                     | CSP servida                            | Resultado                                                        |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `@techstark/opencv-js` (npm) | a de hoje                              | **`EvalError`** — `'unsafe-eval' is not an allowed source`       |
| `@techstark/opencv-js` (npm) | nenhuma (controle)                     | ok, carga 229 ms, id 0                                           |
| `@techstark/opencv-js` (npm) | `'unsafe-eval'` só no script do worker | ok, carga 232 ms, id 0                                           |
| **build próprio (este ADR)** | **a de hoje, sem mudança**             | **ok, carga 70–83 ms (3 execuções), id 0, zero violação de CSP** |

| Tamanho                          | Bruto        | gzip -9     | brotli -q 11 |
| -------------------------------- | ------------ | ----------- | ------------ |
| npm `dist/opencv.js`             | 13.298.869 B | 3.747.048 B | 2.672.690 B  |
| npm, chunk do Vite               | 15.515.064 B | 3.894.739 B | 2.785.688 B  |
| **build próprio `opencv.js`**    | 2.657.964 B  | 866.519 B   | 671.870 B    |
| **build próprio, chunk do Vite** | 3.053.658 B  | 891.150 B   | 697.642 B    |

## Consequências

- O primeiro uso baixa **3,05 MB brutos; 0,89 MB com compressão (T8)**, contra 15,5 MB / 3,9 MB do
  pacote npm, e a carga no desktop cai de ~0,7 s para ~0,1 s. Enquanto a T8 não comprimir a
  resposta, vale o número bruto. O celular médio segue sendo medido na T15.
- Atualizar o OpenCV ou acrescentar função à whitelist é: editar `deploy/opencv-build/`, rodar o
  script, trocar o artefato e o sha256 do contrato no mesmo commit. Função fora da whitelist **não
  existe** no `cv` — o worker falha no teste, não em produção.
- O artefato não traz `.d.ts`: o worker da T8 declara o tipo mínimo que usa (como o spike fazia).
- O `@techstark/opencv-js` não entra no `package.json`.
- Se a validação mostrar carga ruim no Android médio, o próximo passo é emagrecer este build
  (`-Oz`, whitelist menor), não trocar de abordagem.

## O que reabriria esta decisão

- Um OpenCV.js oficial compilado sem execução dinâmica: o build próprio vira dependência fixada.
- Um segundo produto precisar do motor: o artefato e o script vão para `adatechnology-packages`.
- A validação (T15) reprovar a abordagem A.
