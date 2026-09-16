# Spec 152 — Evidências

## T0 — Pré-requisito

Data: 2026-09-15. Modelo: `haiku`.

### Confirmar commits em origin/staging

- ✓ `1f61c4a5` (leitor em tela cheia com guia/faixa e caixa lida abrindo a medição)
- ✓ `3ae7d76b` (formatos de código de barras: linear antes de QR)

Ambos confirmados em `origin/staging` com `git merge-base --is-ancestor`.

### Rebase

Branch antes: `work/spec-150` [ahead 3, behind 6] de `origin/staging`

```
$ git rebase origin/staging
Successfully rebased and updated refs/heads/work/spec-150.
```

Sem conflitos. Commit novo na branch: `4c960ad5`.

### make check

Saída: **0 fail, 0 bloqueios**.

Resumo por app:

| App                   | Testes            | Status |
| --------------------- | ----------------- | ------ |
| api-transportada      | 5820 pass, 0 fail | ✓      |
| worker-transportada   | 1332 pass, 0 fail | ✓      |
| cron-transportada     | 94 pass, 0 fail   | ✓      |
| frontend-transportada | 3694 pass, 0 fail | ✓      |
| frontend-client       | 31 pass, 0 fail   | ✓      |
| frontend-landing      | 111 pass, 0 fail  | ✓      |

Build: ✓ (todos os assets, sem erro, avisos de chunk esperados no Vite)
Format/Lint/Typecheck: ✓

**Status:** T0 completo. Branch rebaseada com sucesso, gates verdes.

---

## T1 — preparação

Data: 2026-09-15. Modelo: `opus`. Esta seção cobre só a **parte preparatória** do T1: a página, o
cartão, as medições de build e de tempo no desktop, e o roteiro. A sessão com caixas reais é do
usuário e **ainda não aconteceu**. Nenhuma medida de caixa foi inventada aqui, e o go/no-go continua
em aberto.

### O que foi montado

Tudo em `spike/152-medir-caixa/`, código descartável e fora de `apps/`:

| Arquivo                               | Papel                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` + `src/main.ts`          | Página de medição: câmera traseira, indicador ao vivo, "Capturar", foto congelada com 5 pontos, cálculo, registro da caixa e exportação.                                                     |
| `src/detector.worker.ts`              | Worker `type: 'module'` criado por `new URL(…, import.meta.url)` (sem `blob:`). Carrega o OpenCV por `import()` no primeiro pedido. Detecta o ArUco id 0 e calcula luz, contraste e nitidez. |
| `src/geometry.ts`                     | Puro: homografia (DLT de 4 pontos), focal pela homografia, pose, projeção, ângulo de visão, altura pela aresta vertical.                                                                     |
| `src/measurement.ts`                  | Puro: `measureBox` (C×L×A), `estimateMargins` (Monte Carlo com semente), `classifyMargin` (10/30 mm).                                                                                        |
| `src/warnings.ts`                     | Puro: `detectWarnings`, com os códigos de D9 e os limites iniciais.                                                                                                                          |
| `src/session.ts`                      | Puro: linhas da sessão, resumo go/no-go, CSV e tabela markdown.                                                                                                                              |
| `src/marking.ts`                      | Pontos arrastáveis (área de toque de 28 px CSS de raio), lupa 4×, teclado (A–E escolhe, setas movem 1 px, Shift move 10 px).                                                                 |
| `card.html` → `cartao-de-medicao.pdf` | Cartão A4: ArUco `DICT_4X4_50` id 0 com 150 mm, margem branca de 20 mm, régua de 100 mm e o aviso "imprima em 100%".                                                                         |
| `bench.html` + `scripts/*.ts`         | Medições de build e de tempo.                                                                                                                                                                |
| `test/measurement.test.ts`            | 16 testes das funções puras.                                                                                                                                                                 |

### Método de medida implementado

Os pontos seguem o plan.md, com a convenção fixada assim:

- A, B, C e D são os cantos da face de cima, em volta. A é o canto de cima da aresta vertical
  visível.
- E é o pé dessa aresta.

**C e L** vêm da homografia marcador→imagem, invertida. Os 4 cantos da face vão para o plano do
cartão em mm. Cada dimensão é a média dos lados opostos, e C é a maior aresta de cima.

**A** vem da pose:

1. A focal sai da própria homografia, pelas duas restrições de Zhang (pixel quadrado e ponto
   principal no centro).
2. Com a focal, sai a pose `R|t`.
3. A altura é o ponto de aproximação máxima entre a reta vertical que desce de A e o raio da câmera
   que passa por E.

A focal só é aceita dentro da faixa física de celular (FOV de 40° a 100°). Fora dela, o cálculo cai
para o FOV padrão de 68°, e isso fica registrado como `focalSource = defaultFov` na exportação.

⚠️ **Desvio do plan.md, a levar à ADR (T2).** A pose sai de TS puro e não de `cv.solvePnP`. Motivos:

- dá para testar sem WASM;
- um build próprio poderia dispensar o `calib3d`.

A pose sintética conhecida mede com erro abaixo de 1 mm nas três dimensões e recupera a focal com
menos de 1 px de erro (teste).

**Margem** (D7): `m = 2σ + piso`, com 400 amostras de Monte Carlo e semente fixa. As incertezas
entram assim:

- cantos do marcador: `σ = √(0,3² + reprojeção²)` px;
- toques: `σ = 1,5` px;
- focal: com `defaultFov`, a própria focal é perturbada em 10% (σ), porque sem ela a margem da
  altura seria otimista.

O piso de impressão é `2 mm + 0,2% da dimensão`, porque a escala errada do cartão é proporcional. Os
valores de 0,3 px, 1,5 px, 10% e do piso são **chutes iniciais**, e a sessão recalibra (critério de
cobertura de 90%).

### Motivos de imprecisão (D9): limites iniciais

Todos a calibrar com a sessão:

| Código           | Condição no spike                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `markerNotFound` | nenhum id 0 no quadro                                                                                       |
| `markerTooSmall` | lado médio do marcador `< 80 px`                                                                            |
| `steepAngle`     | ângulo entre o eixo óptico e a normal do cartão `> 55°`                                                     |
| `lowLight`       | luminância média `< 60` ou desvio `< 20` (0–255, quadro reduzido a 640 px)                                  |
| `blurry`         | variância do Laplaciano `< 60` (mesmo quadro reduzido)                                                      |
| `boxOutOfFrame`  | algum dos 5 pontos a menos de 12 px da borda                                                                |
| `unstable`       | canto do marcador andou em média `> 3 px` entre quadros ao vivo seguidos                                    |
| `markerAtEdge`   | **proposta do spike, fora de D9:** canto do marcador a menos de 12 px da borda (marcador parcialmente fora) |

Se a sessão mostrar que `markerAtEdge` prevê erro, ele vira código de D9 via T2. Se não, sai do
motor.

### Tamanho do OpenCV (`@techstark/opencv-js@5.0.0-release.1`, OpenCV 5.0.0)

O pacote é **um arquivo só**: o `.wasm` vai embutido no `opencv.js` como literal binário
(`SINGLE_FILE` do Emscripten 4). Não existe `.wasm` separado para servir.

| Medida                                                | Bruto        | gzip -9     |
| ----------------------------------------------------- | ------------ | ----------- |
| `dist/opencv.js` (arquivo do pacote)                  | 13.298.869 B | 3.748.560 B |
| WASM extraído do literal                              | 11.958.198 B | 3.504.609 B |
| Cola JS sem o literal                                 | 128.074 B    | 33.550 B    |
| Chunk gerado pelo `vite build` (`assets/opencv-*.js`) | 15.515.064 B | 3.894.739 B |

O chunk do Vite fica maior que o arquivo porque o literal é reescapado. Mesmo assim, ele sai
**separado** do `index` (`index-*.js` com 18,7 kB), carregado só pelo worker.

Consequências para T2/T7:

1. A resposta do servidor precisa ir comprimida, ou são 15,5 MB pela rede.
2. O cache do service worker precisa aceitar um arquivo de 15 MB. O limite padrão de runtime cache
   do Workbox não barra isso, mas o `maximumFileSizeToCacheInBytes` do precache barra (e aqui é
   runtime cache, como diz a spec).
3. A CSP: o WASM é instanciado a partir de bytes em memória, e `'wasm-unsafe-eval'` (que já existe)
   cobre isso.

### `ArucoDetector` existe no build

A sonda está em `scripts/probe-opencv.ts`. O detector aparece como **`cv.aruco_ArucoDetector`** (não
`cv.ArucoDetector`), junto com:

- `cv.aruco_DetectorParameters`, `cv.aruco_RefineParameters` e `cv.aruco_Dictionary`;
- `cv.getPredefinedDictionary`, `cv.generateImageMarker` e `cv.DICT_4X4_50`;
- `cv.aruco_CharucoDetector`;
- `solvePnP`, `findHomography`, `projectPoints`, `Rodrigues`, `Laplacian` e `meanStdDev`.

`cv.cornerSubPix` **não** é exportado como função solta. O refinamento subpixel acontece dentro do
detector, com `cornerRefinementMethod = CORNER_REFINE_SUBPIX`, e ele funciona.

Os tipos do pacote não declaram o aruco, então o spike tem um tipo mínimo próprio
(`src/opencv.types.ts`). O T7 vai precisar do mesmo.

**Build próprio: não executado**, porque o detector existe. Se for preciso emagrecer o WASM, este é
o caminho a avaliar na ADR:

1. `emsdk` 4.x.
2. `emcmake python platforms/js/build_js.py build_js --build_wasm --config <whitelist>`, com uma
   whitelist só de `core`, `imgproc` (`cvtColor`, `resize`, `Laplacian`, `meanStdDev`) e
   `objdetect` (aruco).
3. Sem `calib3d`, porque a pose é TS puro.
4. `-s SINGLE_FILE=0`, para servir o `.wasm` separado, com `Content-Type: application/wasm` e
   streaming compile.

O tamanho resultante não foi medido.

### Tempos no desktop

Máquina: Mac, 11 núcleos lógicos.

| Onde                                           | Carga do OpenCV                     | Análise por quadro 720×405                 | Análise por quadro 1920×1080          |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------ | ------------------------------------- |
| Bun 1.3.14 (`scripts/bench-detect.ts`)         | 270–438 ms                          | —                                          | 12,1 ms mediana / 16,9 p90 (1280×720) |
| Chromium headless 145, worker (`bench.html`)   | 695 ms no worker (715 ms de parede) | 4,3 ms mediana / 4,6 p90                   | 19,5 ms mediana / 21,0 p90            |
| Chromium headless, câmera falsa (`index.html`) | 683 ms                              | 18 ms mediana (padrão animado do Chromium) | —                                     |

Observações:

- A análise inclui detecção + luminância + Laplaciano. A detecção achou o id 0 em 30/30 e 10/10
  quadros sintéticos.
- No Bun, o erro máximo de canto contra o warp sintético foi de 0,73 px.
- O smoke com câmera falsa passou pelo ciclo abrir → ao vivo → capturar → tela de marcação, sem erro
  de página. Como o vídeo falso não tem cartão, apareceram `markerNotFound`, `blurry` e `lowLight`,
  o que confirma que os motivos chegam à tela.
- Os tempos de carga são **com arquivo local e cache quente**: não incluem o download de 3,9 MB gzip.

⏳ **Os tempos no celular ficam para a sessão.** A página mostra o tempo de carga, a mediana por
quadro ao vivo, o tempo da captura e o do Monte Carlo na linha "Sessão", e isso deve ser anotado por
aparelho. A referência é o orçamento de fallback do plan.md: 800 ms por quadro, 15 s de carga.

### Testes do spike

```
$ bun test test/        (spike/152-medir-caixa)
 16 pass
 0 fail
 37 expect() calls
$ bunx tsc --noEmit     → sem erro
$ bunx vite build       → ok (opencv em chunk próprio)
```

Os testes cobrem:

- pose sintética conhecida: erro abaixo de 1 mm em C, L e A, focal recuperada, rotação recuperada;
- Monte Carlo determinístico com a mesma semente, margem acima do piso e margem que cresce com o
  toque impreciso;
- fronteiras 10/30 de `classifyMargin`;
- cada código de motivo;
- o resumo go/no-go (80% com erro ≤ 10 mm e 90% dentro da margem, e a margem otimista reprova).

### Configuração do repositório

**Nada foi alterado.**

- O `prettier --check .` da raiz alcança `spike/`, mas os arquivos do spike foram formatados com o
  `.prettierrc.json` do repo, e o check passa.
- `dist/` e `node_modules` já são ignorados pelo `.gitignore` e pelo `.prettierignore`.
- Lint e typecheck da raiz rodam por app (`apps/*`), e os workspaces são só `apps/*`, então o spike
  não entra no `make check`.
- O spike tem `package.json` e `bun.lock` próprios, instalados à parte.

### Como o usuário roda a sessão

**1. Imprimir e conferir o cartão**

1. Imprima `spike/152-medir-caixa/cartao-de-medicao.pdf` (A4, 1 página) em impressora de
   escritório, em **100% / tamanho real**, sem "ajustar à página".
2. Meça com a fita:
   - a régua deve dar **100 mm**;
   - o quadrado preto deve dar **150 mm** de lado.
3. Se errar mais que 1 mm, não use o cartão. Anote as duas medidas no fim desta seção: elas
   calibram o piso de impressão.
4. Mantenha a folha plana. Colar num papelão ajuda.

**2. Servir a página por HTTPS na rede local**

O celular só abre a câmera em contexto seguro.

```bash
cd spike/152-medir-caixa
bun install
bun run build
SPIKE_HTTPS=1 bun run preview      # https://<ip-do-mac>:4173  (ex.: https://192.168.3.207:4173)
```

O certificado é autoassinado (`@vitejs/plugin-basic-ssl`), então o navegador vai reclamar:

- Chrome Android: "Avançado" → "Continuar".
- Safari iPhone: "Mostrar detalhes" → "visitar este site".

Celular e Mac precisam estar na mesma rede Wi-Fi. Se a rede isolar os clientes, use um túnel: com
`cloudflared tunnel --url http://localhost:4173` (após `brew install cloudflared`), sirva sem
`SPIKE_HTTPS` e abra a URL `https://…trycloudflare.com`. O `vite.config.ts` já libera esse host.

Use o `preview` (build) e não o `dev`: o `dev` reprocessa 13 MB do OpenCV na primeira carga.

**3. Na página, por caixa**

1. Preencha "Aparelho" (o valor vem do navegador, mas dê um nome curto, ex. `moto-g54` ou
   `iphone-13`), "Luz" e "Caixa" (rótulo **igual nos dois aparelhos**, ex. `caixa 07`).
2. Toque "Abrir câmera".
3. Ponha o cartão plano sobre a face de cima e enquadre a caixa inteira, de cima e de lado, com a
   aresta vertical da frente visível até o chão.
4. Espere o status "✓ Pronto para capturar" (ou anote o motivo que não sai) e toque "Capturar".
5. Arraste os pontos, usando a lupa:
   - A: canto de cima da aresta vertical da frente;
   - B, C e D: os outros cantos de cima, em volta;
   - E: o pé da aresta que desce de A.
6. Toque "Calcular".
7. Digite a fita em mm:
   - C: maior aresta de cima;
   - L: menor aresta de cima;
   - A: altura.
8. Toque "Registrar esta caixa".
9. Ao fim de cada aparelho, "Copiar tabela" e cole abaixo (ou "Copiar CSV"). As linhas ficam
   guardadas no aparelho (`localStorage`) até "Apagar sessão".
10. Anote também a linha "Sessão" (carga do OpenCV, mediana por quadro, captura e Monte Carlo) de
    cada aparelho.

**4. Roteiro mínimo** (R6)

| Item      | Mínimo                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------- |
| Caixas    | 20 caixas reais de 30–80 cm, de papelão com fita e etiqueta, variadas (cúbica, achatada, alta)    |
| Aparelhos | 2: um Android médio e um iPhone. **Cada caixa é medida nos dois.**                                |
| Luz       | 2 condições: caixas 1–10 com luz boa e 11–20 com luz fraca (ou cada caixa nas duas, se der tempo) |
| Fita      | uma medida de fita por caixa, a mesma nos dois aparelhos, arredondada ao mm                       |
| Total     | ≥ 40 capturas, ≥ 120 dimensões                                                                    |

**Go:** erro `≤ 10 mm` em ≥ 80% das dimensões **e** `|erro| ≤ margem` em ≥ 90%. O resumo da página
calcula as duas taxas. O go/no-go final é decidido sobre a tabela colada aqui, somando os dois
aparelhos.

### Sessão com caixas reais — a preencher pelo usuário

Conferência do cartão impresso: régua = `___ mm` (esperado 100) · quadrado = `___ mm` (esperado 150)
· impressora: `___`.

Tempos por aparelho:

| Aparelho | Navegador | Carga do OpenCV | Quadro ao vivo (mediana) | Captura | Monte Carlo |
| -------- | --------- | --------------- | ------------------------ | ------- | ----------- |
|          |           |                 |                          |         |             |
|          |           |                 |                          |         |             |

Medidas (colar a saída de "Copiar tabela"; uma linha por dimensão):

| caixa | dimensao | fita_mm | camera_mm | erro_mm | margem_mm | dentro_da_margem | motivos | aparelho | luz | focal | angulo_graus | lado_marcador_px | capturado_em |
| ----- | -------- | ------- | --------- | ------- | --------- | ---------------- | ------- | -------- | --- | ----- | ------------ | ---------------- | ------------ |
|       |          |         |           |         |           |                  |         |          |     |       |              |                  |              |

Resumo: dimensões com fita `___` · erro ≤ 10 mm `___%` · dentro da margem `___%` · **go / no-go**:
`___`.

### Bloqueios e riscos vistos na preparação

- **Nenhum bloqueio** para a sessão.
- **Risco (focal):** com o cartão quase de frente para a câmera, a focal não sai da homografia e o
  cálculo cai no FOV padrão de 68°, com a margem da altura inflada em 10%. A coluna `focal` mostra
  quanto isso acontece. Se for frequente, T2 avalia pedir uma foto mais oblíqua ou calibrar a focal
  por aparelho.
- **Peso:** 3,9 MB gzip / 15,5 MB brutos no primeiro uso. O build próprio fica como alternativa na
  ADR.

---

## Decisão de 2026-09-15 — experimental, sem esperar a sessão real

Decisão do usuário (2026-09-15): seguir com a medida pela câmera **sem esperar** a sessão com
caixas reais. Registrada no `spec.md` como D13–D19. Resumo:

- **Experimental (D13):** selo "Experimental" e texto de estimativa nas etapas Medida e Conferência;
  nada grava sem o operador; digitação sempre disponível e caminho padrão.
- **Interruptor (D14):** `company_cargo_settings.camera_measurement_enabled`, `default false` em
  **todo** ambiente; staging é ligado **pelo painel** depois da publicação (T14), produção só depois
  do go da validação e com aprovação do usuário (T16). Motivo: desligar sem deploy, default seguro
  sem ramificar por `APP_ENV` (A02:2025), instalação dedicada por transportadora (ADR-0021).
  Painel `cameraMeasurement` na aba `packageBoxes` do `nfe-workspace` (`SETTINGS_PANEL_PLACEMENT`).
  O conferente lê por `GET /nfe-package-boxes/measurement-settings` (`cargo.measure`); a API recusa
  câmera com a função desligada (`422`).
- **Limites provisórios (D15):** 10/30 mm seguem, marcados como provisórios até a validação.
- **Validação posterior (D16):** a sessão deste arquivo (§ "Sessão com caixas reais") não é mais
  portão de construção. Ela vira a T15, rodada em staging com a tela implementada e o export do
  histórico; o critério (≤ 10 mm em ≥ 80% e dentro da margem em ≥ 90%) decide tirar o selo e ligar
  em produção.
- **Histórico com proposta (D17)**, **carga e cache no celular médio (D18)** e **stream extraído do
  leitor (D19)**.
- Origem `manual` renomeada para `typed` antes de existir no contrato.

Renumeração das tarefas: a antiga T1 (spike com sessão real) virou T15; a antiga T2 (ADR) virou T1.
As referências a "T1"/"T2" na seção "T1 — preparação" acima são da numeração antiga. O spike e seus
16 testes ficam como base do motor (T6).

Fatos conferidos em `origin/staging` para a revisão: CSP já tem `'wasm-unsafe-eval'` e
`worker-src 'self'`; Permissions-Policy `camera=(self)`; Workbox com `globIgnores` de
`background-removal` (precedente para o chunk do OpenCV) e só `/health/` em `runtimeCaching`;
`nfe_package_boxes` sem coluna de origem/autor/margem/motivos (tem `carton_gtin` da spec 151);
`GET /company-settings/cargo` exige `settings.manage`; `useBarcodeScanner` fecha o stream ao
desativar (por isso D19); última migration `20260915025926_nfe_document_protocol_presence`; próximo
ADR livre 0065. Nenhum `[NEEDS CLARIFICATION]` aberto.

---

## T1 — ADR-0065 e o OpenCV sob a CSP

ADR: `docs/adr/0065-a-caixa-se-mede-com-cartao-e-nunca-grava-sozinha.md` (0065 conferido livre em
`origin/staging`).

### O pacote npm não inicia sob a CSP (parada obrigatória)

`@techstark/opencv-js@5.0.0-release.1` é o pacote oficial (Apache-2.0, `latest`, publicado em
2026-06-24, repositório TechStark/opencv-js com 783 estrelas, ativo; o nome sem escopo `opencv-js`
foi despublicado em 2017). Mas o embind do Emscripten monta invocadores com `new Function`.

Sonda descartável (scratchpad): Vite 7.3.6, worker `type: 'module'` que carrega o OpenCV, cria o
`aruco_ArucoDetector` e detecta um marcador id 0 gerado pelo próprio OpenCV; `Bun.serve` com a CSP
de `buildContentSecurityPolicy` em toda resposta (como o `server.ts`); Chromium headless do
Playwright 1.58.2.

| Artefato                 | CSP servida                            | Resultado                                                             |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------- |
| pacote npm               | a de hoje                              | `EvalError: … 'unsafe-eval' is not an allowed source of script`       |
| pacote npm               | nenhuma (controle)                     | ok, carga 229 ms, id 0                                                |
| pacote npm               | `'unsafe-eval'` no app todo            | ok                                                                    |
| pacote npm               | `'unsafe-eval'` só no script do worker | ok, carga 232 ms, id 0                                                |
| build próprio, 1ª versão | a de hoje                              | inicia; falha no binding (`unbound types: cv::Algorithm`) — whitelist |
| **build próprio final**  | **a de hoje, sem mudança**             | **ok, carga 101 / 73 / 71 ms, id 0, zero violação (página e worker)** |

A dependência foi instalada, conferida (`bun install --frozen-lockfile` verde) e desfeita. Decisão
do usuário: opção 1, build próprio com a CSP intacta.

### Build próprio

`deploy/opencv-build/build.sh` + `opencv_js.config.py`, emsdk nativo (o Docker local travou):
Emscripten 4.0.20 (emsdk `33aee63c`), OpenCV 5.0.0 (`40738fb1`), `--build_wasm`, `SINGLE_FILE=1`,
`-s DYNAMIC_EXECUTION=0`, `-DCMAKE_CXX_STANDARD=17`, `SOURCE_DATE_EPOCH` = data do commit.

- Módulos: `core`, `imgproc`, `objdetect` + dependências `geometry`, `features`, `flann`, e `photo`
  (o `core_bindings.cpp` do 5.0.0 faz `using namespace cv::segmentation` sem condição, e o namespace
  mora em `photo`; o primeiro build sem ele falhou em `bindings.cpp:128`). Fora: `3d`, `calib`,
  `dnn`, `stereo`, `video`, `ml`, testes, perf, exemplos.
- Whitelist: `copyMakeBorder`, `meanStdDev`, `cvtColor`, `resize`, `Laplacian`,
  `getPerspectiveTransform`, `warpPerspective`, `getPredefinedDictionary`, `generateImageMarker`,
  `Algorithm` (base do detector), `aruco_Dictionary`, `aruco_DetectorParameters`,
  `aruco_RefineParameters`, `aruco_ArucoDetector.detectMarkers` — tudo o que o spike chama.
- Pós-build: wrapper UMD com `globalThis` e `var Module`; o script recusa `new Function`/`eval(`.
  Varredura do artefato: `new Function` 0, `eval(` 0.

| Tamanho                  | Bruto        | gzip -9     | brotli -q 11 |
| ------------------------ | ------------ | ----------- | ------------ |
| pacote npm `opencv.js`   | 13.298.869 B | 3.747.048 B | 2.672.690 B  |
| pacote npm, chunk Vite   | 15.515.064 B | 3.894.739 B | 2.785.688 B  |
| **build próprio**        | 2.672.625 B  | 868.423 B   | 675.009 B    |
| **build próprio, chunk** | 3.066.378 B  | 893.029 B   | 697.438 B    |

Reprodutibilidade: dois builds limpos antes do `SOURCE_DATE_EPOCH` diferiram em 4 bytes (offset
2.187.723, o `Timestamp` do `getBuildInformation()`). Com ele, dois builds limpos seguidos (218 s e
223 s) deram o mesmo sha256 `9b6f16038c9a4d4664a52e201d8b9e376c852e520a4038509d3fa8a38d02198b`
(`cmp` idêntico), com `Timestamp: 2026-06-05T18:50:05Z`.

### Onde o artefato mora

Opção (a): script versionado em `deploy/opencv-build/` e artefato versionado em
`apps/frontend-transportada/vendor/opencv/opencv.js` (+ `LICENSE` Apache-2.0), fora de `public/`
(fora do precache), marcado `binary` no `.gitattributes` (213.784 bytes NUL no literal do WASM), no
`.prettierignore` e nos `ignores` do eslint. Nada publicado. Trade-off na ADR-0065 §3.

### Contrato (antes da implementação)

`test/shared/opencv-build.contract.ts` (importado em `test/shared.contract.test.ts`, já listado no
`package.json`): sha256 do artefato, sem `new Function`/`eval(`, wrapper UMD ajustado, versões e
`DYNAMIC_EXECUTION=0` no script, `@techstark/opencv-js` fora do `package.json`, só o worker de medida
pode importar o OpenCV (hoje ninguém), fora de `public/` e do `vite.config.ts`, e CSP com
`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'` e sem `'unsafe-eval'`.

```
$ bun test test/shared.contract.test.ts -t "OpenCV"
 8 pass · 256 filtered out · 0 fail
```

### Build do frontend

Nenhum import do OpenCV ainda (T8): o `dist` não tem arquivo `*opencv*`, o `sw.js` não o menciona e
nenhum `.js` do `dist` contém `aruco_ArucoDetector` (precache de 128 entradas, 4296,79 KiB, como
antes). `dist/content-security-policy.txt`: `script-src 'self' 'wasm-unsafe-eval'` e
`worker-src 'self'`, inalterados. Na sonda, o artefato sai como chunk próprio (`assets/opencv-*.js`)
separado do `index` e do worker; o `globIgnores` + `CacheFirst` desse chunk é da T8.

### Gates

| Gate                            | Resultado                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bunx prettier --check .`       | verde                                                                                                     |
| `bun install --frozen-lockfile` | verde, sem mudança no lock                                                                                |
| `bun run typecheck`             | verde                                                                                                     |
| `bun run lint`                  | verde                                                                                                     |
| `make check`                    | verde, 0 `(fail)`: api 5824 · worker 1354 · cron 94 · frontend 3721 · client 31 · landing 111 · 18 (raiz) |

---

## T1 — ajustes do architect

Revisão do architect: T1 aprovada com ajustes. Commit de correção isolado sobre `4591d0c0`.

### 1. Procedência

- `deploy/opencv-build/build-in-docker.sh`: roda o `build.sh` em
  `emscripten/emsdk@sha256:460fff8f8ac87e11b16447fbd66538a686eafa0e4fb977aa0989ed19fe2079f7` (lista
  de manifestos da tag `4.0.20`, conferida na API do registry: amd64 `33e99236…`, arm64 `9bcd8da8…`).
  A imagem já traz `emcc` 4.0.20, `cmake`, `make`, `git` e `python3`; o `build.sh` usa o `emcc` do
  PATH quando a versão bate e só baixa o emsdk fora dela.
- `.github/workflows/opencv-reproducibility.yml`: `workflow_dispatch`, `cron` mensal
  (`0 6 1 * *`), `pull_request`/`push` em `deploy/opencv-build/**` e
  `apps/frontend-transportada/vendor/opencv/**`; recompila no contêiner, sobe o resultado como
  `opencv-js-rebuild` (sempre) e falha se o sha256 do contrato divergir do versionado ou do
  recompilado. YAML validado com `Bun.YAML.parse` (sem `actionlint` na máquina); `bash -n` nos dois
  scripts (sem `shellcheck`).
- **Build no contêiner: não rodou.** `docker info` sem resposta em 20 s; não insisti. O artefato
  versionado é do build nativo — macOS 26.5.1 (25F80) arm64, cmake 4.4.3, Python 3.14.6, GNU Make
  3.81, emsdk 4.0.20 (`33aee63c`, emcc `6913738e`). Pendência na ADR-0065 §2: o hash canônico passa
  a ser o do contêiner na primeira execução do workflow.

**Achado durante o ajuste:** o artefato de `4591d0c0` levava **77 caminhos absolutos da máquina
local** (o `__FILE__` dos `CV_Error`, com o diretório de trabalho e o nome do usuário) e o
`getBuildInformation()` com host e ferramentas. Sem corrigir, nem o contêiner reproduziria o sha256.
Correção no `build.sh`: `-ffile-prefix-map=<trabalho>=/opencv-build` e `=<emsdk>=/emsdk`, e o
`version_string.inc` trocado por uma linha fixa entre `--config_only` e `--skip_config`; o script
recusa a saída se o caminho de trabalho sobrar, e o contrato ganhou a asserção. ⚠️ O blob antigo
continua no histórico de `4591d0c0` (não publicado).

Build nativo novo, duas vezes do zero (207 s e 197 s): sha256
`0299ef7bd89155591f8d8fb100354100030a8af916e5221b4e172da30d824d5d` nas duas (`cmp` idêntico).
Varredura: `scratchpad` 0, `/private/` 0, `/Users/` 0, nome do usuário 0, `Darwin` 0, `Timestamp` 0;
`/opencv-build/` 75 e `/emsdk/` 1 (caminhos neutros).

| Tamanho       | Bruto       | gzip -9   | brotli -q 11 |
| ------------- | ----------- | --------- | ------------ |
| `opencv.js`   | 2.657.964 B | 866.519 B | 671.870 B    |
| chunk do Vite | 3.053.658 B | 891.150 B | 697.642 B    |

Sonda com a CSP real (`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`): ok, carga
82,6 / 71,5 / 70,5 ms, ArUco id 0 detectado, zero violação.

### 2. Licenças

`vendor/opencv/`: `LICENSE` (Apache-2.0), `COPYRIGHT` (da tag 5.0.0), `NOTICE` (build modificado:
flags, módulos, whitelist, patch UMD, build info neutralizado; fonte em `deploy/opencv-build/NOTICE`)
e `third-party-licenses/` — `SoftFloat-COPYING.txt`, `annoylib-LICENSE`, `dlpack-LICENSE`,
`flatbuffers-LICENSE.txt`, `fonts-Rubik_OFL.txt`, `mscr-chi_table_LICENSE.txt`, `protobuf-LICENSE`,
`protobuf-README.md`, `zlib-LICENSE` e `emscripten-LICENSE`. O `build_js.py` não roda `install`,
então não existe `build_js/etc/licenses`: o `build.sh` usa `cmake --install build_js --component
licenses` e copia tudo sozinho.

### 3. Compressão, pré-requisitos da T8 e fallback

ADR-0065 §4 e Consequências, e D18/Peso/Riscos do `spec.md`: "3,05 MB brutos; 0,89 MB com
compressão (T8)" — o `server.ts` não comprime hoje. Pré-requisitos anotados na T8 do `tasks.md`:
gzip/brotli no `server.ts`, `worker: { format: 'es' }` no `vite.config.ts`, e fallback (WASM/worker
que falha → formulário digitado com aviso, nada grava).

### 4. Checagem endurecida

`build.sh` e contrato usam `/(?<![A-Za-z0-9_$.])(new\s+)?Function\s*\(|(?<![A-Za-z0-9_$.])eval\s*\(/`.
O artefato atual passa (0 ocorrências, conferido em JS e em Python antes de trocar).

### 5. Contrato

O cabeçalho de copyright já era o de `content-security-policy.contract.ts:1`. Pendências na T8:
trocar a asserção negativa do `vite.config.ts` por positiva (`globIgnores` + `CacheFirst`
`transportada-opencv`) e "só o worker importa" por "o worker importa o artefato".

```
$ bun test test/shared.contract.test.ts -t "OpenCV"
 10 pass · 256 filtered out · 0 fail
```

### Gates dos ajustes

| Gate                                            | Resultado                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `bunx prettier --check .`                       | verde                                                                     |
| `bun install --frozen-lockfile`                 | verde, sem mudança no lock                                                |
| `bun run typecheck` / `bun run lint`            | verdes                                                                    |
| `bun run --cwd apps/frontend-transportada test` | 3723 pass, 0 fail, 0 `(fail)`                                             |
| build do frontend                               | verde; `dist` sem `*opencv*`, `sw.js` sem OpenCV, precache 128 entradas   |
| `dist/content-security-policy.txt`              | `script-src 'self' 'wasm-unsafe-eval'` · `worker-src 'self'` (inalterada) |
| workflow                                        | YAML válido (`Bun.YAML.parse`); `actionlint` indisponível                 |

## T2 — Migration aditiva e schema

Data: 2026-09-15/16. Modelo: `sonnet`. Revisada pelo `architect` antes do commit — **aprovada com
ajustes A1–A7**, todos aplicados neste commit.

### Desenho

- `nfe_package_boxes` ganha `measurement_source varchar(16)` (CHECK `typed|camera|camera_adjusted`)
  e `measurement_margin_mm integer` (CHECK `0..3000`), mais `UNIQUE(company_id, id)` — alvo da FK
  composta abaixo.
- Tabela nova `nfe_package_box_measurements` (histórico append-only): FK composta
  `(company_id, package_box_id)` → `nfe_package_boxes(company_id, id)`; `source`, dimensões,
  margens, `warnings varchar(32)[]`, `imprecise_confirmed`, `engine`, `proposed_*_mm` (D17),
  `measured_by_user_id` **sem FK** (A1), `created_at`.
- `company_cargo_settings.camera_measurement_enabled boolean not null default false`.
- Migration `drizzle/20260916000000_nfe_package_box_measurement_source/` (posterior a
  `20260915233000_rate_limit_windows`), gerada por `db:generate` a partir do schema TS (nunca editada
  à mão), com `rollback.sql` que recusa desfazer se já houver `measurement_source` gravado ou linha
  no histórico.

### Ajustes do architect (A1–A7)

- **A1** — removida a FK `nfe_package_box_measurements_actor_membership_fk` de
  `measured_by_user_id`. `removeMembership` (spec 149) faz `DELETE` físico da linha de membership;
  com `RESTRICT` a remoção do conferente quebraria, com `SET NULL`/`CASCADE` a auditoria perderia o
  ator. O isolamento por empresa continua garantido pela FK composta
  `(company_id, package_box_id)` → `nfe_package_boxes(company_id, id)`; o ator vira dado guardado,
  não vínculo referencial. **Assimetria registrada**: o repo tem hoje dois padrões vivos para "ator
  do contexto" em tabela de histórico — `actorUserId`/`created_by`/`requested_by_user_id` com FK
  composta para `user_company_memberships` (billing, nfe_imports, nfe_documents,
  processing_outbox, client_delivery_addresses, company_toll_booth_charges) vs.
  `measured_by_user_id` aqui, sem FK, pelo motivo acima. Não uniformizei — é decisão específica
  desta tabela, não um novo padrão a copiar.
  - ⚠️ Verificação pedida: `test/nfe-schema/tenant-safety.contract.ts` tem **dois** testes — o
    genérico (`requires company ownership...`) que vale para toda tabela de `NFE_SCHEMA_EXPORT_NAMES`
    e só exige a FK de `company_id`, e um **hardcoded** (`keeps requesting and publishing actors
linked to persisted identities`) com uma lista fixa de três tabelas (`nfeImports`, `nfeDocuments`,
    `processingOutbox`) que não inclui `nfePackageBoxMeasurements`. Registrar a tabela em A2 não
    disparou exigência de FK de ator — não precisei editar o contrato nem parar.
- **A2** — `nfePackageBoxMeasurements` registrada em `test/nfe-schema/tables.ts` e
  `nfe_package_box_measurements` em `test/nfe-schema/aggregator.contract.ts`. `tenant-safety.contract.ts`
  passou sem alteração: o nome lógico da FK de `company_id` (`getTableConfig().foreignKeys[].getName()`)
  já sai como `..._company_id_companies_id_fk` para referência inline sem nome explícito (mesmo
  comportamento de `nfePackageBoxes`), então bateu com o que o teste espera.
- **A3** — `'nfe_package_box_measurements'` acrescentada a `NFE_TABLES` em
  `test/database-migration/support.ts`. **Item registrado, não corrigido nesta task**: `nfe_package_boxes`
  continua fora de `NFE_TABLES` (lacuna pré-existente, fora do escopo de T2).
- **A4** — índice `nfe_package_box_measurements_company_created_idx` em
  `(company_id, created_at desc, id desc)`, para o export por período da T5 (sem filtrar por caixa).
- **A5** — CHECKs de pareamento: em `nfe_package_boxes`,
  `nfe_package_boxes_measurement_source_pairing_check` (origem só com medida) e
  `nfe_package_boxes_measurement_margin_pairing_check` (margem nula quando `typed`); na tabela nova,
  `nfe_package_box_measurements_typed_pairing_check` (`typed` ⇒ margens/`proposed_*`/`engine` nulos),
  `nfe_package_box_measurements_camera_engine_check` (`camera`/`camera_adjusted` ⇒ `engine` não nulo)
  e `nfe_package_box_measurements_margin_range_check` (`0..3000` nas três margens).
- **A6** — `nfe_package_box_measurements_warnings_domain_check`
  (`warnings <@ ARRAY[...]::varchar(32)[]`) com os 7 códigos fechados de D9 (`markerNotFound`,
  `markerTooSmall`, `steepAngle`, `lowLight`, `blurry`, `boxOutOfFrame`, `unstable`).
  **`markerAtEdge` fica de fora de propósito**: o `tasks.md` (T6) já decidiu que ele é código interno
  do motor de medida, fora do enum público até a validação com caixas reais (T15) dizer se vira aviso
  de tela.
- **A7** — os dois índices novos usam `table.createdAt.desc()`/`table.id.desc()` (drizzle-orm),
  como `nfe_documents_company_updated_issued_id_idx` — nada de `sql\`... desc\`` cru.

### Migration e snapshot

Regenerados com `bun run db:generate` após cada rodada de ajuste do schema (nunca editados à mão);
pasta renomeada de `tmp`/`tmp2` para `20260916000000_nfe_package_box_measurement_source`, timestamp
posterior a `20260915233000_rate_limit_windows`. Cadeia de snapshot conferida via `prevIds` (aponta
para o `id` do snapshot de `rate_limit_windows`).

### Gates

Postgres nativo Homebrew 18 descartável no scratchpad da sessão (porta 65441 na rodada final — 65433,
65434 e 65440 evitadas por poderem estar em uso por outra sessão), subido e derrubado neste turno.

| Gate                                                                                              | Resultado                                                                                      |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run typecheck`                                                                               | verde                                                                                          |
| `bun run lint`                                                                                    | verde                                                                                          |
| `bun run format:check` (raiz)                                                                     | 1 `(fail)` pré-existente, não tocado por esta task: `docs/ai-context/frontend-transportada.md` |
| Contratos da API (`bun test`, sem `.env.test`)                                                    | 6006 pass, 0 fail                                                                              |
| Integração da API (`bun --env-file=../../.env.test test --timeout 120000`, Postgres nativo 65441) | 6028 pass, 1 `(fail)` pré-existente e não relacionado (ver abaixo)                             |
| `make migration-test` (via `db:test`, mesmo Postgres)                                             | 94 pass, 1 `(fail)` pré-existente e não relacionado (mesmo caso)                               |

**`(fail)` pré-existente**: `Drizzle migration integration > applies, constrains, rolls back, and
reapplies the fiscal migration` espera SQLSTATE `23503` e recebe `23001` em
`cte-profile-output-constraints.assertion.ts` — código de fiscal profile que esta task não toca.
Reproduzido também **antes** de qualquer mudança da T2 (primeira rodada de gates, ainda sem A1–A7),
com o mesmo Postgres 18 nativo — é o motor relatando `restrict_violation` onde a suíte foi escrita
esperando `foreign_key_violation` de outra versão de Postgres. Fora do escopo desta task.

### Correção pós-staging: ordem do rollback (CI run 35036660623, gate integration)

Data: 2026-09-16. O CI de staging pegou o que os gates locais não pegaram: `assertCteProfileOutputConstraints`
falha ali com o SQLSTATE esperado (`23503`), então a suíte segue até o laço que roda **todo**
`rollback.sql` em ordem reversa — e é só nesse ponto que meu `rollback.sql` original quebrava.
Localmente, o `(fail)` pré-existente acima acontece **antes** desse laço (Postgres 18 nativo relata
`23001`), então os gates da rodada anterior nunca chegaram a exercitar o rollback desta migration de
verdade — só a leitura, não a execução.

**Defeito**: `DROP TABLE "nfe_package_box_measurements"` vinha **depois** de
`ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_company_id_id_unique"` no
`rollback.sql`. A FK composta `nfe_package_box_measurements_company_package_box_fk` depende do
índice dessa UNIQUE, e o Postgres recusa derrubar um índice com dependente vivo:
`cannot drop constraint nfe_package_boxes_company_id_id_unique on table nfe_package_boxes because
other objects depend on it`.

**Correção**: `DROP TABLE "nfe_package_box_measurements"` movido para logo depois da guarda de dados
(início do rollback) e antes de qualquer `ALTER TABLE` em `nfe_package_boxes` — a tabela que carrega
a FK dependente sai primeiro, e só então a UNIQUE que ela apontava pode cair. Sem `CASCADE` em lugar
nenhum; a guarda de recusa com dados no topo e a remoção da linha do journal no fim continuam
intactas. Conferi o resto do arquivo por essa mesma classe de problema: os `DROP CONSTRAINT` dos
CHECKs de `nfe_package_boxes` continuam antes dos `DROP COLUMN` das colunas que eles referenciam (já
estava correto), e nenhuma outra constraint nova depende de índice de outra tabela.

**Prova local** (sem depender do `(fail)` pré-existente, que mascara o laço de rollback neste
Postgres): Postgres nativo Homebrew 18 descartável no scratchpad da sessão, porta 65442 (65433,
65434, 65440 e 65441 evitadas — já usadas nesta spec ou por outra sessão), subido e derrubado neste
turno.

1. `bun run db:migrate` até a ponta (`20260916000000_nfe_package_box_measurement_source` aplicada).
2. `psql -f rollback.sql` — **sem erro** (antes da correção, este passo reproduzia exatamente o erro
   do CI). Conferido que `nfe_package_box_measurements` some (`to_regclass` retorna vazio) e as
   colunas de `nfe_package_boxes` voltam a não ter `measurement_*`.
3. `bun run db:migrate` de novo — reaplica a migration com sucesso (`__drizzle_migrations` volta a
   ter `20260916000000_nfe_package_box_measurement_source` no topo).

| Gate                                                                                              | Resultado                                                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bun run typecheck` / `bun run lint`                                                              | verdes                                                                   |
| Contratos da API (`bun test`, sem `.env.test`)                                                    | 6006 pass, 0 fail                                                        |
| Integração da API (`bun --env-file=../../.env.test test --timeout 120000`, Postgres nativo 65442) | 6028 pass, 1 `(fail)` pré-existente e não relacionado (mesmo caso acima) |
| `db:test` (migration-test, mesmo Postgres)                                                        | 94 pass, 1 `(fail)` pré-existente e não relacionado (mesmo caso acima)   |
| Rollback manual via `psql` (ponta a ponta: migrate → rollback → migrate)                          | sem erro — reproduz e corrige o defeito exato do CI                      |

O `(fail)` pré-existente (`assertCteProfileOutputConstraints`, SQLSTATE `23001` vs `23503`) continua
fora do escopo desta correção — é o mesmo caso já registrado acima, e é ele que impede o Postgres 18
nativo de alcançar o laço de rollback pela suíte automatizada; a prova ponta a ponta acima supre essa
lacuna rodando o rollback diretamente.

## T3 — Rota de medida com origem, margem e histórico

Data: 2026-09-15. Modelo: `sonnet` (executor).

### Contrato antes da implementação

`test/nfe-package-box/measurement-source.contract.ts` (schema/refine, `resolveMeasurementMargin`,
`assertCameraMeasurementEnabled`, `createMeasurePackageBox`) e
`test/integration/measurement-history.integration.ts` (a transação grava a caixa e o histórico,
tenant 404, corpo antigo = `typed`, função desligada = 422) escritos antes de qualquer código de
produção, e falhavam por import ausente até a implementação existir.

### Desenho

- `domain/package-box-measurement.constant.ts`: cópia por valor de `PACKAGE_BOX_MEASUREMENT_SOURCES`
  e `PACKAGE_BOX_MEASUREMENT_WARNINGS` (o domínio não importa `database/nfe.schema.ts`, camada sem
  I/O) mais `MARGIN_RELIABLE_MM`/`MARGIN_UNRELIABLE_MM` (10/30, comentário "provisório até T15").
  Contrato de paridade compara as duas listas contra as da tabela.
- `domain/package-box-measurement.error.ts`: `PackageBoxCameraMeasurementDisabledError` (`ApiError`,
  422, `PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED`) — mesmo padrão de classe por domínio já usado em
  `mdfe-manifest.error.ts` etc., não a hierarquia genérica do CLAUDE.md global.
- `domain/package-box-measurement.policy.ts`: `resolveMeasurementMargin` (a maior das três margens
  informadas, `null` sem bloco `camera`) e `assertCameraMeasurementEnabled` (D14 — `source ≠ typed`
  com a função desligada lança o erro acima).
- `application/camera-measurement-settings.port.ts` + `infrastructure/drizzle-camera-measurement-settings.repository.ts`:
  porta e adaptador que leem `company_cargo_settings.camera_measurement_enabled` direto pelo schema
  partilhado (sem importar o repositório de `companies`, que é `settings.manage`). Fica pronta para a
  T4 reutilizar na rota `GET /nfe-package-boxes/measurement-settings`.
- `presentation/package-box.schema.ts`: corpo ganha `source` (`.default('typed')`, retrocompatível) e
  `camera?` (`.strict()`, mesmos tetos dos CHECKs — margem 0–3000, proposta com o teto da dimensão).
  `superRefine` cobre as três recusas de R5: `camera` só com `source ≠ typed`; margem acima de 10 mm
  sem `impreciseConfirmed` é 400; margem acima de 30 mm com `source: camera` é 400 (com
  `camera_adjusted` não, porque o operador editou por cima — D8).
- `application/measure-package-box.use-case.ts`: para `source ≠ typed`, lê o interruptor pela porta
  acima e lança `PackageBoxCameraMeasurementDisabledError` (422) se desligado — checagem em I/O, não
  só no schema. O ator (`measuredByUserId`) vem sempre de `context.userId` (o token, nunca do corpo).
- `infrastructure/drizzle-package-box.repository.ts`: `measure` passa a rodar numa transação —
  `UPDATE` em `nfe_package_boxes` (grava `measurement_source`/`measurement_margin_mm`) e, só se a
  linha existir (mesma empresa), `INSERT` append-only em `nfe_package_box_measurements` com as três
  medidas, margens, `warnings`, `impreciseConfirmed`, `engine`, `proposed_*_mm` e o ator. Caixa de
  outra empresa: `UPDATE` afeta zero linhas, a transação devolve `false` e **nada** entra no
  histórico (nem a caixa, nem a auditoria) — contrato de tenant. `list` passou a devolver
  `measurementSource`/`measurementMarginMm` (R5, `GET /nfe-package-boxes`).
- `main.ts`: composição nova (`DrizzleCameraMeasurementSettingsRepository`) injetada em
  `createMeasurePackageBox`, ao lado do repositório de caixas já existente.
- `package-box.port.ts`: `PackageBoxMeasurement` ganha `source`/`camera?`
  (`PackageBoxCameraMeasurement`), `PackageBoxView` ganha `measurementSource`/`measurementMarginMm`,
  e `measure()` do repositório ganha `measurementMarginMm`/`measuredByUserId`. Campos opcionais
  tipados `?: number | undefined` (não só `?: number`) para bater com `exactOptionalPropertyTypes` e
  com o que o Zod `.optional()` infere.

### O que ficou fora de propósito (não é T3)

- `GET /nfe-package-boxes/measurement-settings` e `PUT /company-settings/cargo/camera-measurement`
  (rota HTTP do interruptor e do painel) são T4 — a porta e o adaptador já existem, só falta a rota.
- `GET /nfe-package-box-measurements` (export para a validação) é T5.
- Nenhuma coluna nova em banco: a T2 já criou tudo (`measurement_source`, `measurement_margin_mm`,
  `nfe_package_box_measurements`, `company_cargo_settings.camera_measurement_enabled`).

### Gates

Postgres nativo Homebrew 18 descartável no scratchpad da sessão (`initdb` + `pg_ctl`), porta 65442
(65433/65434/65440/65441 evitadas — já usadas por esta ou outras sessões), subido e derrubado neste
turno. `LC_ALL=C` foi necessário para o `postmaster` não recusar o start com "became multithreaded
during startup" (falha conhecida do Postgres 18 do Homebrew nesta máquina).

| Gate                                                                                                                                   | Resultado                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                                                                                                                    | verde                                                                                                                                                |
| `bun run lint`                                                                                                                         | verde                                                                                                                                                |
| `bunx prettier --check` (arquivos tocados)                                                                                             | verde (2 arquivos formatados com `--write` antes da rodada final)                                                                                    |
| Contratos da API (`bun run test`, sem `.env.test`)                                                                                     | 6025 pass, 0 fail (era 6006 antes da T3 — +19 testes novos, nenhum quebrado)                                                                         |
| Integração da API (`bun --env-file=<env apontando para o Postgres 65442> test --timeout 120000`, de dentro de `apps/api-transportada`) | 6047 pass, 1 `(fail)` pré-existente e não relacionado (o mesmo `cte-profile-output-constraints`, SQLSTATE `23001` vs `23503`, registrado desde a T2) |
| `test/integration/measurement-history.integration.ts` isolado                                                                          | 4 pass, 0 fail                                                                                                                                       |
| `test/nfe-package-box.contract.test.ts` isolado (com `measurement-source.contract.ts` novo)                                            | 37 pass, 0 fail                                                                                                                                      |

⚠️ **Nota sobre o `.env.test`**: o Postgres do Docker (`localhost:65432`, apontado pelo `.env.test`
via link simbólico) não respondeu nesta sessão (`docker ps` também travou — mesmo sintoma da T1:
"docker info sem resposta"). Segui a instrução do usuário ("se precisar, suba um Postgres nativo
descartável") e rodei a integração com um arquivo de env no scratchpad, cópia do `.env.test` com
`DATABASE_URL`/`DRIZZLE_TEST_DATABASE_URL`/`API_TEST_DATABASE_URL` apontando para o Postgres nativo
65442 — mesma forma do `bun --env-file=... test --timeout 120000` de dentro de
`apps/api-transportada`, só a origem do Postgres muda. O `.env.test` do link simbólico **não foi
editado**.

### Arquivos novos

`domain/package-box-measurement.constant.ts`, `domain/package-box-measurement.error.ts`,
`domain/package-box-measurement.policy.ts`, `application/camera-measurement-settings.port.ts`,
`infrastructure/drizzle-camera-measurement-settings.repository.ts`,
`test/nfe-package-box/measurement-source.contract.ts`,
`test/integration/measurement-history.integration.ts` (adicionado ao `package.json` da API, `test` e
`test:integration`).

## T4 — Interruptor por empresa

Data: 2026-09-15. Modelo: `sonnet` (executor).

### Contrato antes da implementação

`test/company-settings/camera-measurement-flag.contract.ts` (API, `settings.manage` na rota do
painel, `GET /company-settings/cargo` retrocompatível ganhando `cameraMeasurementEnabled`, corpo
`.strict()` recusando campo desconhecido e valor fora de `boolean`, `cache-control: no-store`) e
`test/integration/camera-measurement-flag.integration.ts` (Postgres real: ausência de linha lida
como `false` pelas duas portas, ligar/desligar reflete de imediato na porta do conferente sem tocar
no peso padrão, e contrato de tenant — ligar numa empresa não vaza para outra) escritos antes do
código de produção; falhavam por import ausente (`setCameraMeasurementEnabled`,
`API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH`) até a implementação existir.
`test/nfe-workspace/camera-measurement-settings.contract.ts` (frontend, placement + presença do
painel/hook/cliente + rótulos acentuados + estado nunca só por cor) também escrito antes do
componente e do wiring na página.

### Desenho — API

- `companies/application/cargo-settings.port.ts`: `CargoSettings` ganha `cameraMeasurementEnabled:
boolean`; `CargoSettingsPort` ganha `setCameraMeasurementEnabled`.
- `companies/infrastructure/drizzle-cargo-settings.repository.ts`: `load` agora seleciona a coluna
  partilhada (`?? false`, mesmo padrão de "sem linha = desligado" da T2/T3);
  `setCameraMeasurementEnabled` faz upsert como `saveDefaultVolumeWeight` já faz, sem tocar em
  `defaultVolumeWeight` — confirmado no teste de integração ("ligar reflete... sem tocar no peso
  padrão").
- `companies/application/cargo-settings.use-case.ts`: `createSetCameraMeasurementEnabledUseCase`
  grava e devolve a leitura atualizada (mesmo formato de `createSetDefaultVolumeWeightUseCase`).
- `companies/presentation/cargo-settings.schema.ts`: `parseSetCameraMeasurementEnabledBody` —
  `{ enabled: boolean }`, `.strict()`.
- `companies/presentation/cargo-settings.routes.ts`: nova rota `PUT
/company-settings/cargo/camera-measurement` (`settings.manage`, como o resto do módulo).
- `shared/api.constant.ts`: `API_COMPANY_SETTINGS_CARGO_CAMERA_MEASUREMENT_PATH`.
- `nfe-documents/presentation/package-box.routes.ts`: nova rota `GET
/nfe-package-boxes/measurement-settings` (`cargo.measure`, **não** `settings.manage` — é o
  conferente quem decide se a etapa Medida existe), lendo pela `CameraMeasurementSettingsPort` que a
  T3 já deixou pronta. Resposta `{ data: { cameraMeasurementEnabled } }`.
- `main.ts`: composição — `createSetCameraMeasurementEnabledUseCase` na rota de cargo,
  `cameraMeasurementSettingsRepository` (já existente, criado na T3) passado também para
  `createPackageBoxRoutes`.
- `test/nfe-package-box/routes.contract.ts` (existente, T3): atualizado para a lista de três rotas
  e a asserção genérica de política — a nova rota também exige `cargo.measure`.

### Desenho — Frontend

- `company-settings/shared/cargoSettings.validation.ts`: `CargoSettings` e o guard ganham
  `cameraMeasurementEnabled: boolean`.
- `company-settings/shared/companySettingsClient.service.ts`: `setCameraMeasurementEnabled` (PUT
  `/company-settings/cargo/camera-measurement`, mesmo formato de `setDefaultVolumeWeight`).
- `company-settings/shared/companySettingsTabs.service.ts`: `SETTINGS_PANELS` ganha
  `cameraMeasurement`; `SettingsDataSource` ganha `cameraMeasurementSettings`;
  `SETTINGS_PANEL_PLACEMENT.cameraMeasurement = { module: 'nfe-workspace', source:
'cameraMeasurementSettings', tab: 'boxes' }` — a aba `boxes` é a mesma que já hospeda
  `PackageBoxMeasurementPanel` (rotulada "Caixas" no `t('tabs.packageBoxes')` existente);
  `resolveSettingsDataScope` ganha a chave nova.
- `nfe-workspace/hooks/useCargoSettings.hook.ts`: ganhou `cameraMeasurementMutation` — reaproveita a
  mesma consulta `GET /company-settings/cargo` que já alimenta o peso padrão (ambos os painéis moram
  na mesma leitura; só a aba muda). `enabled` da consulta na página passou a ser `canManageSettings
&& (settingsScope.cargoSettings || settingsScope.cameraMeasurementSettings)` para cobrir as duas
  abas que a alimentam.
- `nfe-workspace/components/CameraMeasurementSettingsPanel.component.tsx`: painel novo, no molde do
  `ScheduledDistributionPanel` (mesmo `styles/distributionSettings.module.css`, `Icon` do design
  system, botão com classe de token — nada de `<Button>` cru nem valor literal). Estado
  ligado/desligado é dito em texto (`cameraMeasurementOn`/`cameraMeasurementOff`), nunca só pela cor
  do parágrafo.
- `nfe-workspace/pages/NfeWorkspace.page.tsx`: painel renderizado na aba `boxes`, só quando
  `canManageSettings`, ao lado (acima) do `PackageBoxMeasurementPanel`.
- Chaves novas em `nfeWorkspace.locale.json` / `nfeWorkspace.en.locale.json` (pt-BR acentuado):
  `cameraMeasurementTitle/Hint/Experimental/On/Off/Enable/Disable/ToggleError`.
- `test/nfe-workspace/distribution-settings.contract.ts` (existente): `settingsTabsOf('nfe-workspace')`
  passou de `['imports']` para `['imports', 'boxes']` — a única mudança necessária ali, o resto do
  contrato genérico (`tabs.contract.ts`) validou o painel novo sem edição.

### O que ficou fora de propósito (não é T4)

- O selo "Experimental" completo (D13), o formulário com proposta/margem/aviso e o fluxo de câmera
  do conferente (`useCameraMeasurementSettings.hook.ts` do lado da leitura, D14) são T9–T11: T4
  entrega só a rota de leitura (`GET .../measurement-settings`) que eles vão consumir.
- Export CSV e resumo da validação no painel (D16) são T5/T12.
- Nenhuma migration nova: a T2 já criou `company_cargo_settings.camera_measurement_enabled`.

### Gates

Postgres nativo Homebrew 18 descartável no scratchpad da sessão (`initdb -U postgres -A trust` +
`pg_ctl`), porta **65450** (65432–65434/65440–65442 evitadas — a 65442 já usada pela T3).
`LC_ALL=C` necessário de novo para o `postmaster` não recusar o start com "became multithreaded
during startup" (mesma falha conhecida do Postgres 18 do Homebrew nesta máquina, já registrada na
T3). Subido e derrubado neste turno.

| Gate                                                                                                                                | Resultado                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck` (raiz, as 6 apps)                                                                                               | verde                                                                                                                                                                                                                                                                                                                  |
| `bun run lint` (raiz, as 6 apps)                                                                                                    | verde                                                                                                                                                                                                                                                                                                                  |
| `bunx prettier --check` (arquivos tocados)                                                                                          | verde (2 arquivos formatados com `--write` antes da rodada final)                                                                                                                                                                                                                                                      |
| Contratos da API (`bun run --cwd apps/api-transportada test`, sem `.env.test`)                                                      | 6030 pass, 0 fail (`test/deploy.contract.test.ts` deu 1 `(fail)` de timeout numa rodada isolada — passou sozinho e nas rodadas seguintes; flake pré-existente, não relacionado)                                                                                                                                        |
| Integração da API (`bun --env-file=<env no scratchpad, Postgres 65450> run test:integration`, de dentro de `apps/api-transportada`) | 354 pass, 4 skip, **2 `(fail)`** pré-existentes em `test/integration/cte-archive-gateway.integration.ts` (timeout de 5 s por falta de MinIO/S3 nesta sessão — só subi Postgres, não a stack Docker inteira; não é o mesmo `cte-profile-output-constraints`/SQLSTATE que a T3 registrou, e não relacionado a esta task) |
| `test/integration/camera-measurement-flag.integration.ts` isolado                                                                   | 4 pass, 0 fail                                                                                                                                                                                                                                                                                                         |
| `test/integration/measurement-history.integration.ts` isolado (regressão da T3)                                                     | 4 pass, 0 fail                                                                                                                                                                                                                                                                                                         |
| `test/company-settings.contract.test.ts` + `test/nfe-package-box.contract.test.ts` (API) isolados                                   | 42 pass, 0 fail                                                                                                                                                                                                                                                                                                        |
| Testes do frontend (`bun run --cwd apps/frontend-transportada test`)                                                                | 3861 pass, 0 fail                                                                                                                                                                                                                                                                                                      |
| `bun run --cwd apps/frontend-transportada build`                                                                                    | verde (chunks grandes são aviso pré-existente do Vite, não relacionado)                                                                                                                                                                                                                                                |

⚠️ **Nota sobre o `.env.test`**: como na T3, o Postgres do Docker não estava disponível nesta sessão
(worktree isolado, sem `make up` rodado). Segui a mesma instrução — Postgres nativo descartável no
scratchpad, arquivo de env próprio (cópia do `.env.test` com `DATABASE_URL` apontando para
`127.0.0.1:65450`), rodado com `bun --env-file=... run test:integration` de dentro de
`apps/api-transportada`. O `.env.test` do link simbólico **não foi editado**.

### Arquivos novos

`test/company-settings/camera-measurement-flag.contract.ts`,
`test/company-settings.contract.test.ts` (entrypoint, primeiro da API para este diretório),
`test/integration/camera-measurement-flag.integration.ts` (adicionados ao `package.json` da API,
`test` e `test:integration`),
`nfe-workspace/components/CameraMeasurementSettingsPanel.component.tsx`,
`test/nfe-workspace/camera-measurement-settings.contract.ts` (adicionado ao entrypoint
`test/nfe-workspace.contract.test.ts` do frontend).

## T5 — Export do histórico para a validação

Data: 2026-09-15. Modelo: `sonnet` (executor).

### Contrato antes da implementação

`test/nfe-package-box/measurement-export-schema.contract.ts` (parsing de `from`/`to`/`cursor`/
`limit`, cursor malformado e período fora do ISO 8601 em `400`, parâmetro desconhecido em `400`,
teto de `limit` em 100, e a rota publicada com a permissão) e
`test/integration/package-box-measurement-export.integration.ts` (período, cursor, isolamento de
tenant, ator resolvido pela membership) escritos antes de qualquer código de produção — falhavam por
import ausente até a implementação existir.

### Desenho

- `application/package-box-measurement-export.port.ts`: `PackageBoxMeasurementExportEntry` (origem,
  as três medidas gravadas, a proposta da câmera, as margens por dimensão, `warnings`,
  `impreciseConfirmed`, `engine`, `createdAt`, `productCode`/`cartonGtin` da caixa — nunca a
  descrição do produto nem o CNPJ do emitente) e `PackageBoxMeasurementActor` — mesma forma de
  `NfeDocumentEventActor` (spec 149 D16/H13): `{ id, name }` quando a membership resolve o nome,
  `{ removed: true }` (sem id, sem nome) quando `measured_by_user_id` (sem FK, decisão do architect
  na T2) não casa mais nenhuma membership ativa na empresa. A coluna é `not null`, então nunca `null`
  aqui — diferente do ator de `nfe-document-event`, que pode não ter ninguém gravado.
- `application/list-package-box-measurements.use-case.ts`: camada fina, mesmo molde de
  `createListNfeDocumentEvents` — o `join` com a caixa e a resolução do ator ficam no repositório.
- `infrastructure/drizzle-package-box-measurement-export.repository.ts`: `inner join` com
  `nfe_package_boxes` (empresa + id) para `productCode`/`cartonGtin`, `left join` com
  `user_company_memberships` (status `active`, mesma empresa) + `identity_user_profiles` para o
  ator, filtro `from`/`to` sobre `created_at` (`gte`/`lte`), cursor keyset por `(created_at, id)` com
  o par `decodeKeysetCursor`/`encodeKeysetCursor` de `shared/keyset-cursor.support.ts` — reaproveitado
  em vez de reescrito, já usado por `mdfe-manifests`. Ordenação e página seguem o índice da T2,
  `nfe_package_box_measurements_company_created_idx (company_id, created_at desc, id desc)`, criado
  para exatamente este uso.
- `presentation/package-box-measurement-export.schema.ts`: `readListQuery` + `readPaging`
  (`http/request-parsing.service.ts`, o mesmo helper genérico de `mdfe-manifest.schema.ts` e outros
  seis módulos) resolve `cursor`/`limit` (teto 100, `400` em cursor malformado ou parâmetro
  desconhecido) — decisão de reaproveitar o helper compartilhado em vez do decode de microssegundos
  específico de `nfe-document-events.schema.ts` (que existe só para o `UNION` de dois ramos de alta
  frequência daquele endpoint; aqui a medida é um evento manual, um por vez, sem esse risco de
  colisão). `from`/`to` validados com `z.iso.datetime()` (mesmo padrão de
  `nfe-imports.schema.ts`/`freight.schema.ts`), ambos opcionais.
- `presentation/package-box-measurement-export.routes.ts`: `GET /nfe-package-box-measurements`,
  `settings.manage` (não `cargo.measure` — decisão do `plan.md`: exportar o histórico inteiro da
  empresa para validar precisão é administração de configuração, não conferência de caixa no
  galpão). Resposta `{ data: [...], page: { nextCursor } }`, mesmo formato de
  `GET /nfe-documents/:id/events`.
- `main.ts`: composição nova (`DrizzlePackageBoxMeasurementExportRepository`,
  `createListPackageBoxMeasurements`, `createPackageBoxMeasurementExportRoutes`) ao lado do
  restante do módulo `nfe-documents`.
- Nenhuma rota de OpenAPI foi adicionada — como a T3 já registrou, este repositório não tem
  geração de OpenAPI nenhuma (busca por `openapi` no código-fonte não encontra nada); o texto do
  `spec.md`/`tasks.md` sobre "documento OpenAPI" não corresponde a um mecanismo existente nesta
  base, e a T3 já havia deixado o mesmo ponto fora de escopo pela mesma razão.
- Nenhuma migration nova: a T2 já criou `nfe_package_box_measurements` e o índice
  `..._company_created_idx` usado aqui.

### O que ficou fora de propósito (não é T5)

- O CSV e o resumo da validação no painel (`cameraMeasurementValidation.service.ts`) são T12 —
  consomem esta rota, não fazem parte dela.
- Nenhuma mudança em `package-box.routes.ts`/`CARGO_MEASURE_POLICY` — o export é rota nova, separada.

### Gates

Postgres nativo Homebrew 18 descartável no scratchpad da sessão (`initdb --encoding=UTF8
--locale=en_US.UTF-8 -U postgres --auth=trust` + `pg_ctl`), porta **65443** (65432–65434/65440–65442/
65450 evitadas — já usadas por esta ou outras sessões). `LC_ALL=C` necessário de novo para o
`postmaster` não recusar o start com "became multithreaded during startup" (mesma falha conhecida do
Postgres 18 do Homebrew nesta máquina, já registrada na T3/T4). Subido e derrubado neste turno.

| Gate                                                                                                                                                                        | Resultado                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck` (raiz, as 6 apps)                                                                                                                                       | verde                                                                                                                                                                                                               |
| `bun run lint` (raiz, as 6 apps)                                                                                                                                            | verde                                                                                                                                                                                                               |
| `bunx prettier --check` (arquivos tocados)                                                                                                                                  | verde (1 arquivo formatado com `--write` antes da rodada final)                                                                                                                                                     |
| Contratos da API (`bun run --cwd apps/api-transportada test`, sem `.env.test`)                                                                                              | 6037 pass, 0 fail (era 6025 antes da T5 — +12 testes novos, nenhum quebrado)                                                                                                                                        |
| Integração da API (`bun --env-file=<env no scratchpad, Postgres 65443> run test:integration`, de dentro de `apps/api-transportada`)                                         | 356 pass, 4 skip, **2 `(fail)`** pré-existentes em `test/integration/cte-archive-gateway.integration.ts` (sem MinIO nesta sessão — só subi Postgres — mesma falha já registrada na T4, não relacionada a esta task) |
| `test/integration/package-box-measurement-export.integration.ts` isolado                                                                                                    | 2 pass, 0 fail                                                                                                                                                                                                      |
| `test/integration/package-box-measurement-export.integration.ts` + `measurement-history.integration.ts` + `camera-measurement-flag.integration.ts` juntos (regressão T3/T4) | 10 pass, 0 fail                                                                                                                                                                                                     |
| `test/nfe-package-box.contract.test.ts` isolado (com `measurement-export-schema.contract.ts` novo)                                                                          | 44 pass, 0 fail                                                                                                                                                                                                     |

⚠️ **`cte-profile-output-constraints`** (SQLSTATE `23001` vs `23503`, registrada desde a T2) **não
apareceu** nesta rodada — só os dois `(fail)` de `cte-archive-gateway` (falta de MinIO) se repetiram,
mesmo padrão da T4.

⚠️ **Nota sobre o `.env.test`**: como na T3/T4, o Postgres do Docker não respondeu nesta sessão. Segui
a mesma instrução — Postgres nativo descartável no scratchpad, arquivo de env próprio (cópia do
`.env.test` com só `DATABASE_URL` reapontado para `127.0.0.1:65443`), rodado com
`bun --env-file=... run test:integration` de dentro de `apps/api-transportada`. O `.env.test` do link
simbólico **não foi editado**.

### Arquivos novos

`application/package-box-measurement-export.port.ts`,
`application/list-package-box-measurements.use-case.ts`,
`infrastructure/drizzle-package-box-measurement-export.repository.ts`,
`presentation/package-box-measurement-export.schema.ts`,
`presentation/package-box-measurement-export.routes.ts`,
`test/nfe-package-box/measurement-export-schema.contract.ts` (adicionado ao entrypoint
`test/nfe-package-box.contract.test.ts`),
`test/integration/package-box-measurement-export.integration.ts` (adicionado ao `package.json` da
API, `test:integration`).

## T6 — Motor puro de medida, portado do spike

Contrato vermelho antes: `bun test ./test/nfe-workspace/box-dimension.contract.ts` com os módulos
ainda inexistentes → `0 pass, 1 fail, 1 error`
(`Cannot find module '@/components/ui/boxDimension.constant'`). Só depois a implementação.

### Onde o motor ficou

Tudo em `apps/frontend-transportada/src/components/ui/` (o CLAUDE.md da app proíbe implementação
própria de câmera fora do design system), **sem I/O, sem DOM, sem OpenCV**:

| Arquivo                           | O que é                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `boxDimension.constant.ts`        | todas as constantes nomeadas: marcador, limites de precisão, parâmetros de incerteza, semente, limites do indicador, motivos |
| `boxDimensionGeometry.service.ts` | homografia DLT, focal por Zhang, pose, projeção, ângulo de visão, altura pela aresta vertical                                |
| `boxDimension.service.ts`         | `measureBox`, `estimateMarkerView`, `createSeededRandom`, `estimateMargins`, `classifyMargin`, `classifyMeasurement`         |
| `boxDimensionWarnings.service.ts` | `detectWarnings` (D9) e `selectDomainWarnings`                                                                               |

O motor **não decide gravar nada**: devolve medida (`BoxMeasurementResult`), margem (`BoxMargins`) e
motivos (`BoxDimensionWarning[]`). Quem grava é a T10/T11.

Teste: `test/nfe-workspace/box-dimension.contract.ts`, importado por
`test/nfe-workspace.contract.test.ts` — entrypoint **já listado** no `test` do `package.json` da app,
então nenhuma linha do `package.json` mudou (o arquivo novo roda porque entrou no entrypoint certo).

### Como a margem é calculada

`m = 2σ + piso de impressão`, por dimensão (D7):

- σ sai de um Monte Carlo de `MONTE_CARLO_SAMPLES = 400` perturbações. Cada amostra sacode os quatro
  cantos do marcador por `σ_canto = hypot(CORNER_SIGMA_FLOOR_PX 0,3 px, erro de reprojeção)` e os
  cinco pontos tocados por `TOUCH_SIGMA_PX = 1,5 px`, e remede a caixa inteira;
- quando a focal veio do FOV padrão (`focalSource: 'defaultFov'`), a amostra também sacode a focal
  por `FALLBACK_FOCAL_RELATIVE_SIGMA = 10%` — a incerteza da focal entra na margem em vez de sumir;
- amostra degenerada (sistema singular) é descartada da estatística, nunca vira número plausível;
- piso: `printFloorMm(d) = PRINT_FLOOR_MM 2 mm + PRINT_SCALE_TOLERANCE 0,2% × d`.

**Determinismo:** `MONTE_CARLO_SEED = 150` é a semente padrão e o gerador é Mulberry32 criado a cada
chamada — mesma entrada, mesma margem. Provado por dois testes: com semente injetada igual
(`createSeededRandom(7)` duas vezes → `toEqual`) e **sem semente nenhuma** (duas chamadas de
`estimateMargins(input, nominal)` → `toEqual`), mais o negativo (sementes 7 e 8 → `not.toEqual`),
que impede um "determinismo" trivial por margem constante.

### Faixas de D15 e motivos de D9

`MARGIN_RELIABLE_MM = 10` e `MARGIN_UNRELIABLE_MM = 30`, com o comentário "provisório até a
validação da spec 152 (T15): apertar pode, afrouxar volta ao usuário" — **nenhum limite foi
afrouxado**. `classifyMargin` dá as fronteiras (10 → `reliable`, 10,01 → `imprecise`, 30 →
`imprecise`, 30,01 → `unreliable`) e `classifyMeasurement` aplica D6 por dimensão: `filled` fica
`false` só na dimensão acima de 30 mm (o campo fica para digitar) e `requiresConfirmation` é `true`
quando alguma dimensão está na faixa 10–30 mm. Uma dimensão `unreliable` sozinha **não** vira pedido
de confirmação — ela simplesmente não preenche (teste próprio).

Os motivos são cópia por valor do CHECK `nfe_package_box_measurements_warnings_domain_check`:
`markerNotFound`, `markerTooSmall`, `steepAngle`, `lowLight`, `blurry`, `boxOutOfFrame`, `unstable`,
com contrato que compara a lista inteira e um teste que exercita o motor até produzir **cada um** dos
sete. `markerAtEdge` fica em `BOX_DIMENSION_INTERNAL_WARNINGS` — útil ao indicador ao vivo, fora do
enum da API por decisão da T6 — e `selectDomainWarnings` é o filtro que entrega só o gravável.

### O que mudou em relação ao spike

- as constantes saíram de dentro de `measurement.ts`/`warnings.ts` e viraram `boxDimension.constant.ts`
  (nenhum valor mudou de número);
- `WARNING_TEXT` **não foi portado**: texto é da tela (prop/locale), não do motor — o motor devolve
  código;
- `markerAtEdge` deixou de ser um motivo qualquer e virou código explicitamente interno, separado do
  domínio gravável;
- `classifyMeasurement` é novo (o spike só tinha `classifyMargin` por número solto) e é quem carrega
  a regra de D6 por dimensão;
- a semente do Monte Carlo (150) e os ângulos da faixa física de FOV (40°/100°) eram literais soltos
  no spike e agora são `MONTE_CARLO_SEED`, `MIN_PLAUSIBLE_FOV_DEGREES`, `MAX_PLAUSIBLE_FOV_DEGREES`;
  o mesmo para os epsilons de sistema singular e o `4` de cantos do marcador (`MARKER_CORNER_COUNT`);
- `estimateMarkerView` não usa mais o cast `{ imageWidth } as MeasurementInput` do spike —
  `resolveFocal` passou a receber os três valores de que precisa;
- geometria separada do cálculo da medida (o arquivo único do spike passaria de 200 linhas);
- `session.ts`/`marking.ts` **não** foram portados: são T12 e T8.

### Gates

| Gate                                                              | Resultado                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bun test ./test/nfe-workspace/box-dimension.contract.ts` (antes) | 0 pass, **1 `(fail)`** — vermelho obrigatório                                 |
| `bun test ./test/nfe-workspace/box-dimension.contract.ts`         | **39 pass, 0 `(fail)`**, 130 `expect()`                                       |
| `bun run typecheck` (raiz, as 6 apps)                             | verde                                                                         |
| `bun run lint` (raiz, as 6 apps)                                  | verde                                                                         |
| `bun run --cwd apps/frontend-transportada test`                   | **3900 pass, 0 `(fail)`**, 35243 `expect()` (era 3861 — +39, nenhum quebrado) |
| `bun run --cwd apps/frontend-transportada build`                  | verde (`built in 4.95s`, PWA 131 entradas de precache)                        |
| `bunx prettier --check` (6 arquivos tocados)                      | verde (1 arquivo formatado com `--write` antes da rodada final)               |
| `locale-accents.contract.ts` (contrato de acentos)                | verde dentro da suíte — nenhum `*.locale.json` foi tocado nesta task          |

Contagem de `(fail)` na task: **1** (o vermelho do contrato, antes da implementação) e **0** depois.

### Arquivos novos

`src/components/ui/boxDimension.constant.ts`, `src/components/ui/boxDimension.service.ts`,
`src/components/ui/boxDimensionGeometry.service.ts`,
`src/components/ui/boxDimensionWarnings.service.ts`,
`test/nfe-workspace/box-dimension.contract.ts` (importado por `test/nfe-workspace.contract.test.ts`).

### Pontos para o usuário

- O `tasks.md` manda o contrato em `test/nfe-workspace/box-dimension.contract.ts` e o `plan.md`
  coloca o motor em `src/components/ui/` (design system). Segui os dois como escritos: teste em
  `nfe-workspace`, código em `components/ui`. Se preferir o contrato junto do código
  (`test/design-system/`), é uma renomeação de um arquivo.
- A T8 é quem vai alimentar `FrameStats` a partir do quadro do OpenCV; o motor já está fechado em
  números puros e não precisa mudar para isso.

## T7 — `useCameraStream` e leitor com stream injetado (D19)

Base: `8b1f42c4` (T0–T6 publicadas em `staging`).

### Posse do stream

```
useCameraStream({ isActive })                    ← único dono do getUserMedia
  status: idle · starting · ready · denied · unavailable
  stream: MediaStreamLike | undefined            ← entregue pronto para os filhos

useBarcodeScanner({ isActive, onRead, stream? }) ← "stream" ausente = comportamento de hoje
  ownsStream = stream === undefined
    true  → abre e fecha a própria câmera (openCameraStream/stopCameraStream), como sempre
    false → só anexa o stream do pai ao <video> (attachStream), nunca chama getUserMedia
            nem stopCameraStream — quem abriu decide quando fechar
```

`useCameraStream.hook.ts` (novo, `src/components/ui/`) foi extraído do laço que já existia dentro
de `useBarcodeScanner`: mesma chamada a `openCameraStream(globalThis.navigator)`, mesmo
`stopCameraStream` no cleanup e no ramo cancelado durante a abertura, reaproveitando os tipos e
funções de `barcodeScanner.service.ts` sem duplicar nada. Efeito com deps `[isActive]`: abre uma vez
por ativação, não a cada renderização.

`useBarcodeScanner.hook.ts` ganhou o parâmetro opcional `stream` e a variável `ownsStream`. A função
`start()` virou uma bifurcação: dono do stream segue o caminho de sempre (abrir, guardar em
`openedStream`, anexar ao vídeo); com `stream` de fora, pula direto para `attachStream(stream)` —
sem tocar em `openCameraStream`. O cleanup só chama `stopCameraStream(openedStream)` quando
`ownsStream` é verdadeiro; o stream do pai sobrevive ao desmonte/mudança de etapa do hook. A
detecção (native `BarcodeDetector` ou worker ZXing), o cooldown de 1,5s e o `videoRef` continuam
idênticos — só a origem do `MediaStream` mudou.

### Sem regressão no leitor atual

Nenhuma asserção de `test/design-system/barcode-scanner.contract.ts` mudou — o arquivo não foi
tocado. Os pontos que blindam o comportamento em produção continuam cobertos por ele sem alteração:
tela cheia com moldura e faixa (`corner`/`guideBand`), feedback achou/não achou com vibração
(`FOUND_VIBRATION_MS`), `Esc`/foco (`useModalDialog`), ordem dos formatos (lineares antes do QR),
`isCancelled = true` uma única vez (o laço não corta no primeiro acerto), e `stopCameraStream`/
`terminate()` no desmonte. Como nenhum consumidor hoje passa `stream` (nem `barcode-scanner.tsx`,
nem a pistola de bip pelo Enter, nem `openMeasurementForScannedBox`), `ownsStream` é sempre
`true` em produção agora — a mudança fica latente até T9–T11 ligarem `useCameraStream` na tela.

### Vermelho antes da implementação

`useCameraStream.hook.ts` não existia (o `Bun.file` do contrato lançaria `ENOENT`) e
`useBarcodeScanner.hook.ts` não tinha `ownsStream` nem `stream?:` — conferido contra a base
`8b1f42c4`:

```
$ git show 8b1f42c4:apps/frontend-transportada/src/components/ui/useBarcodeScanner.hook.ts \
    | grep -c "ownsStream\|stream?:"
0
```

Ou seja, todas as asserções novas de `test/design-system/camera-stream.contract.ts` reprovariam
contra o código anterior — o vermelho é estrutural (arquivo ausente) mais as strings ausentes no
hook, sem precisar reverter e rerodar depois da implementação.

### Gates

| Gate                                             | Resultado                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                  | verde (`Checked 747 installs`)                                                                              |
| `bun run typecheck` (raiz, as 6 apps)            | verde                                                                                                       |
| `bun run lint` (raiz, as 6 apps)                 | 1 erro (`no-unnecessary-type-assertion` em `attachStream`), corrigido; verde na segunda rodada              |
| `bun run --cwd apps/frontend-transportada test`  | **3908 pass, 0 `(fail)`**, 35257 `expect()` (era 3900 — +8 do `camera-stream.contract.ts`, nenhum quebrado) |
| `bun test test/design-system.contract.test.ts`   | 334 pass, 0 fail                                                                                            |
| `bun run --cwd apps/frontend-transportada build` | verde (`built in 4.87s`, PWA 131 entradas de precache)                                                      |
| `bunx prettier --check` (4 arquivos tocados)     | verde                                                                                                       |
| `locale-accents.contract.ts`                     | verde dentro da suíte completa — nenhum `*.locale.json` tocado nesta task                                   |

Contagem de `(fail)` na task: **0** (vermelho foi por ausência de arquivo/string, não por teste
rodando e falhando — ver seção acima).

### Arquivos

Novos: `src/components/ui/useCameraStream.hook.ts`,
`test/design-system/camera-stream.contract.ts` (importado por `test/design-system.contract.test.ts`,
já listado no `package.json`).
Modificados: `src/components/ui/useBarcodeScanner.hook.ts` (parâmetro `stream` opcional),
`test/design-system.contract.test.ts` (import do contrato novo).

### Pontos para o usuário

- `useCameraStream` fica pronto, mas **nada o consome ainda** — `barcode-scanner.tsx` e o painel de
  fila continuam chamando `useBarcodeScanner` sem `stream`, então o comportamento em produção não
  muda nesta task. A ligação de fato (etiqueta → medida na mesma sessão de câmera) é da Fase 4
  (T9–T11), que monta `PackageBoxCameraFlow` sobre `useCameraStream` conforme o `plan.md`.
- O `plan.md` também atribui a `useCameraStream` a lanterna (`getCapabilities().torch`), mas nenhuma
  aceite da T7 no `tasks.md` cobra isso e não há consumidor da lanterna ainda (só entra em T8/T11,
  no primitivo de medida). Deixei de fora para não introduzir código sem teste que o exercite;
  entra com o primeiro consumidor real, sem precisar tocar em `useCameraStream` de novo.

## T8 — Primitivo `box-dimension-scanner`, worker e carga (D18)

Data: 2026-09-15. Modelo: `sonnet`.

### O que entrou

- `src/components/ui/boxDimension.worker.ts`: só ele importa o OpenCV
  (`import('../../../vendor/opencv/opencv.js')`, literal e dinâmico). Detecta o marcador
  (`cv.aruco_ArucoDetector`, `DICT_4X4_50`) e calcula as estatísticas do quadro
  (`cvtColor`/`meanStdDev`/`Laplacian`, todas na whitelist do build próprio) — pose e margem
  continuam fora, no motor puro da T6. Expõe `preload`/`frame` por `postMessage`, sem estado além
  da instância de `cv` cacheada.
- `src/components/ui/opencv.types.ts`: tipo mínimo do build próprio (sem `.d.ts` oficial) — só o
  que o worker usa.
- `src/components/ui/useBoxDimensionScanner.hook.ts`: cria o worker por
  `new Worker(new URL('./boxDimension.worker.ts', import.meta.url), { type: 'module' })`, nunca
  `blob:`. Preload com teto de 15s (`ENGINE_LOAD_TIMEOUT_MS`), laço de captura a cada 250ms (como
  `useBarcodeScanner`), 3 quadros seguidos acima de 800ms derruba para `tooSlow`, e
  `typeof WebAssembly === 'undefined'` barra antes de criar o worker (`noWasm`). "Capturar" congela
  um retrato próprio (`canvas.toDataURL`, nunca o `<video>` pausado) que alimenta a tela e a lupa;
  "Usar esta medida" chama `measureBox`/`estimateMargins`/`classifyMeasurement`/`detectWarnings` da
  T6 e devolve o resultado por `onMeasured`. Video e worker são encerrados em todo caminho de saída
  (`stopCameraStream` não se aplica aqui — o stream é sempre injetado; `video.srcObject = null` e
  `worker.terminate()` cobrem o desmonte).
- `src/components/ui/boxDimensionMarking.service.ts`: aritmética pura (porta do `marking.ts` do
  spike) — `clampPointToBounds`, `nudgePoint` (1px, 8px com Shift) e `magnifierViewportFor`.
- `src/components/ui/box-dimension-scanner.tsx` + `.module.css`: o primitivo — vídeo, `Skeleton`
  durante a carga, indicador ao vivo (`aria-live="polite"`), "Capturar", 5 pontos arrastáveis
  (A/B/C/D da face + o pé da aresta vertical — `measureBox` pede os 5; o `plan.md` fala em "4
  pontos", ver "Pontos para o usuário" abaixo) com lupa, "Usar esta medida".
- `docs/frontend/box-dimension-scanner.md` + linha nova na tabela do
  `apps/frontend-transportada/CLAUDE.md`.
- `test/design-system/box-dimension-scanner.contract.ts` (12 testes, importado por
  `test/design-system.contract.test.ts`).

### Pendências da T1 (architect), resolvidas nesta task

- **`worker: { format: 'es' }`** em `vite.config.ts` — sem isso o Vite empacota o worker em IIFE, e
  o `import()` dinâmico do OpenCV não funciona.
- **Chunk fora do precache + `CacheFirst` próprio**: `globIgnores: ['**/background-removal/**',
OPENCV_CHUNK_GLOB]` e uma regra `runtimeCaching` com `handler: 'CacheFirst'`,
  `cacheName: 'transportada-opencv'`, `maxEntries: 2`.
- **Chunk comprimido**: `openCvCompressionPlugin` (novo, `vite.config.ts`) grava `.gz` (nível 9) e
  `.br` (qualidade máxima) ao lado do chunk no `generateBundle`. `server.ts` ganhou
  `precompressedResponse`: escolhe Brotli, cai para gzip, serve o arquivo cru se nenhum dos dois
  existir ou o cliente não anunciar `Accept-Encoding` — nunca lança, nunca 404 por falta de
  compressão.
- **Fallback**: `noWasm` (sem criar worker) → `engineFailed` (15s sem `ready`, ou erro) →
  `tooSlow` (3 quadros seguidos > 800ms) → `onUnsupported`, e quem monta a etapa decide o
  formulário digitado (T9–T11); o primitivo nunca grava nada sozinho.
- **`test/shared/opencv-build.contract.ts`**: as duas asserções pendentes viraram positivas —
  `'só o worker de medida importa o OpenCV'` agora é `toEqual` com a lista exata (não subconjunto),
  e `'fica fora de public/, portanto fora do precache'` virou `'fica fora de public/ e fora do
precache; o chunk ganha CacheFirst próprio (T8)'`, checando `globIgnores`/`CacheFirst` no
  `vite.config.ts` em vez de `not.toContain('vendor/opencv')`.

### O import do OpenCV: literal, não `/* @vite-ignore */`

A primeira versão usava uma constante de caminho com `/* @vite-ignore */`, copiando o padrão do
worker do MapLibre visto no `vite.config.ts`. Build de verificação (import temporário do primitivo
a partir de `main.tsx`, revertido depois) mostrou que isso **não separa chunk nenhum**: o Vite não
analisa uma string dinâmica, e o `import()` sobra como caminho relativo cru resolvido em runtime a
partir do chunk do worker em `dist/assets/` — que não tem `vendor/opencv/` três níveis acima.
Trocado para `import('../../../vendor/opencv/opencv.js')` literal (dinâmico continua, só o
especificador é fixo): o Vite acha o módulo em build, separa o chunk e o worker some do IIFE.
Segunda rodada da mesma verificação:

```
dist/assets/opencv-AunnWb8E.js      3.053.658 B  (ADR-0065: 3.053.658 B — igual)
dist/assets/opencv-AunnWb8E.js.gz     891.131 B  (ADR-0065: ~891.150 B)
dist/assets/opencv-AunnWb8E.js.br     697.642 B  (ADR-0065: 697.642 B — igual)
```

`dist/sw.js`: nenhuma entrada `"assets/opencv...` no manifest de precache; a única ocorrência da
palavra é a regra `runtimeCaching` (`cacheName: transportada-opencv`). `dist/content-security-policy.txt`
idêntico ao de antes desta task (`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, sem
`'unsafe-eval'`). O worker compilado (`dist/assets/boxDimension.worker-*.js`) usa
`import("./opencv-AunnWb8E.js")` — ESM real, confirmando que `worker: { format: 'es' }` funcionou.

Essa verificação foi feita com um `import()` temporário em `src/main.tsx`, só para forçar o
primitivo a entrar no grafo do build (hoje nada o importa — T9–T11 ainda não existem). Revertido
antes do commit; `git diff src/main.tsx` fica vazio.

### O wrapper UMD do OpenCV: dois caminhos, o worker aceita os dois

Sem `.d.ts` e sem sonda dinâmica do artefato real dentro desta task (a sonda da T1 rodou contra o
pacote npm, não contra o build próprio em runtime), o `loadOpenCv()` foi escrito por leitura do
próprio artefato: `python3` decodificando `vendor/opencv/opencv.js` como `latin1` mostrou o UMD
clássico —

```
} else if (typeof module === 'object' && module.exports) {
  module.exports = factory();
} else if (typeof window === 'object') {
  root.cv = factory();
} else if (typeof importScripts === 'function') {
  root.cv = factory();
}
```

— com `factory()` retornando `cv(Module)` (uma Promise que resolve para o objeto com `Mat`,
`aruco_ArucoDetector` etc. diretamente, incluindo `matFromImageData` anexado à mão no fim do
arquivo). Empacotado pelo Rollup (que converte o `module.exports` via `@rollup/plugin-commonjs`),
isso vira `.default`; carregado sem bundler, cai no ramo de navegador/worker e atribui a
`globalThis.cv`. `loadOpenCv()` tenta `namespace.default` e cai para `globalThis.cv` — cobre os
dois sem depender de qual ramo roda.

⚠️ **Isto não foi exercitado chamando o `cv` de verdade** (nenhum teste desta task instancia o
WASM) — a confirmação é por leitura do artefato + o mecanismo de import (que o build verificou de
ponta a ponta), não por uma detecção real de marcador rodando no worker. Ver "Pontos para o
usuário".

### Vermelho antes da implementação

Nenhum dos arquivos novos existia (`boxDimension.worker.ts`, `useBoxDimensionScanner.hook.ts`,
`box-dimension-scanner.tsx`, `opencv.types.ts`, `boxDimensionMarking.service.ts`) — o contrato de
design-system falharia por `ENOENT` em todo `readApplicationFile`. As duas asserções trocadas em
`opencv-build.contract.ts` reprovariam contra o `vite.config.ts` anterior à task: sem
`OPENCV_CHUNK_GLOB`/`CacheFirst`, e `collectOpenCvImporters()` devolvia `[]` (lista vazia,
diferente de `ALLOWED_IMPORTERS`).

### Gates

| Gate                                                                    | Resultado                                                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                         | verde (`Checked 747 installs`, sem mudança)                                                                             |
| `bun run --cwd apps/frontend-transportada typecheck`                    | verde                                                                                                                   |
| `bun run --cwd apps/frontend-transportada lint`                         | 1 erro (`no-unnecessary-type-assertion`), corrigido; verde depois                                                       |
| `bun run --cwd apps/frontend-transportada test`                         | **3920 pass, 0 fail**, 35308 `expect()` (era 3908 — +12 do contrato novo, nenhum quebrado)                              |
| `bun run --cwd apps/frontend-transportada build`                        | verde (`built in 5.48s`, PWA 131 entradas de precache — igual a antes, opencv não entra por não haver consumidor ainda) |
| Build de verificação com import temporário (chunk/compressão/sw.js/CSP) | verde — ver seção acima, revertido antes do commit                                                                      |
| `bunx prettier --check` (arquivos tocados)                              | verde                                                                                                                   |
| `locale-accents.contract.ts`                                            | verde dentro da suíte completa — nenhum `*.locale.json` tocado                                                          |

`bun run lint`/`typecheck` na raiz (as 6 apps) também rodaram verdes antes e depois desta task, sem
tocar em API/worker/cron. `make check` completo (com `format:check`, `test` e `build` das 6 apps)
não rodou nesta sessão — fora do escopo de frontend tocado pela T8, e a integração da API exige
`.env.test`/Postgres descartável que este worktree não tinha de pé; os gates da app alterada
(frontend) e os dois `typecheck`/`lint` de raiz cobrem o que a T8 mudou.

### Arquivos

Novos: `src/components/ui/boxDimension.worker.ts`, `src/components/ui/opencv.types.ts`,
`src/components/ui/useBoxDimensionScanner.hook.ts`, `src/components/ui/boxDimensionMarking.service.ts`,
`src/components/ui/box-dimension-scanner.tsx`, `src/components/ui/box-dimension-scanner.module.css`,
`docs/frontend/box-dimension-scanner.md`, `test/design-system/box-dimension-scanner.contract.ts`.
Modificados: `vite.config.ts` (`worker.format`, `globIgnores`, `runtimeCaching`, `chunkFileNames`,
`openCvCompressionPlugin`), `server.ts` (`precompressedResponse`, `OPENCV_CHUNK_PATTERN`),
`src/vite-env.d.ts` (módulo ambiente do artefato), `test/shared/opencv-build.contract.ts` (duas
asserções trocadas para positivas), `test/design-system.contract.test.ts` (import do contrato
novo), `apps/frontend-transportada/CLAUDE.md` (linha nova na tabela).

### Pontos para o usuário

- **O worker nunca rodou contra o artefato real do OpenCV nesta task.** A integração
  (`loadOpenCv()`, o detector ArUco, `cvtColor`/`meanStdDev`/`Laplacian`) foi escrita a partir da
  leitura do wrapper UMD do arquivo versionado e da whitelist do ADR-0065 — não há sonda tipo a da
  T1 chamando `cv.aruco_ArucoDetector` de dentro deste worker em runtime. O que **foi** verificado
  de ponta a ponta é o mecanismo de carregamento (chunk separado, fora do precache, `CacheFirst`,
  compressão, CSP intacta — ver seção acima). Antes de confiar na detecção real do marcador, vale
  rodar o worker contra a câmera de verdade (o smoke da T11, ou uma sonda dedicada como a da T1).
- **5 pontos arrastáveis, não 4.** O `plan.md`/`tasks.md` da T8 falam em "4 pontos arrastáveis",
  mas `measureBox` (T6) pede `facePoints` (4: A, B, C, D) **e** `footPoint` (1, a base da aresta
  vertical) — sem o quinto ponto não dá para calcular a altura. Marquei os 5; se a intenção era
  mesmo 4 e a altura vier de outro lugar (ex.: derivada automaticamente), isso volta para decisão
  do usuário antes da T11 usar este primitivo.
- **Nada consome `box-dimension-scanner` ainda** — como a T7 deixou `useCameraStream` pronto e sem
  uso, esta task deixa o primitivo pronto e sem uso. `bun run build` normal (sem o import
  temporário) não gera o chunk do OpenCV porque nada o alcança; isso é esperado até a T11 montar
  `PackageBoxCameraFlow` sobre este primitivo.
- **`make check` completo não rodou** (só os gates da app tocada + lint/typecheck de raiz) — sem
  infraestrutura de banco de pé neste worktree para a integração da API, que esta task não tocou.

## T9 — Máquina de etapas

### Passo 0 — a sonda do worker contra o artefato real, sob a CSP real

A T8 deixou em aberto que `boxDimension.worker.ts` nunca tinha rodado contra `vendor/opencv/opencv.js`
de verdade (só a leitura do wrapper UMD). Antes de montar a T9 sobre esse worker, rodei uma sonda
descartável (mesmo método da sonda da T1): `bun run --cwd apps/frontend-transportada vite build` com
um segundo `input` no `rollupOptions` apontando para um `probe-t9.html`/`src/probeT9Main.ts`
temporários (nunca comitados — removidos e o `vite.config.ts` revertido antes deste commit), servidos
por `bun server.ts` de verdade (a mesma CSP de `buildContentSecurityPolicy`, o mesmo
`precompressedResponse`), abertos por Chromium headless (Playwright 1.58.2, `playwright-core` do
workspace). A sonda gera um marcador `DICT_4X4_50` id 0 pelo próprio artefato (`generateImageMarker`),
desenha um quadro sintético (quadro branco + marcador de 200px + margem de 40px) e manda para
`boxDimension.worker.ts` exatamente como o hook manda (`postMessage({ kind: 'preload' })` depois
`{ kind: 'frame', ... }`, RGBA transferido).

**Resultado: dois defeitos reais, os dois corrigidos nesta task, sem os quais o worker nunca detecta
nada em produção:**

1. **`server.ts` servia o chunk do OpenCV com `Content-Type: application/octet-stream`** quando o
   navegador manda `Accept-Encoding: br` (todo navegador manda). `precompressedResponse` construía a
   `Response` a partir do arquivo `.br`/`.gz`, e o Bun adivinha o tipo pela extensão do arquivo
   servido — `.br`, não `.js`. Com `X-Content-Type-Options: nosniff` já ativo (`server.ts`), o
   navegador recusa o `import()` do worker: "Failed to load module script: Expected a
   JavaScript-or-Wasm module script but the server responded with a MIME type of
   application/octet-stream." Reproduzido com `curl -H "Accept-Encoding: br, gzip"` direto no
   `server.ts` real, sem a sonda. Corrigido: `precompressedResponse` agora passa
   `{ headers: { 'Content-Type': original.type } }` ao construir a `Response` do arquivo comprimido —
   o tipo vem do arquivo original (`.js`), nunca da extensão do arquivo comprimido.
2. **`boxDimension.worker.ts` chamava `new cv.aruco_ArucoDetector(dictionary, parameters)` com 2
   parâmetros; o build próprio exige 3** (`BindingError: Tried to invoke ctor of aruco_ArucoDetector
