# Spec 152 — Medir a caixa pela câmera

- Status: aprovada para implementação como **experimental** (revisão de 2026-09-15, D13–D19)
- Data: 2026-09-15
- Módulos: `apps/frontend-transportada` (`nfe-workspace`, `components/ui`) · `apps/api-transportada`
  (`nfe-documents`)
- Herda: spec 085 G005 (fila de medição, `cargo.measure`, D5/D8), spec 055 + ADR-0042 (leitor de
  etiqueta), spec 094 (restrições da caixa), spec 144 (caixa presumida pela nota), spec 145 (a planta
  é do worker), spec 151 (o GTIN da caixa, `nfe_package_boxes.carton_gtin`, gravado na importação e
  com backfill em produção: é por ele que a etiqueta lida casa com a caixa)
- Depende de: a correção do leitor em `work/leitor-etiqueta` (leitor em diálogo de tela cheia, com
  guia e faixa de leitura, e a caixa lida abrindo em modo de medição). **Já está em `staging`** (T0,
  `1f61c4a5`).

## Revisão de 2026-09-15 — experimental, sem esperar a sessão com caixas reais

Decisão do usuário: a medida pela câmera é construída **agora**, como função **experimental**, e a
sessão com caixas reais deixa de ser o portão de construção. O que muda, em resumo:

| Antes                                               | Agora                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| T1 (sessão real, go/no-go) antes de qualquer código | Validação **depois** da implementação, com a própria tela e o export do histórico (D16, T15)                                 |
| O go/no-go decidia construir                        | O mesmo critério decide **tirar o selo** e **ligar em produção** (D16)                                                       |
| Sem interruptor                                     | Liga/desliga por empresa, em `company_cargo_settings`, sem deploy; padrão desligado (D14)                                    |
| Sem selo                                            | Selo "Experimental" e texto de estimativa na tela de medição (D13)                                                           |
| Limites 10/30 mm "até o spike"                      | Limites **provisórios** até a validação, e visíveis como tal (D15)                                                           |
| Origem `manual`                                     | Origem `typed` (nome pedido pelo usuário; `manual` sai do contrato antes de existir) (D8 revista)                            |
| Histórico só com a medida gravada                   | Histórico com a **proposta da câmera** e a medida gravada, para a validação comparar as duas (D17)                           |
| OpenCV baixado ao entrar na etapa Medida            | Pré-carga ao abrir o fluxo com a função ligada, cache próprio no service worker, digitação disponível enquanto carrega (D18) |

O motivo de fundo: a medida nunca grava sem o operador (D5), a digitação continua sendo o caminho
padrão e o interruptor desliga tudo sem deploy. O risco de construir antes de medir é **retrabalho**,
não medida errada na planta — e a validação com a tela real mede o que o spike mediria, com menos
código descartável.

## Problema

O conferente mede a caixa com fita e digita três números por caixa, de pé no galpão, com o celular
numa mão e a fita na outra (comentário de `PackageBoxMeasurementPanel`). A fila da spec 085 diz o
que medir primeiro (12 caixas cobrem 25% dos volumes, 206 cobrem 80%), mas cada linha continua
custando fita, leitura, conversão de cabeça e digitação. É aí que entram os erros de ordem de
grandeza (38 virando 38 mm, por exemplo) e as medidas nunca feitas.

Essas medidas alimentam a planta de carga (`@adatechnology/cargo-placement`, spec 145). Caixa sem
medida entra como presumida (spec 144), e com medida errada o empacotador erra o baú. Deixar caixa
de fora com `bedFull` e baú pela metade é o defeito nº 1 do produto. Medir mais caixas, e medir
certo, é a entrada que esse defeito precisa.

## Resultado esperado

Na mesma sessão de câmera, o conferente lê a etiqueta da caixa, confirma o produto e mede C×L×A pela
câmera. A tela mostra cada medida com a margem estimada (±cm) e avisa quando a leitura não é
confiável. O conferente confirma ou corrige digitando, e só então grava. Em seguida, a câmera volta
para a próxima etiqueta da pilha. Aparelho que não consegue medir cai no formulário digitado, já
aberto, da caixa lida. Nenhuma medida grava sem o operador confirmar, e cada medida gravada guarda a
própria origem e margem.

## Usuários

- **Conferente / separador com `cargo.measure`**: está com a caixa na mão ou na pilha, usa o celular
  (Android ou iPhone) e às vezes usa luvas. A luz do galpão é irregular. Mede em sequência.
- **Quem audita a carga** (gestor da operação): precisa saber se a medida que sustentou a planta foi
  digitada ou lida pela câmera, e com que margem.

## Pesquisa de viabilidade (resumo)

