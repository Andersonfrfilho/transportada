# ADR-0069 — O número do canhoto se lê no aparelho, e nunca decide

- **Status:** aceita
- **Data:** 2026-09-18
- **Decisores:** revisão Opus (T13 da spec 156), sobre a D6.2 decidida pelo usuário na conversa da
  spec
- **Fecha:** a T13 da spec 156 (`specs/156-o-escritorio-da-baixa-pelo-motorista/`)
- **Emendada:** 2026-09-18, depois da validação do architect (R1–R8: diretório versionado,
  formato do número e confiança, compressão, número fora da seleção, licenças, rota sem rateLimit)
- **Emendada por:** ADR-0078 (2026-09-25, proposta) — o mesmo motor e o mesmo interruptor passam a rodar
  na app do motorista, depois de a foto entrar na fila, comparando com a nota do comprovante (não
  sugerindo nota)
- **Precedentes:** ADR-0065 (dependência wasm pesada sob a nossa CSP, carga sob demanda, selo
  experimental, interruptor por empresa) e ADR-0067 §4 (a foto identifica a nota, quem confirma é a
  pessoa)

## Contexto

O caso mais comum do escritório é o maço de **canhotos destacados**: a tira de cima do DANFE, sem o
código de barras da chave de acesso. A leitura por código de barras (D6.1, `@zxing/library`) não
serve ali, e hoje a nota é escolhida à mão, com a esperada já sugerida pelo passo do assistente.

O canhoto traz impressos o **número** e a **série** da NF-e (`Nº 000.123.456 SÉRIE 1`). Ler esse
número e compará-lo com as notas da viagem poupa a escolha na maioria dos canhotos. A spec 156 pôs
isso na Fase 5 como **experimental**, e o code-standart §13 exige justificar a dependência nova.

Três restrições tornam a escolha arquitetural:

1. **CSP.** `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, `connect-src 'self' …`.
   Nada de `'unsafe-eval'`, nada de worker `blob:`, nada de CDN (ADR-0065 §5).
2. **PWA e aparelho do escritório.** A leitura roda no navegador, sem mandar a imagem para servidor
   nenhum (a foto do canhoto é comprovante e tem nome e assinatura de quem recebeu), e o peso só pode
   ser pago por quem liga a função.
3. **Nota errada não pode entrar calada.** Canhoto gravado na nota errada é baixa falsa, e o erro só
   aparece quando o cliente cobra. A leitura **sugere**, e só quando a sugestão é inequívoca.

## Pesquisa (consultas em 2026-09-18)

| Fonte                                                                                                                                                                                                 | O que se tirou dela                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| registro npm, `npm view tesseract.js` (2026-09-18)                                                                                                                                                    | `7.0.0`, publicada 2025-12-15, Apache-2.0                                                                                          |
| registro npm, `npm view tesseract.js-core` (2026-09-18)                                                                                                                                               | `7.0.0` (a tag `latest` ainda aponta `6.1.2`; o `tesseract.js@7` pede `^7.0.0`), Apache-2.0                                        |
| registro npm, `npm view @tesseract.js-data/eng` (2026-09-18)                                                                                                                                          | `1.0.0`, MIT (o pacote); o modelo é o `tessdata` do Tesseract, Apache-2.0                                                          |
| GitHub `naptha/tesseract.js` via `gh api` (2026-09-18)                                                                                                                                                | não arquivado, último push 2026-05-17, 38,7 mil estrelas; `tesseract.js-core` com push em 2026-03-25                               |
| [tesseract.js — local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) (2026-09-18)                                                                       | `workerPath`, `corePath` (**diretório** com todas as variantes do core) e `langPath` servem tudo da própria origem                 |
| [tesseract.js — releases](https://github.com/naptha/tesseract.js/releases) (2026-09-18)                                                                                                               | v7: build `relaxedsimd`, 15–35% mais rápido que a v6                                                                               |
| registro npm, `npm view scribe.js-ocr` (2026-09-18)                                                                                                                                                   | `0.15.0`, **AGPL-3.0**, 70 MB desempacotado                                                                                        |
| registro npm, `npm view onnxruntime-web` (2026-09-18) e o tarball                                                                                                                                     | `1.30.0`, MIT; o menor `.wasm` tem 13,6 MB, sem contar modelo de detecção + reconhecimento                                         |
| registro npm, `npm view ppu-paddle-ocr` (2026-09-18)                                                                                                                                                  | `6.6.0`, MIT; PaddleOCR em ONNX, depende de `ppu-ocv` (OpenCV no navegador)                                                        |
| [Chrome — Shape Detection API](https://developer.chrome.com/docs/capabilities/shape-detection) e [progressier — Text Detection](https://progressier.com/pwa-capabilities/text-detection) (2026-09-18) | `TextDetector` só no Chrome/Edge, atrás de `#enable-experimental-web-platform-features`; a especificação de texto é só informativa |
| [MDN — Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) (2026-09-18)                                                                                    | Shape Detection segue "Limited availability", fora do Baseline                                                                     |

