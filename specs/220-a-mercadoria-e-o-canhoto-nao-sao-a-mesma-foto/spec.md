# Feature 220 — A mercadoria e o canhoto não são a mesma foto

## Problema e resultado

A captura já sabe que são coisas diferentes. A configuração, não.

`trip_delivery_proofs.kind` tem três valores desde a spec 184 — `photo` (canhoto), `signature`
(assinatura) e `cargo` (foto da mercadoria) — e a tela do comprovante já os agrupa em blocos
separados. Mas as **três** tabelas de configuração (`company_delivery_proof_settings`,
`delivery_proof_setting_overrides`, `delivery_proof_setting_contractor_overrides`) têm um único
campo `photo`. Consequência medida: `proofFormPlan.service.ts:49` do app do motorista só conhece
`fields.photo`, e a foto da mercadoria não aparece como campo do formulário em lugar nenhum. Uma
transportadora **não consegue exigir as duas**, nem desligar uma sem desligar a outra.

As duas provam coisas diferentes. O canhoto prova que **aquela nota** foi entregue: ele carrega o
número impresso, e esse número casa (ou não) com a nota do passo. A foto da mercadoria prova que o
entregador **esteve ali**: o produto, a porta da casa, a hora e o lugar. Tratá-las como um campo só
obriga a empresa a escolher qual das duas provas ela abre mão.

E a prova de presença está pela metade. `trip_delivery_proofs` já grava `latitude`, `longitude`,
`accuracy_meters` e `captured_at` **por linha, para todo `kind`, inclusive `cargo`**
(`trip.schema.ts:1607-1613`) — mas `attach-delivery-proof.use-case.ts:323` devolve
`not_required` para tudo que não é `photo`. A foto que existe para provar presença é justamente a
única que nunca é julgada. O dado está no banco e não vira veredito.

Do lado da leitura, o painel mostra menos do que a API entrega: `receivedBy` e `receivedByDetail`
chegam desde a spec 193 e **nenhum componente os renderiza**; hora da captura, pontualidade e
registro tardio idem. Não existe miniatura de comprovante em lugar nenhum — nem coluna no banco,
nem campo na resposta — então o painel baixa a imagem cheia para mostrar num quadradinho, e a
única forma de ampliar é não existir (`ProofImage` é uma `<img>` sem clique, `trip.locale.json:466`
tem a chave `deliveryProof.open` = "Abrir em tamanho real" traduzida e **sem nenhum consumidor**).
Navegação próximo/anterior entre imagens não existe em nenhuma tela do produto.

Por fim, não existe conceito de comprovante conferido. A leitura do canhoto (código de barras
`@zxing/library`, OCR `tesseract.js`) **existe e funciona**, mas só no assistente de baixa em campo
do escritório, e só como sugestão no instante da criação: o resultado morre na tela, nada é
gravado. Canhoto que o motorista mandou ilegível entra no sistema exatamente como um canhoto
perfeito.

**Resultado esperado.** A empresa configura canhoto e foto da mercadoria separadamente, com
mínimo de fotos quando exige. A foto da mercadoria passa a ser julgada por lugar e hora como o
canhoto. O painel mostra, por entrega **e por nota**, tudo que foi colhido — imagens em miniatura,
quem recebeu, quando e de onde —, a miniatura abre em tela cheia e anda para a próxima. E o
canhoto ganha um veredito de conferência: aprovado quando o número lido bate com a nota, aprovado
à mão quando a pessoa confere, e nunca aprovado quando não dá para ler.

## Fora do escopo

- **Recusar a foto no aparelho do motorista.** Proibido por invariante do produto (ADR-0070,
  ADR-0079 §A3, specs 203, 209 D2 e 194 D1): nada bloqueia ou descarta a foto na captura. Canhoto
  ilegível é tratado **depois**, no veredito (RF16), nunca na hora de tirar.
- **Implementar a conferência no aparelho (spec 194 / ADR-0078).** Ela continua sem código. Esta
  spec roda a leitura **no painel**, sobre a imagem já enviada, reusando os dois motores que o
  painel já carrega. Se a 194 for implementada um dia, ela alimenta o mesmo veredito por outro
  caminho.
- **Mais de um canhoto por entrega.** O índice único `(company_id, stop_event_id, kind)` ainda vale
  para `photo` e `signature` — a spec 184 (D2) só o relaxou para `cargo`. Mínimo maior que 1 de
  canhoto exige desfazer essa unicidade, e isso é spec própria.
- **Mostrar o documento do recebedor.** ADR-0057 §3 decidiu que esta tela não o exibe. Continua
  assim.