with invalid number of parameters (2) - expected (3) parameters instead!`). O terceiro é
   `aruco_RefineParameters`, que por sua vez também exige 3 parâmetros no construtor
   (`minRepDistance`, `errorCorrectionRate`, `checkAllOrders` — os mesmos default do OpenCV nativo:
   10, 3, `true`). Sem isso, **toda** chamada a `detectMarkerCorners` lançava e o worker respondia
   `{ kind: 'error', reason: 'engineFailed' }` — o caminho de falha "silenciosa" que a T8 já preveria
   (D11), só que sempre, não só quando o aparelho não suporta. Corrigido em `boxDimension.worker.ts` e
   o tipo em `opencv.types.ts` (`OpenCvArucoRefineParameters`, `aruco_RefineParameters` no
   `OpenCvModule`).

Com os dois corrigidos, a sonda passou em 3 execuções seguidas, sempre com os 4 cantos do marcador
detectados nas coordenadas esperadas (`40,40`–`239,239`, batendo com o quadro sintético de 200px +
margem de 40px):

| Execução | Carga do OpenCV no worker (`preload` → `ready`) | Análise do quadro (`frame` → `frame-result`) | Detectado     |
| -------- | ----------------------------------------------- | -------------------------------------------- | ------------- |
| 1        | 113,6 ms                                        | 21,8 ms (worker reporta 20,7 ms)             | sim, 4 cantos |
| 2        | 119,6 ms                                        | 19,1 ms (worker reporta 18,8 ms)             | sim, 4 cantos |
| 3        | 109,2 ms                                        | 20,2 ms (worker reporta 19,8 ms)             | sim, 4 cantos |

Números de desktop (mesma ordem de grandeza da carga isolada do artefato na ADR-0065, 70–83 ms) — o
celular médio continua sendo medido só na T15. `markerBuildMs` (~160–225 ms) é o tempo de gerar o
marcador sintético no thread principal para a sonda, não faz parte do caminho real do produto.

A sonda (`probe-t9.html`, `src/probeT9Main.ts`, o `input` extra no `vite.config.ts`) foi apagada antes
deste commit — `git status` limpo confirma que não sobrou rastro. Os dois arquivos que ficam são a
correção real: `apps/frontend-transportada/server.ts` e
`apps/frontend-transportada/src/components/ui/boxDimension.worker.ts` (+ `opencv.types.ts`).

### Correção de texto — 5 pontos, não 4

`plan.md` (arquitetura do primitivo, T8) dizia "a foto congelada com os 4 pontos arrastáveis". A T8
já tinha registrado a divergência como ponto para o usuário: `measureBox` (T6) pede `facePoints` (4:
A, B, C, D) **e** `footPoint` (1, o pé da aresta vertical) — 5 pontos, como o spike. `tasks.md` e
`spec.md` já não citavam o número, só `plan.md`; corrigido para "5 pontos arrastáveis — 4 da face de
cima (A, B, C, D) e 1 do pé da aresta vertical (`foot`)". Nenhum comportamento mudou — o código já
marcava 5 pontos desde a T8 (`MARKED_POINT_KEYS` em `useBoxDimensionScanner.hook.ts`).

### O reducer

`shared/packageBoxCameraFlow.service.ts` (`apps/frontend-transportada/src/modules/nfe-workspace/`),
genérico em `TCandidate`/`TProposal` para não acoplar a máquina ao formato de `PackageBox`/
`BoxDimensionMeasuredResult` (isso fica para a T11). Sete etapas (`label` · `identifying` · `choose` ·
`identified` · `measure` · `review` · `saving`), reducer puro (`packageBoxCameraFlowReducer`) sem
nenhum I/O — só transições e os campos que a etapa seguinte precisa (`candidates`, `identified`,
`proposal`, `reviewSource`, `unsupportedReason`, `noMatch`, `cameraEnabled`,
`enginePreloadStatus`). Eventos do `plan.md` (`labelRead`, `matchesLoaded`, `measureRequested`,
`measured`, `unsupported`, `typeRequested`, `backToLabel`, `saved`, `closed`) mais os que a máquina
de 7 etapas exige na prática e que o `plan.md` não detalhava: `candidateSelected` (escolher uma das N
candidatas), `saveRequested`/`saveFailed` (entrar/sair de `saving`), `cameraSettingsLoaded` (liga o
`cameraEnabled` em runtime, D14) e `enginePreloadStarted`/`Ready`/`Failed` (acompanha a pré-carga do
D18 sem se importar com quem a disparou).

Transições cobertas pelo aceite:

- **R1 — 0/1/N candidatas:** `matchesLoaded([])` volta para `label` com `noMatch: true`;
  `matchesLoaded([um])` pula direto para `identified`; `matchesLoaded([dois ou mais])` abre `choose`,
  e `candidateSelected` de lá identifica. `backToLabel` funciona em toda etapa que não seja `saving`
  (testado a partir de `identified` e de `measure`) e limpa `identified`/`proposal`/`candidates`.
  `saved` (a partir de `saving`) volta para `label` limpo — o ciclo "medir a pilha em sequência" (D4).
- **R4 — fallback:** `unsupported('noWasm' | 'engineFailed' | 'tooSlow')` a partir de `measure` entra
  em `review` com `reviewSource: 'typed'`, `proposal: undefined` e `unsupportedReason` preenchido,
  **mantendo `identified`** — o formulário abre já com a caixa lida, como D11 pede. `typeRequested`
  faz o mesmo a partir de `identified`/`choose`/`measure`, a qualquer momento. `measured(proposal)`
  entra em `review` com `reviewSource: 'camera'` e a proposta.
- **R7 — função desligada:** `measureRequested` só sai de `identified` para `measure` com
  `cameraEnabled: true`; com a função desligada é um no-op (a etapa Medida nunca existe para quem
  desligou). `cameraSettingsLoaded` muda `cameraEnabled` em tempo de execução, sem exigir fechar e
  reabrir o fluxo.

Não testado nesta task (fica para quem monta o hook/tela, T10–T11): debounce da leitura, `aria-live`,
o formulário em si, chamadas de rede, e a pré-carga real do worker — aqui só o campo
`enginePreloadStatus` muda de acordo com o evento, sem I/O nenhum.

### Gates

| Gate                                                   | Resultado                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `bun test test/nfe-workspace.contract.test.ts`         | verde, **382 pass, 0 fail**, 1272 `expect()` (suíte do módulo isolada)                                 |
| `bun run --cwd apps/frontend-transportada typecheck`   | verde                                                                                                  |
| `bun run --cwd apps/frontend-transportada lint`        | verde                                                                                                  |
| `bun run --cwd apps/frontend-transportada test`        | verde, **3936 pass, 0 fail**, 35362 `expect()` (era 3920 na T8, +16 do contrato novo, nenhum quebrado) |
| `bun run --cwd apps/frontend-transportada build`       | verde (`built in 5.12s`, PWA 131 entradas — sem o chunk do OpenCV, nada o consome ainda)               |
| `bunx prettier --check` (arquivos tocados + `plan.md`) | verde                                                                                                  |
| `git status` depois de apagar a sonda                  | limpo — só os arquivos reais desta task, nenhum `probe-t9*`/`dist/` sobrando                           |

`make check` completo não rodou (mesma razão da T8: sem Postgres/`.env.test` de pé neste worktree
para a integração da API, que esta task não toca). `bun run lint`/`typecheck` na raiz não rodaram de
novo nesta task porque nenhuma outra app foi tocada.

### Arquivos

Novos: `apps/frontend-transportada/src/modules/nfe-workspace/shared/packageBoxCameraFlow.service.ts`,
`apps/frontend-transportada/test/nfe-workspace/package-box-camera-flow.contract.ts`.
Modificados: `apps/frontend-transportada/server.ts` (`Content-Type` do chunk pré-comprimido),
`apps/frontend-transportada/src/components/ui/boxDimension.worker.ts` e `opencv.types.ts`
(`aruco_RefineParameters`), `apps/frontend-transportada/test/nfe-workspace.contract.test.ts` (import
da suíte nova), `specs/152-medir-caixa-pela-camera/plan.md` (5 pontos, não 4).

### Pontos para o usuário

- **Dois defeitos reais na T8 corrigidos aqui, achados só pela sonda.** Sem a correção de
  `server.ts`, o worker de medida nunca teria carregado em nenhum navegador real (todo navegador
  manda `Accept-Encoding: br`) — a T8 tinha testado o mecanismo de carregamento, mas nunca o
  `import()` do módulo servido comprimido de ponta a ponta. Sem a correção do
  `aruco_ArucoDetector`/`aruco_RefineParameters`, a detecção falharia sempre, em qualquer aparelho,
  com qualquer marcador — o caminho de erro do worker (`engineFailed`) escondia os dois porque captura
  qualquer exceção. As duas correções são estreitas e mecânicas; nenhuma delas mexeu em CSP,
  Permissions-Policy ou nos limites de precisão.
- **A máquina de etapas ainda não tem consumidor** — como a T7 e a T8 antes dela, este reducer fica
  pronto e testado sozinho até a T11 (ou o hook da T10/T11) instanciar `useReducer` com ele e ligá-lo
  ao `PackageBoxCameraFlow.component.tsx`.
- **`saveRequested`/`saveFailed`/`candidateSelected`/`cameraSettingsLoaded` não estão no `plan.md`**
  (que lista só `labelRead, matchesLoaded(n), measureRequested, measured, unsupported, typeRequested,
