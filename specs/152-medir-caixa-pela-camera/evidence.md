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