- **Coordenada crua na tela ou na URL.** O que aparece é a distância até o destino e a hora
  (RF11); latitude e longitude não viram texto de interface nem query string.
- **Comprovante no portal do contratante.** ADR-0079 §A5 já decidiu que `receivedBy` não vai para
  lá, e o portal não mostra comprovante hoje. Nada muda.
- **Expurgo do canhoto ilegível.** Já é da spec 162 (`POST /storage/objects/:id/purge-illegible`).
  Esta spec marca o veredito; apagar o arquivo continua sendo aquela rota.

## Histórias priorizadas

### P1 — A empresa exige as duas provas

**Given** uma transportadora que quer canhoto assinado **e** foto da mercadoria na porta
**When** ela abre a configuração de comprovante
**Then** vê dois campos independentes — "Foto do canhoto" e "Foto da mercadoria" —, cada um com
`obrigatório` / `opcional` / `desligado`, e o app do motorista passa a pedir os dois.

### P2 — A foto da mercadoria vale como prova de presença

**Given** a foto da mercadoria configurada como obrigatória
**When** o motorista a tira a 800 m do destino, duas horas depois do horário
**Then** o comprovante guarda o veredito `late_and_away` para aquela foto, do mesmo jeito que já
guardava para o canhoto.

### P3 — O painel mostra o que foi colhido

**Given** uma entrega com canhoto, duas fotos da mercadoria e assinatura
**When** a pessoa abre o comprovante da nota no painel
**Then** vê as quatro imagens em miniatura, quem recebeu e em que condição, a hora de cada captura
e a distância até o destino — sem baixar as imagens cheias.

### P4 — A miniatura abre e anda

**Given** as quatro miniaturas na tela
**When** a pessoa clica na primeira
**Then** a imagem abre em tela cheia com "anterior" e "próxima", fecha no Esc e no botão voltar do
Android, e percorre as quatro na ordem em que aparecem.

### P5 — O canhoto ganha veredito

**Given** um canhoto cujo número impresso é lido e bate com a nota
**When** o comprovante é aberto no painel
**Then** ele aparece como **conferido**, com o número lido ao lado; um canhoto de outra nota ou
ilegível aparece como **pendente**, e a pessoa pode aprová-lo à mão ou recusá-lo com motivo.

### P6 — O mínimo de fotos é respeitado

**Given** a foto da mercadoria obrigatória com mínimo de 3
**When** o motorista tenta confirmar a entrega com 2
**Then** a pendência diz que faltam fotos da mercadoria, com a contagem, e o confirmar não fecha.

## Requisitos funcionais

### A. A configuração separa as duas fotos

- **RF01** — As três tabelas de configuração ganham a coluna de modo `cargo`
  (`required|optional|off`, CHECK pela mesma lista), com padrão `off`: instalação existente não
  passa a exigir foto que ninguém pediu.
- **RF02** — `deliveryProofSettingsSchema` ganha `cargo: fieldMode.optional()`. **Opcional**, pelo
  precedente da spec 193 D6: painel em cache que ainda não conhece o campo não pode tomar 400, e
  ausência **preserva o que está gravado** em vez de zerar.
- **RF03** — A cascata das exceções (`deliveryProofSettings.service.ts`) resolve `cargo` como
  resolve os outros campos. A regra de que **uma exceção vence a configuração geral por inteiro**,
  nunca campo a campo, não muda.
- **RF04** — A tela de configuração passa a mostrar dois campos de foto, rotulados **"Foto do
  canhoto"** e **"Foto da mercadoria"**, com o texto de apoio dizendo o que cada uma prova. O
  interruptor `canhotoOcrEnabled` fica visualmente amarrado ao campo do canhoto — ele é do canhoto
  e continua fora das duas tabelas de exceção (ADR-0069 §6).
- **RF05** — `proofFormPlan.service.ts` do app do motorista passa a conhecer `cargo`:
  `rendersCargo`, a contagem de faltantes e a pendência de confirmação.

### B. O mínimo de fotos

- **RF06** — Cada campo de foto ganha, nas três tabelas, uma quantidade mínima inteira
  (`cargo_minimum_count`, padrão 1), **lida apenas quando o modo é `required`**. Modo `optional`
  ou `off` ignora o mínimo.
- **RF07** — O mínimo é da **foto da mercadoria**, que acumula. O canhoto aceita mínimo 1 e só 1,
  pelo índice único citado em "Fora do escopo"; a interface não oferece outro valor para ele.