Pesquisa completa com fontes em `plan.md` § "Pesquisa". Três abordagens comparadas:

| Abordagem                                                                                                     | Precisão esperada (caixa 30–80 cm)                                                                                                         | Aparelhos                                                                                                             | Dependência / CSP                                                                                                                    | Veredito               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **A. Marcador impresso de tamanho conhecido (ArUco) + OpenCV.js**, foto oblíqua, cantos confirmados por toque | ±0,5–1 cm no plano do marcador (C, L); ±1–2 cm na altura, pela projeção da aresta vertical com a pose do marcador. **A validar no spike.** | Qualquer navegador com câmera: Chrome Android, Samsung Internet, Safari iOS, Firefox                                  | OpenCV 5 em **build próprio** sem execução dinâmica (ADR-0065; o `@techstark/opencv-js` pede `'unsafe-eval'`), carregado sob demanda | **Recomendada**        |
| B. WebXR `immersive-ar` + `hit-test` (+ `depth-sensing`)                                                      | ~1–3 cm em boa luz e textura, sem número oficial. Piora em superfície lisa                                                                 | Só Chrome/Samsung Internet Android com ARCore certificado. **Nenhum iPhone** (Safari não expõe AR imersivo em iPhone) | Nenhuma lib. Precisa de `xr-spatial-tracking` na Permissions-Policy                                                                  | Descartada no MVP (D2) |
| C. Profundidade monocular por rede neural (ONNX/TF.js)                                                        | Não é métrica: a escala é ambígua sem referência                                                                                           | Universal em tese, pesado na prática                                                                                  | Modelo de dezenas a centenas de MB                                                                                                   | Descartada             |

Referência de expectativa: apps nativos com **LiDAR** chegam a ±0,5–1 cm, mas a web não tem API de
LiDAR nem de profundidade (`mediacapture-depth` foi descontinuada em 2022). Por isso o teto realista
de um PWA é o da abordagem A.

## Decisões

**D1 — A abordagem é a do marcador impresso + OpenCV.js.** Três motivos:

1. É a única que funciona no iPhone. Metade da frota de um PWA é Safari (ADR-0042), e foi esse o
   motivo para o leitor de etiqueta ter um decodificador próprio.
2. Usa o **mesmo `MediaStream`** do leitor de etiqueta, então as duas etapas vivem numa sessão de
   câmera só, sem reabrir permissão (D4).
3. A margem sai calculável: a pose do marcador dá o erro de reprojeção, e a incerteza dos cantos se
   propaga até cada dimensão (D7). Com WebXR, a margem seria um palpite sobre o hit-test.

**D2 — WebXR fica fora do MVP, e por escrito.** Ela exclui todos os iPhones. Também não compartilha
o stream: a sessão `immersive-ar` toma a câmera, exige um gesto novo e, na primeira vez, um
consentimento de AR à parte. Isso quebra a transição etiqueta → medida pedida em D4. Se no futuro
entrar como "modo aprimorado Android", precisa de spec própria.

**D3 — O marcador é um cartão impresso pelo próprio app.** A tela oferece a página "Cartão de
medição" para imprimir: um ArUco `DICT_4X4_50` com id fixo e 150 mm de lado, uma régua de controle
de 100 mm e o texto "imprima em 100%, sem ajustar à página". Antes do primeiro uso, o conferente
confere a régua com a fita, uma vez. Folha A4 lisa e cartão ID-1 foram descartados:

- A4 lisa não tem identidade e se confunde com etiqueta branca e papel na caixa.
- O cartão ID-1 tem 85,6 mm: pequeno demais para escalar uma aresta de 80 cm sem ampliar o erro de
  canto.

⚠️ Marcador impresso em escala errada erra **todas** as medidas na mesma proporção, e calado. A
régua de controle existe por isso, e o spike mede esse efeito.

**D4 — Uma sessão de câmera, duas etapas.** O stream abre uma vez, na etapa **Etiqueta**, e só
fecha quando o conferente sai do fluxo. As etapas:

1. **Etiqueta.** É o leitor atual (guia, faixa de leitura, instrução "Aponte para o código de
   barras da caixa").
2. **Produto identificado.** Nome, código e `uCom` da caixa lida, com os botões "Medir esta caixa",
   "Não é esta — ler de novo" e "Digitar medida". Se a leitura casar com mais de uma caixa, a tela
   lista as candidatas para escolher. Se não casar com nenhuma, avisa e volta para Etiqueta.
3. **Medida.** O mesmo vídeo, com a instrução "Coloque o cartão de medição sobre a caixa e
   enquadre a caixa inteira, de cima e de lado".
4. **Conferência.** O formulário da caixa, preenchido com o que a câmera leu, as margens e os
   avisos.

"Voltar para a etiqueta" existe em toda etapa e não fecha a câmera. Depois de gravar, o fluxo volta
sozinho para Etiqueta, para medir a pilha em sequência. O ciclo de `cameFromScan` continua valendo.

**D5 — A câmera propõe, o operador grava.** A medida da câmera **só preenche** o formulário. Gravar
é sempre o botão de salvar, tocado pelo conferente, e nenhum caminho grava sozinho. Os três campos
continuam editáveis. Editar um valor que veio da câmera muda a origem para `camera_adjusted` (D8).

**D6 — Tolerância.** Por dimensão, com margem estimada `m` (±, em mm):

| Faixa         | O que a tela faz                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `m ≤ 10 mm`   | Medida confiável. Mostra o valor e "±1 cm".                                                                                                                              |
| `10 < m ≤ 30` | **Medida imprecisa.** Mostra o valor, a margem e o motivo. Salvar pede confirmação explícita da medida imprecisa ou oferece digitar.                                     |
| `m > 30 mm`   | **Sem leitura confiável.** O campo **não** é preenchido pela câmera e fica para digitar. Uma aresta de 30 cm com ±3 cm já erra 10%, e isso entra na planta como verdade. |

Os limites 10/30 mm são **provisórios** até a validação (D15, T15). Eles vivem numa constante única
e a validação pode recalibrá-los. Recalibração que afrouxar os limites volta ao usuário antes de
entrar. Racional do
10 mm: a planta trabalha em células de 5 cm, e um erro de até 1 cm por aresta cabe dentro de uma
célula mesmo somando duas arestas.

**D7 — A margem é calculada e é honesta.** Ela sai por propagação:

1. A incerteza de cada canto é o resíduo do refinamento subpixel, mais a precisão do toque.
2. O erro de reprojeção do marcador entra junto.
3. Uma simulação de Monte Carlo (N perturbações dos cantos) propaga essas incertezas até cada
   dimensão, e `m = 2σ`.
4. Soma-se um piso fixo de erro de impressão do cartão.

O critério de honestidade vem da validação (D16): em pelo menos 90% das medições reais, o erro
contra a fita tem de ficar dentro de `m`. A primeira implementação porta o motor do spike
(`spike/152-medir-caixa/src/{geometry,measurement,warnings}.ts`, 16 testes), com a pose em TS puro e
não por `cv.solvePnP`; os parâmetros de incerteza (0,3 px, 1,5 px, 10% de focal, piso de 2 mm +
0,2%) seguem como chutes iniciais até a validação. Margem que promete mais do que entrega é o modo de falha que a ADR-0044
§1 proíbe (número plausível sem aviso).

**D8 — Origem e margem viajam com a medida** (revista em 2026-09-15: `manual` passa a `typed`).
`nfe_package_boxes` ganha `measurement_source` (`typed` · `camera` · `camera_adjusted`, VARCHAR,
sem ENUM) e `measurement_margin_mm` (a maior das três margens, `null` quando digitada). Linhas
medidas antes desta spec ficam com a origem nula, que a tela lê como "origem não registrada", nunca
como `typed`. Hoje a tabela não tem nenhuma coluna de origem, autor, margem ou motivo (conferido em
`nfe.schema.ts` de `origin/staging`), então tudo entra por migration aditiva.

Toda gravação também gera uma linha append-only em `nfe_package_box_measurements`, com:

- as três medidas gravadas e as três margens;
- a proposta da câmera por dimensão, quando houve (D17);
- os motivos de aviso;
- se o operador confirmou uma medida imprecisa;
- o motor (`aruco-homography-v1`);
- quem gravou;
- quando.

A caixa continua com **uma** medida vigente: medir de novo substitui a anterior, como diz a regra da
spec 085. O histórico é auditoria, não segunda verdade.

**D9 — Motivos de imprecisão são códigos fechados.** A tela mostra cada um em texto, com ícone, e
nunca só por cor:

| Código           | Condição                                                     | Texto (pt-BR)                                                 |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `markerNotFound` | marcador não detectado no quadro                             | "Cartão de medição não encontrado"                            |
| `markerTooSmall` | lado do marcador abaixo de N px (longe demais)               | "Aproxime o celular"                                          |
| `steepAngle`     | ângulo entre câmera e face superior acima do limite          | "Incline menos o celular"                                     |
| `lowLight`       | luminância média ou contraste abaixo do limite               | "Pouca luz: acenda a lanterna ou vá para um lugar mais claro" |
| `blurry`         | nitidez (variância do Laplaciano) abaixo do limite           | "Imagem tremida: segure firme"                                |
| `boxOutOfFrame`  | canto tocado ou projetado a menos de X px da borda do quadro | "A caixa não está inteira no quadro"                          |
| `unstable`       | quadros seguidos divergem mais que o limite                  | "Leitura instável: segure firme"                              |

A mensagem de imprecisão segue o molde: "Medida imprecisa: ±X cm — aproxime, melhore a luz ou
digite a medida" + o motivo.

**D10 — Nenhuma imagem sai do aparelho.** O quadro é processado no navegador, num worker. Não há
upload, armazenamento nem telemetria da imagem. Só os números e os códigos de motivo chegam à API.

**D11 — O fallback é o formulário digitado da caixa lida, já aberto.** O fluxo cai nele quando:

- não há câmera, a permissão foi negada ou falta `WebAssembly`;
- o OpenCV não carrega;
- o aparelho é lento demais (o quadro analisado passa do orçamento);
- o conferente toca "Digitar medida".

Nesses casos o formulário abre com o produto já identificado, sem busca de novo. Digitar nunca deixa
de funcionar, a mesma regra do leitor de etiqueta.

**D12 — A captura é assistida, não automática.** O conferente congela o quadro ("Capturar") quando
o indicador está verde. Sobre a foto congelada, o app propõe os cantos da face superior e o pé da
aresta vertical, e o conferente confirma ou arrasta cada ponto, com lupa. Detectar a caixa sozinha
em papelão com fita, etiqueta e pilha atrás é o caso difícil da visão computacional, e quem sabe
onde está o canto é quem está olhando para a caixa. A detecção automática fica para spec futura,
depois que a validação medir a taxa de acerto.

**D13 — A câmera entra como experimental.** Enquanto a validação (D16) não aprovar:

- a tela de medição (etapas Medida e Conferência) mostra o selo **"Experimental"** com o texto "A
  medida pela câmera é uma estimativa. Confira com a fita antes de gravar; na dúvida, digite.";
- o selo é texto + ícone, nunca só cor, e é lido pelo leitor de tela junto com o título da etapa;
- nada grava sem o operador (D5), a imprecisão pede confirmação (D6) e "Digitar medida" existe em
  toda etapa depois da identificação;
- a digitação é o **caminho padrão**: função desligada, aparelho sem suporte, OpenCV ainda
  carregando ou falhando — em todos, o formulário digitado da caixa lida está a um toque (D11, D18).

O selo é uma constante única no frontend (`CAMERA_MEASUREMENT_IS_EXPERIMENTAL = true`). Só a T16
muda para `false`, e só depois do go da validação.

**D14 — Liga/desliga por empresa, padrão desligado em todo ambiente.** Nova coluna
`company_cargo_settings.camera_measurement_enabled boolean not null default false`, ao lado do peso
padrão por volume, na mesma tabela e sob `settings.manage`. Motivos da escolha:

1. **Sem deploy para desligar**: é dado, não build. Um `PUT` pelo painel apaga a função na hora.
2. **Padrão seguro e igual em todo ambiente** (A02:2025 — default inseguro é vulnerabilidade): o
   código não ramifica por `APP_ENV`. Staging não liga "por ambiente": liga **pelo painel**, na
   empresa de staging, depois da publicação (T14). Isso também exercita o próprio interruptor antes
   da produção. Ligar por env faria o comportamento de produção depender de uma variável que ninguém
   vê no painel.
3. **Instalação dedicada** (ADR-0021): cada transportadora é um deploy; em produção quem liga é a
   própria transportadora, e só depois de a T16 tirar o selo — até lá, ligar em produção é parada
   obrigatória com aprovação do usuário.
4. A tabela certa já existe: `company_cargo_settings` guarda o que estima a carga (peso por volume,
   spec 067). Medida de caixa é a mesma família. Não existe tabela genérica de feature flag, e esta
   spec não cria uma.

Configuração perto do efeito: o painel **"Medida pela câmera (experimental)"** mora na aba
`packageBoxes` do `nfe-workspace`, a mesma do `PackageBoxMeasurementPanel`, registrado em
`SETTINGS_PANEL_PLACEMENT` como `cameraMeasurement: { module: 'nfe-workspace', source:
'cameraMeasurementSettings', tab: 'boxes' }`, com contrato em `test/company-settings/tabs.contract.ts`.
⚠️ A implementação vence o texto: até a T14 este parágrafo dizia `cargoSettings`/`packageBoxes`, que
não existem no registro (T14 item M5).
Aparece só para `settings.manage`.

Quem mede tem `cargo.measure`, não `settings.manage` — e `GET /company-settings/cargo` exige
`settings.manage`. Por isso a leitura do interruptor pelo conferente é uma rota própria, só de
leitura: `GET /nfe-package-boxes/measurement-settings` (`cargo.measure`) →
`{ data: { cameraMeasurementEnabled } }`. Com a função desligada:

- a tela não mostra "Medir esta caixa", só "Digitar medida", e o OpenCV **nunca** é baixado;
- a API recusa `source: camera | camera_adjusted` com `422` (`PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED`):
  desligar precisa valer também para uma aba que ficou aberta antes do desligamento.

**D15 — Os limites de precisão são provisórios, e a tela diz isso.** 10 mm (confiável) e 30 mm (não
preenche) continuam em `MARGIN_RELIABLE_MM` / `MARGIN_UNRELIABLE_MM`, com um comentário de uma
linha "provisório até a validação da spec 152 (T15)". O texto do selo (D13) cobre o operador. A
validação pode **apertar** sem perguntar; **afrouxar** é parada obrigatória com o usuário.

**D16 — A sessão com caixas reais vira validação, e decide o selo — não a construção.** Depois da
implementação e da revisão, com a função ligada em staging, o usuário mede **pelo menos 20 caixas
reais** (30–80 cm), em **2 aparelhos** (um Android médio e um iPhone) e **2 condições de luz**, com
o cartão impresso pelo próprio app e conferido pela régua. Protocolo: em cada caixa, depois da
proposta da câmera, o conferente **digita o valor da fita em todos os campos** (mesmo quando igual)
e grava. O histórico guarda proposta e gravado (D17), e o painel de D14 exporta o período em CSV e
mostra o resumo.

- **Go** (erro `≤ 10 mm` em ≥ 80% das dimensões **e** `|erro| ≤ margem` em ≥ 90%): a T16 tira o selo
  e o usuário decide ligar em produção.
- **No-go**: a função continua experimental e desligada em produção; o relatório diz por dimensão,
  aparelho e motivo onde errou, e a próxima ação (recalibrar margem, build próprio, pedir foto mais
  oblíqua, desistir) volta ao usuário.
- Margem otimista (cobertura < 90%) é no-go mesmo com erro baixo: é o modo de falha da ADR-0044 §1.

**D17 — O histórico guarda a proposta da câmera ao lado do que foi gravado.**
`nfe_package_box_measurements` ganha `proposed_length_mm` / `proposed_width_mm` / `proposed_height_mm`
(nulos quando a câmera não propôs aquela dimensão). Sem isso, uma medida `camera_adjusted` perderia
o valor que a câmera leu, e a validação (e a observabilidade de depois) não teriam com o que
comparar. O cliente manda a proposta no bloco `camera`; a API não confia nela para nada além de
guardar (ela não entra na caixa).

**D18 — Desempenho num celular médio (revista na T1, ADR-0065).** O pacote npm do OpenCV não
inicia sob a CSP (o embind usa `new Function`) e pesa 3,9 MB gzip no chunk do Vite. O OpenCV é
**build próprio** (`deploy/opencv-build/`, `-s DYNAMIC_EXECUTION=0`, só os módulos do aruco): chunk
de **3,05 MB brutos; 0,89 MB com compressão (T8)** — o `server.ts` não comprime hoje —, artefato
versionado em `apps/frontend-transportada/vendor/opencv/`. Ainda é caro numa rede de galpão. Por
isso:

1. **Nunca no carregamento da página**: o chunk do OpenCV fica fora do `index` e fora do precache do
   PWA (mesmo precedente do `background-removal`, que tem 16 MB e está em `globIgnores`), e o
   artefato mora fora de `public/`.
2. **Pré-carga ao abrir o fluxo**: com a função ligada e `WebAssembly` presente, o worker começa a
   baixar e compilar o OpenCV quando o conferente abre "Ler etiqueta", em paralelo com a leitura da
   etiqueta. Com `navigator.connection.saveData`, a pré-carga espera o toque em "Medir esta caixa".
3. **Cache próprio no service worker**: `runtimeCaching` `CacheFirst` só para o chunk do OpenCV
   (nome com hash, portanto imutável), cache nomeado e com `maxEntries` pequeno para não acumular
   versões. Segundo uso sem rede.
4. **Resposta comprimida**: o `server.ts` precisa servir o chunk com gzip/brotli; se hoje não
   comprime, a T8 acrescenta (não é CSP nem Permissions-Policy).
5. **Digitar enquanto carrega**: a etapa Medida mostra `Skeleton` na forma do vídeo, o progresso, e
   "Digitar medida" ativo. Carga acima de 15 s → `engineFailed` → formulário digitado (D11).
6. O build próprio já é o caminho (ADR-0065). Emagrecer mais (`-Oz`, whitelist menor) só se a
   validação mostrar carga ruim no Android médio.

**D19 — Uma sessão de câmera exige extrair o stream do leitor.** Confirmado em `origin/staging`:
`useBarcodeScanner` abre o stream dentro do efeito e para as trilhas quando `isActive` vira `false`,
e hoje o painel reabre o leitor (stream novo) depois de gravar. Por isso `useCameraStream` (T7) é
pré-requisito da D4, e o leitor passa a aceitar `stream` injetado sem mudar os outros usos. A
pistola de bip (Enter, `4f9a4ef6`) continua levando à etapa **Produto identificado** sem câmera; se o
conferente então tocar "Medir esta caixa", o stream abre ali, uma vez.

## Requisitos e critérios de aceite

### R1 — Duas etapas na mesma sessão de câmera

- **Given** o conferente com `cargo.measure` abriu "Ler etiqueta", **When** a etiqueta casa com uma
  caixa, **Then** a tela mostra o produto identificado e "Medir esta caixa", com o mesmo
  `MediaStream` ativo (contrato: `getUserMedia` chamado **uma** vez em todo o ciclo etiqueta →
  medida → gravar → etiqueta).
- **Given** a etapa Medida, **When** o conferente toca "Voltar para a etiqueta", **Then** a etapa
  volta para Etiqueta sem fechar nem reabrir o stream.
- **Given** uma medida gravada que chegou pela câmera, **When** a gravação termina, **Then** o fluxo
  volta para Etiqueta, com a mensagem de sucesso anunciada em `aria-live`.
- **Given** a etiqueta que casa com 0 caixas, **Then** a tela avisa "Nenhuma caixa com este código"
  e continua em Etiqueta. **Given** a etiqueta que casa com 2 ou mais, **Then** lista as candidatas
  para escolher.
- **Given** qualquer saída do fluxo (fechar, `Esc`, desmontar), **Then** toda trilha do stream é
  encerrada, o worker termina e o `srcObject` é limpo.

### R2 — Medida com margem e aviso de imprecisão

- **Given** uma captura com as três margens `≤ 10 mm`, **Then** cada campo mostra o valor em cm e
  "±X cm", sem aviso.
- **Given** uma dimensão com `10 < m ≤ 30 mm`, **Then** a tela mostra "Medida imprecisa: ±X cm —
  aproxime, melhore a luz ou digite a medida" com o(s) motivo(s) de D9, ícone de aviso e texto. O
  contrato verifica que o aviso não depende só de cor: há texto e `role="alert"`.
- **Given** uma dimensão com `m > 30 mm`, **Then** esse campo fica vazio, com "Sem leitura
  confiável — digite a medida", e o foco vai para ele.
- **Given** uma medida imprecisa não editada, **When** o conferente toca Salvar, **Then** o app pede
  a confirmação explícita "Gravar medida imprecisa (±X cm)?" com as opções "Gravar assim" e "Digitar
  a medida". Nada é gravado sem essa escolha.
- **Given** a análise ao vivo, **Then** o motivo atual aparece como instrução na tela, atualizado no
  máximo a cada 500 ms, e é anunciado em `aria-live="polite"` sem repetir o mesmo texto.

### R3 — Nunca grava sem confirmação; sempre dá para digitar

- **Given** uma captura concluída, **Then** nenhuma requisição `PUT /nfe-package-boxes/:id` sai
  antes de o conferente tocar Salvar. O contrato conta as chamadas do client.
- **Given** o formulário preenchido pela câmera, **Then** os três campos e "unidades por caixa" são
  editáveis. Editar um valor muda a origem enviada para `camera_adjusted`.
- **Given** o botão "Digitar medida" em qualquer etapa após a identificação, **Then** abre o
  formulário digitado da caixa lida, com a origem `typed`.

### R4 — Fallback para aparelho sem suporte

- **Given** `getUserMedia` ausente ou negado, **Then** o comportamento é o de hoje: aviso e busca
  digitada.
- **Given** câmera ok mas sem `WebAssembly`, OpenCV que falha ao carregar, ou análise de quadro
  acima do orçamento (D11) em 3 quadros seguidos, **When** a caixa foi identificada, **Then** o fluxo
  abre o formulário digitado **daquela caixa**, com o aviso "Este aparelho não mede pela câmera —
  digite a medida". Sem erro genérico e sem voltar para a lista.
- **Given** qualquer navegador suportado, **Then** o OpenCV nunca é baixado no carregamento da página
  (contrato do bundle: o chunk não entra no `index` nem no precache do service worker). Com a função
  ligada, a pré-carga começa ao abrir o fluxo (D18); com a função desligada, nunca.
- **Given** a etapa Medida com o OpenCV ainda carregando, **Then** a tela mostra `Skeleton` e
  "Digitar medida" ativo; **When** a carga passa de 15 s, **Then** cai no formulário digitado da
  caixa lida.

### R5 — Origem e margem gravadas para auditoria

- **Given** o `PUT` com `source: "camera"` e o bloco `camera` (margens, motivos,
  `impreciseConfirmed`, `engine`), **Then** a caixa grava `measurement_source` e
  `measurement_margin_mm`, e o histórico ganha uma linha com o ator do token, as três medidas, as
  margens e os motivos.
- **Given** o `PUT` sem `source`, **Then** a origem é `typed` e o bloco `camera` é proibido. O
  corpo antigo continua válido (retrocompatível).
- **Given** `source: "camera"` com alguma margem acima de 10 mm e `impreciseConfirmed` ausente ou
  `false`, **Then** a API responde `400`, porque imprecisão sem confirmação não grava.
- **Given** `source: "camera"` com margem acima de 30 mm numa dimensão enviada, **Then** a API
  responde `400`, porque a câmera não pode ter proposto aquele valor (D6). Se o conferente digitou
  por cima, a origem é `camera_adjusted` e a regra não se aplica a essa dimensão.
- **Given** uma caixa de outra empresa, **Then** a API responde `404` e não grava o histórico
  (contrato de tenant).
- **Given** `GET /nfe-package-boxes`, **Then** cada item traz `measurementSource` e
  `measurementMarginMm`, e a linha medida mostra "pela câmera, ±X cm", "digitada" ou "origem não
  registrada".

### R6 — Precisão validada antes de tirar o selo (revisto em 2026-09-15)

- **Given** a validação T15 com pelo menos 20 caixas reais (30–80 cm, papelão com fita e etiqueta),
  em pelo menos 2 aparelhos (um Android médio e um iPhone) e 2 condições de luz, seguindo o protocolo
  de D16, **Then** o export do histórico registra, por dimensão, a fita (valor gravado), a proposta
  da câmera, o erro, a margem e os motivos, e o `evidence.md` guarda a tabela e o resumo.
- **Go:** erro `≤ 10 mm` em pelo menos 80% das dimensões e erro dentro da margem estimada em pelo
  menos 90% delas → T16 (tirar o selo; ligar em produção só com aprovação do usuário).
  **No-go:** a função segue experimental e desligada em produção, e o relatório volta ao usuário.
- Nenhuma tarefa de construção depende desta sessão.

### R7 — Liga/desliga por empresa (D14)

- **Given** uma empresa sem linha em `company_cargo_settings` ou com `camera_measurement_enabled =
false`, **Then** `GET /nfe-package-boxes/measurement-settings` devolve
  `cameraMeasurementEnabled: false`, a tela não oferece "Medir esta caixa" e nenhum pedido do chunk
  do OpenCV sai (contrato conta as requisições).
- **Given** a função desligada, **When** chega `PUT /nfe-package-boxes/:id` com `source` `camera` ou
  `camera_adjusted`, **Then** `422` `PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED` e nada grava. `typed` e
  o corpo antigo continuam gravando.
- **Given** `settings.manage`, **When** o painel liga ou desliga, **Then**
  `PUT /company-settings/cargo/camera-measurement` com `{ enabled }` grava e a próxima leitura
  reflete sem deploy. Sem `settings.manage` → `403`. `companyId` sempre do token.
- **Given** o `GET /company-settings/cargo`, **Then** a resposta ganha `cameraMeasurementEnabled`,
  sem mudar o que o peso padrão já devolve (retrocompatível).

### R8 — Selo experimental e export para validação (D13, D16)

- **Given** `CAMERA_MEASUREMENT_IS_EXPERIMENTAL = true`, **Then** as etapas Medida e Conferência
  mostram o selo "Experimental" com ícone e o texto de estimativa, e o contrato verifica que ele não
  depende só de cor.
- **Given** `settings.manage`, **When** o painel exporta um período, **Then**
  `GET /nfe-package-box-measurements?from=&to=` (cursor, `perPage` ≤ 100, só da empresa do token)
  alimenta o CSV com as colunas do spike (`caixa`, `dimensao`, `fita_mm`, `camera_mm`, `erro_mm`,
  `margem_mm`, `dentro_da_margem`, `motivos`, `origem`, `gravado_em`) e o resumo (% com erro ≤ 10 mm,
  % dentro da margem, n). A descrição do produto não entra no CSV — só o código e o GTIN.

## Requisitos não funcionais

- **Desempenho:** análise ao vivo em worker, a no máximo ~4 quadros/s em 720 px de largura (mesmo
  teto do leitor). Captura → proposta de cantos em até 1,5 s num Android médio.
- **Peso:** o chunk do OpenCV é carregado sob demanda (pré-carga ao abrir o fluxo com a função
  ligada, D18) e fica em cache no service worker depois do primeiro uso (runtime cache `CacheFirst`,
  fora do precache). Build próprio (ADR-0065): chunk de 3,05 MB brutos; 0,89 MB com compressão
  (T8 — o `server.ts` não comprime hoje) e carga de
  70–83 ms no worker (desktop, sob a CSP real); o pacote npm do spike eram 3,90 MB gzip e ~0,7 s. O
  celular médio é medido na T15.
- **CSP:** sem diretiva nova — **revisto na T1**: `'wasm-unsafe-eval'` sozinho **não** basta para o
  pacote npm, cujo embind usa `new Function` (`EvalError` na sonda). Basta para o build próprio com
  `-s DYNAMIC_EXECUTION=0` (ADR-0065), com o WASM embutido no JS e o worker em
  `new Worker(new URL(…), { type: 'module' })`, nunca por `blob:` (ADR-0042).
- **Permissions-Policy:** continua `camera=(self)`. Nenhuma permissão nova.
- **LGPD:** imagem não sai do aparelho (D10). O log da API não leva a medida inteira além do id da
  caixa e da origem.
- **a11y:** instruções em `aria-live`, aviso com texto e ícone, alvos de toque na
  `--control-height`, e pontos arrastáveis também movíveis pelo teclado (setas). O formulário
  digitado é o caminho equivalente completo.
- **i18n:** todo texto em `nfeWorkspace.locale.json` e `nfeWorkspace.en.locale.json`, pt-BR
  acentuado (`locale-accents.contract.ts`).

## Casos extremos

- Caixa maior que o quadro (acima de ~80 cm de aresta a 1 m): `boxOutOfFrame`. O conferente se
  afasta até o limite de `markerTooSmall`. Se não houver ponto que satisfaça os dois, a dimensão fica
  sem leitura confiável e é digitada.
- Caixa deformada ou estufada: o ponto confirmado pelo operador manda. O aviso não detecta isso, e a
  margem não cobre.
- Marcador dobrado ou impresso fora de escala: o erro de reprojeção sobe (motivo `unstable`/margem
  alta). A escala errada uniforme não é detectável na hora, e a régua de controle (D3) é a defesa.
- Lanterna: se `torch` estiver em `getCapabilities()`, a etapa Medida oferece o botão. Se não
  estiver, o botão não aparece.
- Duas sessões em abas diferentes: a câmera é exclusiva, e a segunda recebe `unavailable`/`denied`
  como hoje.

## Fora de escopo

- WebXR / modo aprimorado Android (D2).
- Detecção automática da caixa sem toque do operador (D12).
- Medir sem cartão de medição (profundidade monocular, abordagem C).
- Peso pela câmera. Restrições da caixa da spec 094 (empilhável, frágil, este lado para cima)
  continuam como estão.
- Enviar ou guardar a foto da caixa.
- Mudar a fila, a ordenação ou a cobertura da spec 085.
- Extrair o motor para `adatechnology-packages` (fica como follow-up se outro produto precisar).

## Riscos

- **Precisão real abaixo do esperado:** a validação (D16) decide o selo, e o no-go é resultado
  legítimo. Construir antes de medir arrisca retrabalho, não medida errada na planta: nada grava sem
  o operador, a imprecisão pede confirmação e a função nasce desligada.
- **Validação contaminada:** conferente que aceita a proposta sem digitar a fita faz o erro parecer
  zero. Protocolo explícito de D16, export filtrado pelo período da sessão, e a T15 descarta linhas
  `camera` sem fita anotada à parte.
- **Peso do OpenCV em aparelho fraco:** carregamento sob demanda + cache, e o build próprio da
  ADR-0065 (3,05 MB brutos; 0,89 MB com compressão (T8), contra 15,5 MB / 3,9 MB do pacote npm).
- **Cartão impresso fora de escala:** régua de controle, instrução de 100% e o spike mede o efeito.
- **Dependência do leitor em paralelo:** resolvida — o leitor novo já está em `staging` (T0).

## Dúvidas

Nenhum `[NEEDS CLARIFICATION]` aberto. D2 (sem WebXR), D3 (cartão impresso), D6/D15 (limites 10/30
mm provisórios) e D14 (padrão desligado, staging ligado pelo painel) são revisáveis pelo usuário. As
únicas tarefas que dependem da sessão com caixas reais são a validação (T15) e tirar o selo / ligar
em produção (T16).
