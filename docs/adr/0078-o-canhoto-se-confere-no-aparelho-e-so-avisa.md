# ADR-0078 — O canhoto se confere no aparelho do motorista, e só avisa

- **Status:** proposta
- **Data:** 2026-09-25
- **Decisores:** usuário ("precisamos de verificação da foto do canhoto — hoje o importante é a foto
  do canhoto", 2026-09-25); revisão do `critic` (opus) em 2026-09-25 (C1, M1–M7)
- **Fecha:** a spec 194 (`specs/194-o-canhoto-se-confere-no-aparelho/`)
- **Emenda:** ADR-0069 (o OCR do número passa a rodar também na app do motorista, com outra regra de
  comparação) e ADR-0075 §4 (CSP) e §5 (service worker e orçamento de precache)
- **Mantém:** ADR-0070 (a entrega do motorista nunca é recusada por falta de foto) e spec 159 T11 item 6
  (a foto grava no IndexedDB **antes** de qualquer espera)
- **Precedentes:** ADR-0065 (wasm pesado sob demanda, selo experimental, interruptor por empresa),
  ADR-0067 §4 (a foto identifica, a pessoa confirma), spec 152 D9 (motivos como códigos fechados)

## Contexto

A foto do canhoto é o comprovante que o escritório usa para fechar a entrega e o que o cliente cobra
quando falta. Hoje a app do motorista (`apps/frontend-driver`) aceita qualquer imagem: o recorte
(`proofCrop.service.ts`, spec 082 D5) sugere a borda do papel, mas foto tremida, escura, estourada, sem
papel, de outra nota ou com o canhoto em branco entra calada e só é descoberta dias depois.

O painel já lê o número do canhoto no aparelho (ADR-0069, spec 156 T14), mas a app do motorista nasceu
proibindo isso: o `dist.contract.test.ts` recusa `tesseract`/`canhoto-ocr` em qualquer arquivo do
`dist`, o `sw.ts` tem uma rota só, a CSP tem `script-src 'self'` sem `'wasm-unsafe-eval'`, e o
`server.ts` não serve pré-comprimido. O interruptor `company_delivery_proof_settings.canhoto_ocr_enabled`
existe, mas não entra no snapshot do motorista.

Restrições:

1. **A entrega nunca trava** (ADR-0070). Verificação é aviso.
2. **A foto nunca espera em memória** (spec 159 T11 item 6). A foto de `capture` não fica na galeria do
   celular: se ela só existir na memória da aba enquanto um aviso espera resposta, fechar a app, uma
   atualização do SW ou o `keycloak.init` da volta de rede a perdem. E `setCropFile(null)` desmonta o
   `ProofCrop`, cujo `close('crop')` dispara `onIdle` na hora (`captureRegistry.service.ts`) — janela em
   que a página pode navegar.
3. **O pátio é 3G** (spec 189 RNF). O precache continua ≤ 1,5 MiB.
4. **A imagem não sai do aparelho** (ADR-0069 §5).

## Decisão

### 1. Grava primeiro, avisa depois

Nenhuma verificação fica entre a foto e a fila. O `onConfirm` do `ProofCrop` (confirmar recorte ou
"Usar sem recorte", câmera ou galeria) abre `proof-check` no `captureRegistry` **antes** de desmontar o
recorte, chama `attach('photo')` — que grava no IndexedDB como hoje — e só então roda a verificação
sobre o mesmo arquivo. O resultado aparece **no cartão da entrega**, ao lado da miniatura "Anexada",
com:

- **"Tirar outra"**: abre a mesma origem (câmera ou galeria). A foto nova entra na fila **substituindo**
  a anterior numa única escrita do IndexedDB (a antiga só sai quando a nova já está gravada); se a
  antiga já subiu, a API guarda a nova pelo upsert do comprovante (índice único por evento e tipo) com
  a **pior** pontualidade das duas (`mergeProofPunctuality`, spec 159 D3b). Cancelar a câmera não mexe
  em nada.
- **"Manter"**: some o aviso.

| Verificação             | Motor                                    | Custo                   | Quando                                                      |
| ----------------------- | ---------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| Qualidade (fase 1)      | TypeScript puro, sem pacote              | zero de rede            | logo depois de a foto estar gravada                         |
| Assinatura (fase 3)     | TypeScript puro, heurística              | zero de rede            | junto da qualidade, só em tira horizontal de canhoto        |
| Número da NF-e (fase 2) | `tesseract.js` 7 (ADR-0069), sob demanda | ~4,5 MB na primeira vez | depois de `enqueueAttachment` aceitar, com prazo total 20 s |

### 2. Qualidade: códigos fechados, sem dependência, calibrados antes de publicar

Coerente com `detectDocumentBounds` (spec 082): **região clara ocupando quase tudo é documento bem
enquadrado**, não problema. Códigos:

| Código        | Condição (limiar provisório até a calibração)                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noDocument`  | na grade do original: `p95 − p5 < 30` **ou** fração clara (acima de `(p5 + p95) / 2`) abaixo de 5% **ou** caixa clara com proporção implausível (lado menor < 8% do lado correspondente) |
| `documentCut` | a região clara **contínua** encosta nas duas laterais **e** há texto (transições escuras) a menos de 2% da borda — o texto foi cortado                                                   |
| `blurry`      | variância do Laplaciano de 4 vizinhos num recorte central de até 1024 × 1024 px em **resolução nativa** abaixo do limiar                                                                 |
| `tooDark`     | luminância média do papel abaixo do limiar                                                                                                                                               |
| `lowContrast` | desvio da luminância do papel abaixo do limiar (papel claro, texto apagado ou reflexo)                                                                                                   |
| `overexposed` | fração de pixels ≥ 250 no papel acima do limiar                                                                                                                                          |

Os valores iniciais (luz 60, contraste 20, Laplaciano 60) vêm da spec 152, cuja validação com dado
real (T15) **nunca rodou**, e `overexposed` não tem fonte. Por isso **nenhum limiar vai a staging sem
calibração**: a spec 194 T1.2b roda o serviço sobre ≥ 40 fotos reais rotuladas pelo usuário e só
publica com aviso em ≤ 20% das fotos boas. Um interruptor em código (`PROOF_PHOTO_CHECK_ENABLED`)
desliga a fase inteira num commit. Produção só depois da validação de campo (T5.4).

A detecção é **reescrita** num serviço novo: `proofCrop.service.ts` é cópia por valor do painel e
continua idêntico a ele.

### 3. Assinatura: heurística honesta, sem OCR

- Só roda quando a foto aceita é uma **tira horizontal** (largura ≥ 3× a altura). DANFE inteiro, tira
  vertical (canhoto de DANFE paisagem) ou quadrada → `inconclusive`, sem aviso.
- Região proporcional do leiaute padrão do DANFE retrato: a célula "Identificação e assinatura do
  recebedor", à direita de "Data de recebimento" e à esquerda do quadro "NF-e Nº" (x de 25% a 78%,
  metade inferior da tira). Sem âncora pelo OCR — ele roda depois e em segundo plano.
- Mede a fração de pixels escuros (limiar adaptativo pela luminância da própria região), descontando
  linhas e colunas escuras em quase toda a extensão (borda de tabela) e a faixa superior do rótulo.
- Abaixo do limiar → `absent` → motivo `signatureMissing`, com selo "Experimental". Nunca "assinatura
  válida": carimbo, rubrica e rabisco contam igual.

Limitações: leiaute varia por emissor; carimbo conta como tinta; lápis fraco pode não contar; DANFE
paisagem não é avaliado.

### 4. OCR na app do motorista: mesmo motor, mesmo interruptor, outra comparação

- **Interruptor:** o mesmo `canhoto_ocr_enabled`, padrão `false`, passa a viajar no snapshot
  `GET /me/trips/current` como `data.canhotoOcrEnabled` (a policy dizia que não; esta ADR corrige).
  Ausente ou inválido → `false`.
- **Motor:** as mesmas versões exatas e a mesma configuração da ADR-0069 §2, por cópia por valor.
- **Imagem entregue ao Tesseract:** a foto aceita, decodificada e reduzida para no máximo 2000 px no
  lado maior (nunca ampliada). Tira vertical (altura ≥ 3× largura) é lida girada 90° num sentido e, se
  inconclusiva, no outro, dentro do mesmo prazo. Com "Usar sem recorte", lê a foto inteira reduzida.
- **Prazo total de 20 s** contados do aceite (carga do motor + leitura), não só do `recognize`.
  Estourou → resultado descartado.
- **Disparo:** só depois de `enqueueAttachment` devolver `accepted`, amarrado à `attachmentKey` que
  `attachProof` passa a devolver. Foto trocada antes do fim → resultado descartado.
- **Pré-carga:** com o interruptor ligado, rede e sem `saveData`, a app aquece o cache do SW com os
  arquivos do motor quando a viagem abre (sem criar o worker); o worker nasce na primeira foto.
- **Comparação:** o motorista fotografa o comprovante **de uma nota conhecida**. O número lido (token
  `\d{3}\.\d{3}\.\d{3}` depois do rótulo, confiança por palavra, ADR-0069 §3) é comparado com a nota do
  comprovante e com as outras da mesma parada: `matched` (selo "Número confere · Experimental"),
  `otherStopDocument` ("parece ser da nota Y desta parada"), `mismatch` ("parece ser de outra nota:
  lido X, esperado Y"), `unread` (nada aparece). Um dígito mal lido gera `mismatch` falso: custo aceito
  de avisar sem bloquear, medido na validação.
- **Onde aparece:** num componente do nível da página, chaveado por `documentId`, porque a
  `DeliveryProofSection` desmonta quando a pendência entra na fila. No cartão da parada, com "Tirar
  outra"/"Manter"; na tela de pendências, só informativo (`matched`/`mismatch`).

### 5. Onde o peso mora (emenda à ADR-0075 §5)

- Arquivos do motor em `public/canhoto-ocr/<versão>/` (fora do Git, gerados no `prebuild`/`predev`).
- O chunk `assets/tesseract-ocr-*.js` (~16 KB) **entra no precache** e **não** é `modulepreload` do
  `index.html`: sem ele no cache, o OCR não funcionaria sem rede.
- `dist.contract.test.ts`: precache ≤ 1,5 MiB; nenhuma URL do precache casa `canhoto-ocr`; `tesseract`
  no precache só o chunk acima, com teto de 32 KB; **fora de `canhoto-ocr/<versão instalada>/`** e do
  chunk, nenhum arquivo casa `canhoto-ocr|tesseract`; `opencv|background-removal|maplibre|pdfjs`
  continuam proibidos em qualquer arquivo.
- `injectManifest.globIgnores` recebe `**/canhoto-ocr/**`.
- O `sw.ts` ganha uma segunda rota: `CacheFirst` só para `/canhoto-ocr/<versão>/` na própria origem
  (`transportada-driver-canhoto-ocr`, `maxEntries: 12`, só status 200). Continua sem `sync` e sem
  cache de API.
- O `server.ts` serve `.br`/`.gz` pré-comprimidos com `Vary: Accept-Encoding` e cache imutável sob
  `/canhoto-ocr/<versão>/`.

### 6. CSP (emenda à ADR-0075 §4)

O WebAssembly do Tesseract compila **dentro do worker**, e um worker da própria origem carregado por
URL segue a CSP da resposta do próprio script. **Preferência:** o documento continua com
`script-src 'self'`, e só as respostas de `/canhoto-ocr/<versão>/` saem do `server.ts` com
`script-src 'self' 'wasm-unsafe-eval'`. A T2.2 sonda isso no Chromium e no WebKit do Playwright; se
algum recusar, cai para `'wasm-unsafe-eval'` no documento (a diretiva do painel, ADR-0042/0069). Em
qualquer dos dois: nada de `blob:` em `worker-src`, `'unsafe-eval'` ou CDN, e registro em
`docs/SECURITY.md`. iOS < 16: o motor falha → `unread`.

### 7. O que sobe para a API

Fases 1–3: nada novo sobe; o multipart continua o mesmo (com `latitude`/`longitude`, spec 196). A fase
4, opcional e dependente de aprovação do usuário, grava códigos fechados em `trip_delivery_proofs`
(nunca imagem, grade, texto OCR além dos dígitos, nem confiança), depois da migration da spec 193 na
mesma tabela. Nada entra na nota do motorista (ADR-0070) sem decisão nova.

## Alternativas rejeitadas

| Alternativa                                           | Por que não                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Avisar **antes** de gravar (foto em memória)          | Contraria a spec 159 T11: foto de câmera não fica na galeria, e fechar a app ou navegar a página no aviso a perde |
| Bloquear a foto ruim                                  | ADR-0070                                                                                                          |
| Publicar com os limiares da 152 sem calibrar          | A validação da 152 nunca rodou e `overexposed` não tem fonte; aviso falso demais ensina o motorista a ignorar     |
| `>95%` claro como `documentCut`                       | Inverte o `detectDocumentBounds`: claro ocupando tudo é o documento bem enquadrado                                |
| Nitidez na grade reduzida a 640 px                    | Reduzir esconde o tremido                                                                                         |
| OCR/qualidade no servidor                             | O aviso chegaria depois de o motorista ir embora, e reabre a ADR-0069 §5                                          |
| OpenCV para Laplaciano e bordas                       | 3 MB e build próprio (ADR-0065) para contas de dez linhas                                                         |
| Chunk do Tesseract fora do precache                   | Sem rede, o `import()` falha e o OCR "offline" é falso                                                            |
| Rota `/me/field-delivery-settings` para o interruptor | Mais uma leitura que falha sem sinal; o snapshot já é o canal offline                                             |
| Âncora da assinatura pela caixa de palavra do OCR     | O OCR roda depois e em segundo plano; a âncora seria código morto no primeiro aviso                               |
| Comparar o número com todas as notas da viagem        | O motorista fotografa o comprovante de uma nota conhecida; a viagem inteira só aumenta o falso "confere"          |

## Consequências

- O motorista descobre a foto ruim na porta do cliente, sem nunca arriscar a foto que já tirou.
- A app ganha uma rota de cache em runtime e `'wasm-unsafe-eval'` (no worker, ou no documento se a
  sonda reprovar). Os contratos ficam mais estreitos, não removidos.
- A imagem Docker cresce ~44 MB; o precache cresce só o chunk de ~16 KB.
- "Tirar outra" depois de sair da parada conta a hora e o lugar da foto nova, e a pior pontualidade
  vence: a tela avisa isso.
- O interruptor `canhoto_ocr_enabled` passa a valer para o escritório e para o motorista.

## O que reabriria esta decisão

- A calibração ou a validação de campo mostrar aviso de qualidade em mais de 1 de cada 5 fotos boas.
- O OCR dar "Número confere" para nota errada na validação (no-go imediato).
- `TextDetector` com leitura de texto no Chrome e no Safari.
- O usuário decidir que aviso ignorado pesa na nota do motorista (fase 4 + emenda à ADR-0070).