- **RF08** — O teto continua 5 por entrega (spec 184 D3). Mínimo maior que o teto é recusado na
  fronteira, com código estável, e a interface não deixa salvar.
- **RF09** — `listMissingProofFields` (o gate da spec 218, RF-A1) passa a contar: com mínimo 3 e
  duas fotos enviadas, a pendência é "faltam 1 foto da mercadoria", e o confirmar continua
  bloqueado. **Isto é pendência de confirmação, não recusa de anexo** — a foto que chega é sempre
  aceita.

### C. O veredito alcança a foto da mercadoria

- **RF10** — `classifyUploadPunctuality` deixa de devolver `not_required` para `cargo` e passa a
  julgá-lo com a mesma política do canhoto (`delivery-proof-punctuality.policy.ts`, ADR-0070),
  guiado pelo modo `settings.cargo`: `off` continua `not_required`.
- **RF11** — Cada linha de `cargo` recebe seu próprio veredito. Como `cargo` acumula, **não há
  fusão** entre elas: `mergeProofPunctuality` continua valendo só para o campo que substitui
  (canhoto e assinatura), onde a regra "a segunda foto nunca melhora o veredito" (spec 159 T11 D3b)
  é o que impede lavar uma foto ruim tirando outra no lugar.
- **RF12** — Comprovante registrado pelo escritório (canal `office`) continua `not_required`, para
  todos os tipos. Quem não estava lá não é medido por onde estava.

### D. O painel mostra o que colheu

- **RF13** — O comprovante — no detalhe da entrega **e** na expansão de cada nota, que já existe —
  passa a renderizar `receivedBy` e `receivedByDetail`, com o rótulo em português do valor
  enumerado ("vizinho", "porteiro", "o próprio cliente"). Comprovante antigo traz `null` e a linha
  simplesmente não aparece. **`receivedBy` continua fora de log, auditoria, notificação e linha do
  tempo** (spec 193 D10).
- **RF14** — Cada imagem mostra a **hora da captura** e, quando há posição, a **distância até o
  destino** em forma legível ("a 45 m do destino, às 14h32"). Sem posição, diz "sem localização".
  Latitude e longitude não aparecem como texto nem entram em URL.
- **RF15** — O veredito de pontualidade vira selo visível por imagem (`no horário`, `fora do
horário`, `longe do destino`, `fora do horário e longe`), e `lateRegistration` vira o selo
  "registro tardio". **Isto revoga a linha da spec 205** que dizia que estes campos sairiam "apenas
  como dado; nenhum rótulo novo na tela": a 205 tratava da linha do tempo, e a partir daqui o
  comprovante é a tela onde a prova de presença se lê.
- **RF16** — O documento mascarado do recebedor continua **fora** da tela (ADR-0057 §3).

### E. Miniatura e visualizador

- **RF17** — `trip_delivery_proofs` ganha `thumbnail_object_id` **nullable**, com purpose próprio
  `trip_delivery_proof_thumbnail`, separado do purpose do original. Isto é **extensão da decisão
  fechada na spec 161 (D12/D13)**, não decisão nova: miniatura JPEG, lado maior 320 px, qualidade
  0,7, alvo ≤ 60 KB, teto duro 128 KiB, **gerada no cliente** (`sharp` no servidor foi recusado e
  continua recusado).
- **RF18** — Vale para os **três** tipos: canhoto, foto da mercadoria e assinatura. A assinatura é
  PNG com fundo branco; a miniatura dela sai JPEG como as outras.
- **RF19** — Três pontos geram: o app do motorista (antes de enfileirar), o assistente de baixa em
  campo do escritório e a assinatura. Falha na geração **sobe só o original** (spec 161 RF29b) — a
  miniatura nunca é condição para o comprovante existir.
- **RF20** — A leitura devolve `thumbnailUrl` ao lado de `downloadUrl`, ambos presigned de 5
  minutos, gerados **na leitura de detalhe**. Comprovante antigo, sem miniatura, **cai para o
  original** com `loading="lazy"` (precedente 161 D14) — nunca imagem quebrada.
- **RF21** — A miniatura abre em tela cheia ao clique, com **anterior** e **próxima** percorrendo
  todas as imagens daquele comprovante na ordem da tela. O visualizador é diálogo de verdade:
  `role="dialog"`, foco preso, Esc fecha, botão voltar do Android fecha — o molde é o
  `ProofImageLightbox` do app do motorista, que já resolve isso.
- **RF22** — A tela cheia usa o **original** (`downloadUrl`), nunca a miniatura ampliada.
- **RF23** — A chave órfã `deliveryProof.open` passa a ter consumidor, ou é removida.