### Sonda (2026-09-18)

Os pacotes `tesseract.js@7.0.0`, `tesseract.js-core@7.0.0` e `@tesseract.js-data/eng@1.0.0` saíram
do registro npm (`npm pack`) para uma pasta descartável, servidos por um `Bun.serve` que aplica **em
toda resposta** a CSP gerada pela própria `buildContentSecurityPolicy` do app (sem mudança), e lidos
no Chromium headless do Playwright 1.58.2 (Mac arm64). A imagem é um canhoto sintético desenhado num
`<canvas>` (texto da tira, `NF-e Nº 000.123.456  SÉRIE 1`, linha de data e assinatura).

Configuração: `workerPath: '/worker.min.js'`, `corePath: '/'`, `langPath: '/<modelo>/'`,
**`workerBlobURL: false`**, `cacheMethod: 'none'`, `gzip: true`.

| Modelo                     | Parâmetro                                   | Texto lido                                      | Carga  | Leitura |
| -------------------------- | ------------------------------------------- | ----------------------------------------------- | ------ | ------- |
| `4.0.0_best_int` (2,95 MB) | whitelist `0123456789`                      | `000` / `0001234561` — número e série colados   | 118 ms | 118 ms  |
| `4.0.0_best_int`           | whitelist `0123456789.`                     | `000` / `000.123.4561` — série ainda colada     | 112 ms | 112 ms  |
| **`4.0.0_best_int`**       | **sem whitelist**                           | **`NF-e N° 000.123.456 SERIE 1`**, confiança 91 | 107 ms | 113 ms  |
| `4.0.0_best_int`           | sem whitelist (`Nº 000.004.321 SÉRIE: 002`) | `N° 000.004.321 SERIE: 002`, confiança 91       | 109 ms | 111 ms  |
| `4.0.0` (10,4 MB)          | whitelist `0123456789`                      | igual ao `best_int`                             | 280 ms | 115 ms  |

**Zero violação de CSP** em todas as execuções (`securitypolicyviolation` e console). O worker
clássico faz `importScripts` do core da mesma origem, e o core instancia o WASM a partir dos bytes
embutidos no `.wasm.js`, que `'wasm-unsafe-eval'` cobre. O `new Function("return this")` do
`worker.min.js` é o fallback do runtime do webpack e só roda quando `globalThis` não existe — nunca
num navegador suportado. Não há `eval(` no core nem no worker.

Duas coisas que a sonda **mudou** no plano:

1. **A whitelist só de dígitos piora a leitura.** Ela força as letras a virarem dígito (`ACME` virou
   `000`) e apaga o separador entre número e série. A leitura é do texto inteiro, e **o que se
   aproveita** são só os dígitos que seguem os rótulos `Nº` e `SÉRIE` (§3). O plan.md dizia
   "só com dígitos (`tessedit_char_whitelist`)"; esta ADR corrige isso.
2. **`workerBlobURL: false` é obrigatório.** O padrão da biblioteca cria o worker a partir de uma URL
   `blob:` com `importScripts`, que `worker-src 'self'` recusa.

A imagem sintética é limpa demais para medir precisão: ela prova que o motor **roda** sob a nossa
CSP, não que acerta canhoto real amassado, torto e carimbado. Isso é da validação (§6).

## Decisão

### 1. `tesseract.js` 7, rodando no aparelho