backToLabel, saved, closed`). Eu os adicionei porque a máquina de 7 etapas do próprio `plan.md`
  (que inclui `choose` e `saving`) não fecha sem eles — não dá para chegar em `saving` sem um evento
  que peça, nem escolher uma candidata em `choose` sem um evento para isso. Se a intenção era outra
  forma de chegar nesses estados (por exemplo, `saving`/`review` fundidos, ou a escolha da candidata
  fora do reducer), isso volta para decisão do usuário antes da T10/T11 consumirem esta máquina.

## T10 — Formulário com proposta, selo, aviso e confirmação

Data: 2026-09-15. Modelo: `sonnet`. Base: `a9b0183a` (T1–T9 em `staging`).

### O que mudou

Extraído `PackageBoxRow`'s formulário inline de `PackageBoxMeasurementPanel.component.tsx` para
`PackageBoxMeasurementForm.component.tsx` (spec 152), capaz de abrir tanto no caminho digitado (D11,
comportamento de hoje) quanto com a proposta da câmera (`BoxDimensionMeasuredResult`, T6/T8):

- `PackageBoxMeasurementForm` recebe `proposal: BoxDimensionMeasuredResult | undefined`. Ausente →
  formulário digitado igual ao de antes (source `typed`). Presente → os três campos nascem com o
  valor da câmera (D6), cada um com sua margem em cm ao lado.
- **Selo "Experimental"** (D13): `Badge` + `Icon name="alert"` + o texto de D13
  (`packageBoxes.experimentalHint`, acentuado nos dois idiomas), atrás da constante única
  `CAMERA_MEASUREMENT_IS_EXPERIMENTAL` (`packageBoxMeasurement.constant.ts`) — só a T16 muda para
  `false`. Texto + ícone sempre juntos (nunca só cor), e os motivos que a câmera relatou (D9,
  `packageBoxes.warnings.<code>`) aparecem listados junto do selo.
- **Margem por dimensão (R2):** `classifyMargin` (T6) decide a faixa —
  - `reliable` (≤ 10 mm): campo com "±X cm", sem aviso.
  - `imprecise` (10–30 mm): "±X cm" + "Medida imprecisa: ±X cm — aproxime, melhore a luz ou digite a
    medida", com `<Icon name="alert">` e `role="alert"` (nunca só cor).
  - `unreliable` (> 30 mm): campo nasce vazio, "Sem leitura confiável — digite a medida" com
    `role="alert"`, e o foco vai para o primeiro campo nessa faixa (`firstUnreliableRef`).
- **Confirmação obrigatória (R2/R3):** com alguma dimensão ainda `imprecise` e não editada, Salvar
  abre `ImpreciseConfirmDialog` ("Gravar medida imprecisa (±X cm)?", "Gravar assim" /
  "Digitar a medida") — nada é gravado (`onSubmit`) antes dessa escolha explícita.
- **Editar muda a origem (R3/D17):** cada dimensão tem seu próprio `edited[dimension]`. Editar
  qualquer uma vira a origem inteira para `camera_adjusted`; a margem daquela dimensão some do bloco
  `camera` enviado (a regra de imprecisão não se aplica mais a ela), mas o valor **proposto**
  (`proposedLengthMm`/`proposedWidthMm`/`proposedHeightMm`) continua indo para a API mesmo depois de
  editado — é o que o histórico (D17) compara com o gravado.
- **Digitar continua padrão e sempre disponível:** sem `proposal`, o formulário é o de sempre, sem
  selo, sem margem, `source: 'typed'`, sem bloco `camera`.

`packageBoxClient.service.ts` ganhou `PackageBoxMeasurementSource`, `PackageBoxCameraMeasurementInput`
e os campos opcionais `source`/`camera` em `PackageBoxMeasurementInput` (R5) — `measureBox` já
espalhava `...measurement` no corpo, então nenhum campo novo precisou de código extra para viajar (o
`JSON.stringify` omite as chaves ausentes, retrocompatível com o corpo antigo). `PackageBox` e o
guard `isPackageBox` passaram a exigir `measurementSource`/`measurementMarginMm` (nuláveis,
domínio fechado — origem fora de `typed | camera | camera_adjusted` é recusada, não silenciada).

Unidades (`MAX_CENTIMETRES`, `MILLIMETRES_PER_CENTIMETRE`, `toCentimetres`, `toMillimetres`) saíram
do painel para `packageBoxMeasurementUnits.service.ts`: o formulário digitado e o da câmera agora
compartilham a mesma conversão cm↔mm, em vez de duas cópias.

### Verificação

```
$ bun run typecheck        # tsc --noEmit — 0 erros
$ bun run lint             # eslint (api/worker/cron/frontend/frontend-client/frontend-landing) — 0 erros
$ bun test test/nfe-workspace.contract.test.ts
 398 pass / 0 fail / 1318 expect() calls