### F. O canhoto ganha veredito de conferência

- **RF24** — `trip_delivery_proofs` ganha o estado de conferência, com quatro valores:
  `not_applicable` (padrão, e o único possível para `signature` e `cargo`), `pending`, `approved`,
  `rejected`. Comprovante existente entra como `not_applicable`; canhoto existente entra como
  `pending`.
- **RF25** — A leitura do canhoto roda **no painel**, sobre a imagem já enviada, reusando
  `barcodeDecoder.service.ts` (`@zxing/library`, chave de acesso de 44 posições com dígito
  verificador) e, só se ela falhar e `canhotoOcrEnabled` estiver ligado, `canhotoOcrEngine`
  (`tesseract.js`). A ordem, os limiares e o casamento são os que já existem em
  `canhotoIdentification.service.ts` e `canhotoOcr.service.ts` — nada é reimplementado.
- **RF26** — **Aprovação automática** acontece num caso só: identificação por **código de barras**
  com resultado `matched` (a chave lida é a da nota do comprovante). Resultado de **OCR nunca
  aprova sozinho** — ele sugere, com o número lido ao lado e o selo "Experimental", exatamente como
  já faz no assistente (`fieldDeliveryReview.service.ts:50-57`, que distingue `ocrSuggested` de
  `matched`). Todo o resto fica `pending`.
- **RF27** — **Aprovação manual**: com `trip.manage`, a pessoa aprova o canhoto pendente. Fica
  gravado quem aprovou e quando. Aprovar não altera nem apaga a leitura automática.
- **RF28** — **Recusa**: com `trip.manage`, a pessoa recusa o canhoto com **motivo obrigatório**,
  em lista fechada (`ilegível`, `nota errada`, `sem assinatura`, `outro`) mais um texto livre de
  20 a 500 caracteres quando for `outro`. O texto é recusado se contiver CPF, CNPJ, telefone,
  e-mail ou CEP — mesma guarda da spec 162 RF11, mesma função.
- **RF29** — Canhoto **recusado gera pendência de recaptura**: a nota volta a aparecer como
  comprovante pendente para o motorista, com o motivo visível. Esta é a tradução de "ilegível não
  pode ser aceito" — o canhoto ilegível não é aprovado, não fecha a conferência, e volta como
  trabalho.
- **RF30** — Tudo isto é **conferência, não portão**: nenhum veredito impede a entrega, a viagem,
  a fatura ou o CT-e. Aprovado, pendente e recusado são estados de leitura.
- **RF31** — Aprovação e recusa gravam trilha de auditoria (ator, alvo, IP, timestamp), pela regra
  de ação sensível. O motivo entra na trilha; nenhum dado pessoal entra.

## Requisitos não funcionais

- **RNF01** — A leitura do comprovante não pode ficar mais lenta por causa da miniatura: a URL
  assinada da miniatura é gerada no mesmo lote das outras, sem chamada extra por imagem, e **nunca**
  no cursor de listagem (precedente 161 RF12/RNF2).
- **RNF02** — A leitura do canhoto no painel roda **sob prazo** e fora do caminho de render: o
  comprovante aparece primeiro, o veredito chega depois. Prazo total de 20 s, o mesmo que a
  ADR-0078 fixou; estourou, fica `pending`.
- **RNF03** — Nenhuma imagem, texto de OCR, grade ou confiança sai do navegador para a API. O que
  sobe é o veredito e, quando houver, o número lido.
- **RNF04** — A miniatura herda a régua de bytes já fixada: original do canhoto em 2000 px /
  960 KiB (spec 212 D1), miniatura em 320 px / 128 KiB (spec 161 D13). Nenhuma medida nova.
- **RNF05** — Migration aditiva. Nenhuma coluna existente muda de tipo, nenhum `NOT NULL`
  retroativo sem padrão.
- **RNF06** — A tela respeita `web.md` §10 (375 px, 768 px, 1280 px) e §14 (primitivo do design
  system, nunca o cru). O visualizador é fullscreen em mobile.

## Casos extremos e falhas