| Opção                                            | Offline / mesma origem | CSP atual                                                                                   | Peso sob demanda                         | Dígito impresso                                                           | Licença / manutenção                             | Veredito                                                                                   |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **`tesseract.js` 7 + `eng` `best_int`**          | sim                    | **sim, medido** (com `workerBlobURL: false`)                                                | ~3,9 MB core + 2,95 MB modelo (§4)       | texto impresso é o caso de uso do Tesseract                               | Apache-2.0, ativo                                | **escolhida**                                                                              |
| Só manual (não fazer OCR)                        | —                      | —                                                                                           | zero                                     | —                                                                         | —                                                | é o fallback, sempre                                                                       |
| `TextDetector` (Shape Detection)                 | sim                    | sim                                                                                         | zero                                     | **não lê o texto**, só acha a região                                      | atrás de flag no Chrome/Edge; sem Safari/Firefox | fora                                                                                       |
| `onnxruntime-web` + PaddleOCR (`ppu-paddle-ocr`) | sim                    | não medido; o pré-processamento traz OpenCV, o mesmo problema de `new Function` da ADR-0065 | ≥ 13,6 MB só de runtime, mais os modelos | bom                                                                       | MIT, ativo                                       | fora — pesa 3× e reabre a CSP                                                              |
| Modelo pequeno de dígitos (ONNX/TF.js, MNIST)    | sim                    | provável                                                                                    | pequeno                                  | **não**: é dígito manuscrito isolado, sem detecção de linha nem de rótulo | treino nosso                                     | fora                                                                                       |
| `scribe.js-ocr`                                  | sim                    | não medido                                                                                  | 70 MB desempacotado                      | bom                                                                       | **AGPL-3.0**                                     | fora — a licença contamina o produto                                                       |
| OCR no servidor (API ou worker)                  | **não**                | —                                                                                           | —                                        | bom                                                                       | —                                                | fora — a foto sairia do aparelho só para sugerir; e o escritório perde a sugestão sem rede |

"Só manual" não é descartado: é o que acontece com a função desligada, com o modelo ainda
carregando, com a leitura falhando, e com qualquer candidato que não for único. O OCR é **atalho**
sobre ele, nunca substituto.

### 2. Como a dependência entra (T14)

- `tesseract.js` e `tesseract.js-core` entram como dependências **npm normais, com versão exata**
  (`7.0.0`), conferidas pelo lockfile — não há build próprio: diferente do OpenCV (ADR-0065 §2), o
  pacote publicado já roda sob a nossa CSP sem mudança. `@tesseract.js-data/eng` entra igual
  (`1.0.0`), só pelo modelo `4.0.0_best_int`.
- O código do app importa **só** `tesseract.js` (`createWorker`), por `import()` dinâmico, dentro de
  um serviço do módulo `trip` que só é chamado com o interruptor ligado. Nada de Tesseract no bundle
  inicial; a T14 mede o bundle antes e depois.
- O core, o worker e o modelo **não** passam pelo bundler. Um script de preparo copia de
  `node_modules` para `public/canhoto-ocr/<versão>/` (fora do Git, no molde de
  `scripts/fetch-background-removal.ts`, que faz o mesmo com o runtime do `onnxruntime-web`):
  `worker.min.js`, **todas** as variantes `tesseract-core*.wasm.js` do diretório (a biblioteca
  escolhe por aparelho entre simples, SIMD e relaxed-SIMD — a documentação exige o diretório
  inteiro) e `eng.traineddata.gz`. Sem download de URL externa: quem garante integridade é o
  lockfile.
- **R1 — o diretório é versionado.** `<versão>` é lida do `package.json` instalado do
  `tesseract.js-core` (e o caminho do modelo, do `@tesseract.js-data/eng`), nunca digitada. Como o
  service worker guarda por URL com `CacheFirst`, atualizar o pacote sem mudar o caminho serviria o
  core velho para sempre a quem já baixou. Contrato da T14: a versão no caminho que o serviço usa é
  igual à versão instalada em `node_modules`.
- **R7 — licenças e avisos vão junto.** O script copia para `public/canhoto-ocr/<versão>/` a
  `LICENSE` do `tesseract.js`, do `tesseract.js-core` e do `@tesseract.js-data/eng`, e os avisos de
  terceiros embutidos no core (Tesseract, Apache-2.0; Leptonica, licença própria estilo BSD). **Sem
  `trustedDependencies`**: o `tesseract.js` declara `postinstall` (`opencollective-postinstall`) e
  o Bun não o roda, o que é o desejado. As dependências transitivas (`node-fetch`, `idb-keyval`,
  `zlibjs`, `bmp-js`, `is-url`, `regenerator-runtime`, `wasm-feature-detect`) entram no lockfile e
  ficam registradas no `evidence.md` da T14; nenhuma é importada pelo nosso código.