$ bun run test             # suíte inteira do frontend
 3952 pass / 0 fail / 35408 expect() calls (29 arquivos)
$ bunx prettier --check <arquivos alterados>   # verde após --write nos dois arquivos que pegaram
$ bun run build            # vite build — verde (avisos de chunk > 500 kB preexistentes, não deste diff)
```

`test/design-system.contract.test.ts` (inclui `locale-accents.contract.ts`) — 346 pass / 0 fail:
as chaves novas em pt-BR (`experimentalHint`, `imprecise`, `unreliable`, `warnings.*`) passam
acentuadas.

### O que a tela faz, por faixa de margem

| Margem   | Campo               | Aviso                                                     | Grava sem confirmar?                                             |
| -------- | ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| ≤ 10 mm  | preenchido, "±X cm" | nenhum                                                    | sim                                                              |
| 10–30 mm | preenchido, "±X cm" | "Medida imprecisa…" + ícone, `role="alert"`               | não — pede "Gravar assim" ou "Digitar a medida"                  |
| > 30 mm  | vazio, foco nele    | "Sem leitura confiável — digite a medida", `role="alert"` | não é o caso — não há valor para gravar até o conferente digitar |

O selo "Experimental" aparece **acima dos campos**, dentro do próprio `PackageBoxMeasurementForm`,
sempre que a proposta vier da câmera (`proposal !== undefined`) e a constante ainda estiver `true`.

### Escopo que ficou fora de propósito (T11/T12)

- Este formulário ainda não é chamado com uma `proposal` real em lugar nenhum da tela — quem abre
  "Medir esta caixa" continua caindo no caminho digitado (`proposal={undefined}`) até a T11 montar
  `PackageBoxCameraFlow` sobre `useBoxDimensionScanner`/`packageBoxCameraFlowReducer` e passar a
  proposta capturada para este formulário. Isso é esperado — T10 entrega o formulário pronto e
  testado, T11 é quem liga a câmera a ele.
- Mostrar a origem (`measurementSource`) na linha já medida da fila é tarefa da T11 ("a linha medida
  mostra a origem"), não desta task — o tipo e o guard já aceitam o campo, só a exibição falta.

### Pontos para o usuário

Nenhum ponto de parada obrigatória tocado: nenhuma mudança de CSP/Permissions-Policy, nenhuma
migration, e `MARGIN_RELIABLE_MM`/`MARGIN_UNRELIABLE_MM` (T6) não foram alterados — só consumidos via
`classifyMargin`, já existente.

## T11 — `PackageBoxCameraFlow` na tela

### O que entrou

- `src/modules/nfe-workspace/components/PackageBoxCameraFlow.component.tsx`: o diálogo de tela
  cheia novo, dono único de `useCameraStream` (D19) — abre uma vez ao montar (o painel só monta o
  componente quando o operador toca "Medir pela câmera") e entrega o **mesmo** `MediaStream` ao
  leitor (`useBarcodeScanner({ stream })`, etapa Etiqueta) e ao primitivo de medida
  (`<BoxDimensionScanner stream={stream} />`, etapa Medida). Encadeia o reducer puro da T9
  (`packageBoxCameraFlowReducer`) pelas etapas `label → identifying → choose/identified → measure →