| Situação                                                    | Comportamento                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Comprovante antigo sem miniatura                            | Mostra o original com `loading="lazy"`; nunca imagem quebrada                             |
| Miniatura falha ao gerar no cliente                         | Sobe só o original; o comprovante existe normalmente                                      |
| URL assinada vencida (5 min) na tela aberta                 | Reabrir o comprovante regenera; a tela não tenta renovar sozinha                          |
| `cargo` obrigatório com mínimo 3, motorista sem rede        | Fila offline aceita as fotos; a pendência de confirmação conta o que está na fila         |
| Mínimo configurado acima do teto de 5                       | Recusado na fronteira com código estável; a interface não deixa salvar                    |
| Exceção por contratante e por destinatário na mesma entrega | Nada muda: a mais específica vence **por inteiro** (spec 218 RF-C3/RF-D1)                 |
| Canhoto de outra nota da mesma parada                       | `pending`, com o número lido e a nota que ele aponta; a pessoa decide                     |
| OCR lê o número certo                                       | `pending` com sugestão e selo "Experimental" — nunca aprova sozinho (RF26)                |
| Leitura estoura os 20 s                                     | `pending`; a tela diz "não foi possível conferir automaticamente"                         |
| `canhotoOcrEnabled` desligado e código de barras ilegível   | `pending` direto, sem OCR                                                                 |
| Canhoto recusado e recapturado                              | O novo canhoto substitui (índice único), entra `pending` e a pendência de recaptura fecha |
| Assinatura ou foto da mercadoria                            | Estado de conferência sempre `not_applicable`; RF24 não se aplica a elas                  |
| Entrega sem nenhuma imagem                                  | O bloco do comprovante não aparece; nada de moldura vazia                                 |
| Uma imagem só                                               | O visualizador abre sem os botões anterior/próxima                                        |

## Critérios de aceite

- **CA01** — Contrato: as três tabelas aceitam `cargo` nos três modos; ausente no payload preserva
  o gravado; valor inválido é 400 com código estável.
- **CA02** — Contrato: a cascata resolve `cargo` da exceção do contratante sobre a do destinatário
  sobre a geral, por inteiro.
- **CA03** — Contrato: `proofFormPlan` com `cargo: 'required'` e mínimo 3 exige três fotos e conta
  as que faltam.
- **CA04** — Contrato: `cargo` a 800 m e duas horas atrasado vira `late_and_away`; o mesmo em canal
  `office` vira `not_required`; com `cargo: 'off'`, `not_required`.
- **CA05** — Contrato: duas fotos de `cargo` na mesma entrega guardam vereditos independentes; a
  segunda não altera a primeira.
- **CA06** — Contrato: `readDeliveryProofs` devolve `thumbnailUrl` quando há miniatura e a omite
  quando não há; o cursor de listagem não gera URL assinada nenhuma.
- **CA07** — Contrato: miniatura gerada no cliente sai ≤ 128 KiB com lado maior 320 px; falha na
  geração ainda produz o comprovante.
- **CA08** — Contrato/DOM: o painel renderiza "quem recebeu", hora e distância; comprovante antigo
  sem esses campos renderiza sem eles e sem quebrar.
- **CA09** — Contrato/DOM: clicar na miniatura abre o diálogo com o original, Esc fecha, próxima e
  anterior percorrem todas as imagens e param nas pontas; uma imagem só não mostra os botões.
- **CA10** — Contrato: código de barras `matched` grava `approved`; OCR com número certo grava
  `pending` com sugestão; ilegível grava `pending`.
- **CA11** — Contrato: aprovação manual exige `trip.manage`, grava ator e instante, e gera trilha.
- **CA12** — Contrato: recusa exige motivo; texto livre com CPF, CNPJ, telefone, e-mail ou CEP é
  recusado; canhoto recusado reaparece como pendência de recaptura.
- **CA13** — Contrato: nenhum veredito impede confirmar entrega, despachar viagem, emitir CT-e ou
  faturar.
- **CA14** — Migration + rollback em Postgres descartável (`make migration-test`).
- **CA15** — Revisão de design contra a própria página, com print ao usuário (`web.md` §15).

## Dúvidas

Nenhuma bloqueante. Três decisões foram tomadas por leitura de invariante existente, e estão
registradas aqui porque mudam o que o usuário pediu literalmente:

1. **"Canhoto ilegível não pode ser aceito"** virou "não pode ser **aprovado**" (RF29). Recusar a
   foto na captura é proibido por ADR-0070 e por quatro specs; o efeito prático que o usuário quer
   — canhoto ruim não passa e volta como trabalho — é entregue pelo veredito e pela pendência de
   recaptura.
2. **A leitura roda no painel, não no aparelho** (RF25, "Fora do escopo"). A spec 194 nunca foi
   implementada; o painel já carrega os dois motores e já tem o casamento escrito. Implementar a
   194 para atender este pedido seria refazer o caminho mais longo.
3. **Mínimo de fotos vale para a mercadoria, não para o canhoto** (RF07). Mínimo maior que 1 de
   canhoto esbarra no índice único que a spec 184 manteve de propósito.