- Configuração fixa: `workerPath`, `corePath` e `langPath` na própria origem, `workerBlobURL: false`,
  `gzip: true`, `cacheMethod: 'none'` (quem guarda é o service worker, uma política de cache só, e
  nada de cópia paralela em IndexedDB).
- Service worker: `**/canhoto-ocr/**` em `globIgnores` (fora do precache, como o recorte de fundo e o
  OpenCV) e regra `runtimeCaching` `CacheFirst` própria (`transportada-canhoto-ocr`, `maxEntries`
  para as variantes de core + modelo). A primeira leitura baixa, as seguintes rodam offline.
- **R3 — compressão e cache no servidor.** O script de preparo gera `.br` e `.gz` de cada
  `.wasm.js` e do `worker.min.js`, e o `server.ts` serve o pré-comprimido (já faz para o resto do
  `dist`) com `Cache-Control` de arquivo imutável sob `/canhoto-ocr/<versão>/` — o caminho
  versionado (R1) é o que torna o imutável seguro. O `.traineddata.gz` já vem comprimido e sai como
  está; o `.wasm.js` escolhido cai de 3,90 MB para 1,46 MB com gzip -9.
- CSP e Permissions-Policy **não mudam**. Contrato da T14: nenhum `workerBlobURL` diferente de
  `false`, nenhuma URL de CDN (`jsdelivr`, `unpkg`) nas opções, e a CSP igual à de hoje.

### 3. Regra de aceitação do candidato

1. A leitura roda sobre a foto já capturada (o mesmo quadro do comprovante), só quando o código de
   barras não achou a chave (D6.1 vem antes).
2. **R2 — formato fechado.** O texto é lido inteiro (sem whitelist), e do número só vale o token
   no formato impresso do DANFE, `\d{3}\.\d{3}\.\d{3}`, depois do rótulo (`Nº`, `N°`, `NO`,
   `NUMERO`); da série, os dígitos depois de `SÉRIE`/`SERIE`. Token fora do formato é leitura
   inconclusiva — não se "conserta" dígito faltando. Zeros à esquerda não contam na comparação.
3. **R2 — confiança por palavra.** Cada palavra do número tem de passar de uma confiança mínima do
   Tesseract (`words[].confidence`). O limiar **não** é chutado: começa conservador na T14 e o valor
   final sai da validação do §6.
4. O número lido é comparado **só** com as notas **daquela viagem**. Com a série lida, número e série
   têm de bater juntos. **R4 — a unicidade conta todas as notas da viagem**, selecionadas ou não, sem
   as liberadas (`released_at`): uma nota fora da seleção com o mesmo número torna a leitura ambígua.
5. **Exatamente uma** nota casa → ela vira a sugestão do passo, marcada como "lida pela foto", e a
   pessoa confirma. **R2 — a sugestão mostra o número lido ao lado da nota sugerida**, para a pessoa
   comparar os dois e não confirmar de olhos fechados. Se for outra nota da seleção, o assistente
   oferece trocar (ADR-0067 §4).
6. **Zero ou mais de uma** → cai na escolha manual, sem aviso de bloqueio. O bloqueio "este canhoto é
   da nota X, que não está nesta viagem" é da chave de acesso (tem dígito verificador); um número
   lido por OCR fora da viagem é, antes de tudo, suspeita de leitura errada.
7. **R4 — número que casa com nota da viagem fora da seleção → escolha manual**, sem bloqueio. O
   bloqueio `onTripNotSelected` (spec 156 T10) é da chave de acesso; pelo OCR, é exceção ao bloqueio
   da ADR-0067 §4 (registrada na spec, D6).
8. **Erro na leitura do interruptor** (`GET /trips/field-delivery-settings` falhando) ou na carga do
   motor → escolha manual, sem OCR e sem aviso que trave o passo.
9. **Nunca grava sozinho.** A leitura só muda qual nota o passo sugere; gravar continua sendo o toque
   da pessoa no passo e a confirmação final, como em toda baixa do escritório.

### 4. Peso

| Arquivo                                                        | Bruto                   | Na rede      |
| -------------------------------------------------------------- | ----------------------- | ------------ |
| `tesseract.min.js` (chunk sob demanda)                         | 61,5 KB                 | 10,4 KB gzip |
| `worker.min.js`                                                | 108,7 KB                | 33,6 KB gzip |
| `tesseract-core-simd-lstm.wasm.js` (uma variante por aparelho) | 3,90 MB                 | 1,46 MB gzip |
| `eng.traineddata.gz` (`4.0.0_best_int`)                        | 2,95 MB (já comprimido) | 2,95 MB      |
| **Primeira leitura**                                           | ~7,0 MB                 | **~4,5 MB**  |