review → saving → label`: "Voltar para a etiqueta" (`dispatch({ kind: 'backToLabel' })`) aparece em
  toda etapa depois da etiqueta, exceto `saving`. A etapa Conferência reaproveita o mesmo
  `PackageBoxMeasurementForm` da T10, passando `proposal` só quando `reviewSource === 'camera'`
  (sem suporte, `reviewSource` é `'typed'` e o formulário abre digitado, com o aviso de D11/R4).
- **Lanterna (caso extremo da spec):** `useCameraStream.hook.ts` ganhou `hasTorch`/`torchOn`/
  `toggleTorch`, lendo `getCapabilities().torch` da primeira trilha do stream e aplicando
  `applyConstraints({ advanced: [{ torch }] })`. O botão só aparece na etapa Medida quando
  `hasTorch` é `true` — sem suporte, some por completo (não desabilitado, ausente), e o teste de
  `camera-stream.contract.ts` (T7) continua verde sem alteração (mesma contagem de
  `openCameraStream`/`stopCameraStream`).
- `useCameraMeasurementSettings.hook.ts` + `PackageBoxClient.getMeasurementSettings()`: leitura
  própria de `GET /nfe-package-boxes/measurement-settings` (`cargo.measure`, T4) — separada da
  leitura de `settings.manage` que `useCargoSettings` já fazia para o painel de configuração.
  Padrão seguro: enquanto não carrega (ou falha), `cameraMeasurementEnabled` fica `false`.
- `MeasurementCardPrint.component.tsx` (D3): o cartão imprimível. **Nunca `<svg>` cru** — o ArUco é
  uma grade de `<span>` (CSS grid) preenchida por `MEASUREMENT_CARD_MARKER_GRID`
  (`measurementCardMarker.constant.ts`), 150 mm de lado (`MARKER_SIDE_MM`, T6), mais uma régua de
  controle de 100 mm com marcações a cada 10 mm. `@media print` esconde cabeçalho/botões/fundo e
  deixa só o cartão, medido em `mm` (nunca `rem`/`%`) para sair em escala real na impressora.
  Instrução "Imprima em 100%, sem ajustar à página" e "confira a régua com a fita antes do primeiro
  uso" (D3) na tela, antes de imprimir. Aberto por "Imprimir cartão de medição" no cabeçalho da fila.
- A linha já medida da fila mostra a origem (R1/R5, pendência que a T10 deixou explícita):
  `measurementSourceLabel()` em `PackageBoxMeasurementPanel` traduz `measurementSource` em
  "Pela câmera, ±X cm" (`camera`/`camera_adjusted`), "Digitada" (`typed`) ou "Origem não registrada"
  (`null`, medida anterior a esta spec).

### ⚠️ Matriz do marcador: extraída do binário real, não inventada

D3 exige o ArUco `DICT_4X4_50` id 0 impresso certo — bit errado imprime um cartão que o worker
**nunca detecta**, e o defeito só aparece no galpão. Em vez de recordar (ou arriscar) o padrão de
bits de memória, rodei `cv.generateImageMarker(dictionary, 0, 120, marker, 1)` contra o **mesmo**
artefato de build próprio do OpenCV que `boxDimension.worker.ts` carrega (script descartável em
`/tmp`, removido depois — não ficou no worktree), e li a matriz 6×6 resultante (borda de 1 módulo +
4×4 bits de dado) direto dos pixels do `cv.Mat` gerado. `MEASUREMENT_CARD_MARKER_GRID` em
`measurementCardMarker.constant.ts` é essa matriz, byte a byte — a borda fechada preta
(`'111111'` na primeira e na última linha) confere com o formato do padrão ArUco. O teste novo
verifica as 6 linhas de 6 caracteres e as duas bordas fechadas.

### Verificação

```
$ bun run typecheck                        # tsc --noEmit — 0 erros
$ bun run lint                              # eslint (todas as apps) — 0 erros
$ bun run test                              # suíte inteira do frontend
 3971 pass / 0 fail / 35478 expect() calls (29 arquivos)