O disco do deploy leva as seis variantes `.wasm.js` do core (~24 MB), mas cada aparelho baixa uma. O modelo
`best_int` foi escolhido sobre o `4.0.0` (10,4 MB): mesma leitura na sonda, 3,5× menor, carga 2,5×
mais rápida.

### 5. A imagem não sai do aparelho

Nenhum quadro, recorte ou texto lido vai para a rede nem para log. O que sobe é o que já subia: a
foto do comprovante, na nota que a pessoa confirmou. Sem gravação nova de "proposta do OCR" — a
validação (§6) é por protocolo, não por histórico no banco, e isso fica assim até ela pedir mais.

### 6. Experimental, desligada por padrão, validada depois

- **Selo "Experimental"** ao lado da sugestão lida pela foto e no painel do interruptor.
- **Interruptor por empresa** em `company_delivery_proof_settings.canhoto_ocr_enabled`
  (`boolean not null default false`), lido e escrito pela configuração do comprovante
  (`settings.manage`). Padrão `false` em todo ambiente; sem linha gravada vale `false`.
- **O escritório lê só o interruptor**, por `GET /trips/field-delivery-settings`, com a permissão de
  quem dá a baixa (`trip.report-on-behalf`) — a configuração inteira do comprovante segue
  `settings.manage`. É o molde de `GET /nfe-package-boxes/measurement-settings` (`cargo.measure`,
  spec 152 D14).
- **Critério para tirar o selo** (espelho da spec 152 D16): com a função ligada em staging, o
  usuário passa **pelo menos 50 canhotos destacados reais**, de **pelo menos 3 emitentes** (leiautes
  de DANFE diferentes), em **2 aparelhos** (o computador do escritório com a webcam e um celular) e
  **2 condições de luz**. Para cada canhoto anota a nota verdadeira, o número lido e o que a sugestão
  mostrou (nenhuma, a certa, outra). **R2 — ao menos uma viagem de teste tem notas de números
  consecutivos** (…455, …456, …457): é o caso em que um dígito mal lido cai numa nota vizinha que
  existe, e é ele que o critério precisa ver.
  - **Go**: **zero** sugestão de nota errada **e** sugestão certa em **≥ 70%** dos canhotos → a task
    de revisão tira o selo e o usuário decide ligar em produção.
  - **No-go**: continua experimental e desligada em produção; o relatório diz em que leiaute, aparelho
    e luz errou, e a próxima ação (recorte guiado da tira, pré-processamento, modelo `por`, desistir)
    volta ao usuário.
  - Uma sugestão errada já é no-go, mesmo com cobertura alta: é o modo de falha que a regra do §3
    existe para impedir, e o que a pessoa tende a confirmar sem ler.
  - **R2 — o limite do que 50 canhotos provam.** Zero erro em 50 só garante, com 95% de confiança,
    taxa de sugestão errada abaixo de ~6% (regra dos três: 3/50). O critério não prova que o OCR
    não erra; **a rede é a confirmação humana** do §3, e é por isso que a sugestão mostra o número
    lido.

## Consequências

- O canhoto destacado ganha identificação automática sem abrir a CSP e sem mandar imagem para fora.
- A primeira leitura custa ~4,5 MB de rede, pagos só por quem tem a função ligada e só na primeira
  vez por aparelho.
- A T14 implementa exatamente o §2 e o §3; o plan.md e o tasks.md apontam para o §3 quanto à
  leitura (texto inteiro, extrair depois de `Nº`/`SÉRIE`).
- **R8 — rota sem `rateLimit`.** `GET /trips/field-delivery-settings` é leitura barata de um booleano,
  autenticada e por empresa, sem teto por usuário — registrada em `docs/SECURITY.md`, como as demais
  leituras de configuração.
- Nenhum pacote entra no `package.json` na T13.

## O que reabriria esta decisão

- `TextDetector` (ou sucessor) com leitura de texto estável no Chrome **e** no Safari: zero peso.
- A validação reprovar o Tesseract no canhoto real depois de recorte guiado e pré-processamento.
- Uma versão do `tesseract.js` que volte a exigir worker `blob:` ou `eval`: fixa-se a anterior e se
  reavalia.