$ bunx prettier --check src test            # verde, após --write nos arquivos que pegaram
$ bun run build                             # vite build — verde
```

Confirmado no `dist/sw.js` gerado: o chunk `opencv-*.js` (2,9 MB) **não** entra no precache — só
aparece na regra `runtimeCaching` (`registerRoute(/\/assets\/opencv-.*\.js$/u, new CacheFirst({
cacheName:"transportada-opencv" ...`), preservando o comportamento da T8. `opencv-build.contract.ts`
(que varre `src/` inteiro por referência ao artefato) continua com **um único** importador
(`boxDimension.worker.ts`) — o segundo ponto de instanciação do worker (pré-carga, D18) referencia o
próprio arquivo do worker, não o artefato do OpenCV, então não conta como um segundo importador.

Teste novo: `test/nfe-workspace/package-box-camera-flow-dialog.contract.ts` (20 casos), registrado
em `test/nfe-workspace.contract.test.ts` (que já está na lista de `package.json`, então nenhum
arquivo novo precisou entrar lá).

### Decisões e desvios do plano, com o motivo

- **`getUserMedia` não é chamado exatamente uma vez em todo o ciclo etiqueta → medida → gravar →
  etiqueta (R1, parte final do critério).** O botão "Ler etiqueta" de hoje (leitor digitado comum)
  continua abrindo o `<BarcodeScanner>` de sempre — que abre a própria câmera — **sem** mudança,
  porque `test/nfe-workspace/package-box-measurement.contract.ts` fixa por texto de fonte
  dezenas de comportamentos exatos desse caminho (`cameFromScan`, `awaitingScan`,
  `openMeasurementForScannedBox`, a pistola física, a lista de candidatas): reescrever esse fluxo
  para compartilhar o `PackageBoxCameraFlow` quebraria ~30 asserções que travam comportamento hoje
  funcionando, sem ganho para quem usa só o formulário digitado. Em vez disso, `PackageBoxCameraFlow`
  é uma **segunda porta de entrada** — "Medir pela câmera", ao lado de "Ler etiqueta" — que abre a
  própria sessão de câmera e a mantém aberta por todo o ciclo etiqueta→medida→gravar→etiqueta
  **dentro dela mesma** (contrato: um único `useCameraStream(` no arquivo). O que R1 pede —
  "não pede permissão de novo entre etiqueta e medida" — vale dentro dessa porta; o que não vale é
  compartilhar a MESMA sessão entre as duas portas de entrada diferentes.
  **Isto é uma decisão de escopo, não um esquecimento — peço a leitura do arquiteto/usuário antes da
  T14** sobre se vale unificar as duas portas numa próxima task (T12 mexe no painel de qualquer
  forma) ou se conviver com duas entradas é aceitável em produção.
- **Smoke Playwright com câmera falsa (`.y4m`) não foi construído.** O critério de aceite da T11
  pede um smoke com `--use-file-for-fake-video-capture`, um vídeo de uma caixa real com o cartão
  impresso, e a checagem de `getUserMedia` chamado uma vez pelo Chromium. Isso exige gravar (ou
  conseguir) um vídeo de referência com o cartão real enquadrado, e não é algo que dá para fabricar
  sem uma câmera e um cartão impressos de verdade — é o tipo de artefato que a T15 (validação com
  caixas reais) também precisa, e reaproveitável entre as duas. Ficou como pendência explícita:
  a cobertura de comportamento ficou nos 20 testes de contrato por texto de fonte (mesmo padrão do
  resto do app, que não tem DOM), que verificam a composição (quem é dono do stream, quais
  primitivos cada etapa usa) mas não substituem um smoke real de câmera.
- **`onSave` não usa `await`/Promise.** Segue a mesma regra de `usePackageBoxQueue.hook.ts`
  ("Sem `await`: aguardar a releitura aqui segura o botão", `test/shared/mutation-pending-state.contract.ts`)
  — a UI é otimista: `handleSave` chama `onSave(boxId, submission)` (que dispara
  `packageBoxes.measure.mutate`) e já despacha `saved` na sequência, sem esperar a mutação resolver.
  É o mesmo padrão que a linha digitada já usa hoje.
- **A pré-carga do OpenCV (D18) cria um worker próprio, separado do que `BoxDimensionScanner`
  cria ao entrar na etapa Medida.** Simplificação deliberada: o worker de pré-carga só existe para
  esquentar o cache HTTP/compilação do chunk do OpenCV (`preload()`), termina assim que responde
  `ready`/erro, e não é reaproveitado pela etapa Medida (que instancia o seu, como já fazia antes da
  T11). Duplica uma pequena inicialização, mas evita acoplar o ciclo de vida dos dois workers — e o
  contrato de "um único importador do OpenCV" continua valendo (o segundo ponto de `new Worker`
  aponta para o mesmo arquivo do worker, não para o artefato do OpenCV).

### O que não foi tocado

`MARGIN_RELIABLE_MM`/`MARGIN_UNRELIABLE_MM`, CSP, Permissions-Policy e nenhuma migration. O painel
do interruptor (T12, `CameraMeasurementSettingsPanel` — já existe no worktree, mas sem o resumo da
validação nem o export CSV) não foi alterado além de nada — T11 só **lê** o interruptor pela rota
própria de `cargo.measure`, não mexe no painel de `settings.manage`.

---

## T11 — entrada unificada

Data: 2026-09-15. Modelo: `sonnet` (executor). Resolve a pendência que a T11 original deixou
explícita acima ("peço a leitura do arquiteto/usuário antes da T14"): pedido direto do usuário
para fechar as **duas portas de câmera** da fila de caixas em **uma só**, R1 da spec.

### Decisão

Com `cameraMeasurementEnabled` **ligado**: o botão "Ler etiqueta" passa a abrir o
`PackageBoxCameraFlow` (mesma sessão de câmera etiqueta → produto → medida → conferência, D4/T9).
O botão separado "Medir pela câmera" **deixa de existir** — não sobrou como ação dentro do fluxo
porque `PackageBoxCameraFlow` já é o próprio fluxo, sem lugar melhor para uma segunda entrada.

Com a função **desligada** (`false`, padrão em todo ambiente hoje): comportamento **idêntico** ao
de antes da T11 — "Ler etiqueta" abre o `<BarcodeScanner>` de sempre, medição digitada na linha.
Nada mudou nesse caminho: os ~30 comportamentos que
`test/nfe-workspace/package-box-measurement.contract.ts` trava por texto de fonte (`cameFromScan`,
`awaitingScan`, `openMeasurementForScannedBox`, candidatas, pistola física) continuam intactos e
verdes sem alteração nenhuma nesse arquivo.

### Mudança

Um botão só em `PackageBoxMeasurementPanel.component.tsx`, cujo `onClick` decide o destino pelo
interruptor:

```tsx
onClick={() =>
  cameraMeasurementEnabled ? setIsCameraFlowOpen(true) : setIsScannerOpen(true)
}
```

O segundo `<Button>` ("Medir pela câmera",
`t('packageBoxes.camera.openFlow')`) foi removido, junto da chave de locale `openFlow` (pt e en,
sem uso restante em `src/` nem `test/`). `PackageBoxCameraFlow` continua sempre montado (nunca
condicionado a `cameraMeasurementEnabled` no JSX — só o `isCameraFlowOpen` que o abre muda de
dono), e sua própria etapa "identificada" já escondia "Medir esta caixa" com a função desligada
(R7, inalterado). A pistola pelo Enter no campo de busca não foi tocada — é um caminho
independente dos dois botões, que já usava `onScan` direto.

### Contrato ajustado

`test/nfe-workspace/package-box-camera-flow-dialog.contract.ts`, describe "o painel entra no fluxo
da câmera pela leitura própria do interruptor (R7)": o teste antigo só provava
`{cameraMeasurementEnabled ? (` (a existência condicional do SEGUNDO botão) — ele travava
exatamente a "segunda porta" que o usuário pediu para fechar, então precisou mudar. Substituído por
três testes que provam o comportamento **por estado do interruptor**:

1. ligada → o `onClick` do botão único contém
   `cameraMeasurementEnabled ? setIsCameraFlowOpen(true) : setIsScannerOpen(true)` e
   `<PackageBoxCameraFlow` continua no JSX;
2. desligada → dentro do bloco `<div className={styles.search}>`, o botão chama
   `setIsScannerOpen(true)` (mesmo leitor de sempre);
3. não existe mais `t('packageBoxes.camera.openFlow')` em lugar nenhum do painel nem das duas
   locales, e só há uma chamada a `setIsCameraFlowOpen(true)` no arquivo inteiro (a porta é uma só).

Vermelho antes da implementação (rodado com `bun test test/nfe-workspace.contract.test.ts -t
"porta única"` — falhou porque o botão único ainda não existia), verde depois. Nenhuma asserção de
`package-box-measurement.contract.ts` (o arquivo que trava o caminho desligado) foi tocada — a
tarefa pedia explicitamente para não afrouxar essas.

### Gates

| Gate                                    | Resultado                                         |
| --------------------------------------- | ------------------------------------------------- |
| `bun run typecheck` (todas as apps)     | verde, sem erro                                   |
| `bun run lint` (todas as apps)          | verde, sem erro                                   |
| `bun run test` (frontend-transportada)  | 3973 pass, 0 fail, 0 `(fail)`, 35485 expect()     |
| `bunx prettier --check .` (raiz)        | verde                                             |
| `bun run build` (frontend-transportada) | verde — `dist/sw.js` com 132 entradas de precache |

`git rev-parse --short HEAD` na base desta task: `1df2b667`.

### Ponto que ainda cabe decisão do usuário

Nenhum bloqueio novo. Um ponto de atenção que vale registrar: a etapa "identificada" do
`PackageBoxCameraFlow` já mostra "Digitar medida" e "Não é esta — ler de novo" ao lado de "Medir
esta caixa" — ou seja, mesmo com a porta única, o operador ainda escolhe entre câmera e digitado
depois de identificar o produto (R4/R7, comportamento já existente e não alterado). Se o usuário
quisesse que "Ler etiqueta" sempre terminasse medindo pela câmera sem essa escolha extra, seria uma
mudança de R4/R7, fora do pedido desta task (que foi só sobre a ENTRADA, não sobre o que acontece
depois de identificar a caixa).
