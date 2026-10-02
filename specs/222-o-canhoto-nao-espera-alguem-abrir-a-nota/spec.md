# Feature 222 — O canhoto não espera alguém abrir a nota

## Problema e resultado

A spec 220 entregou a conferência do canhoto, e ela funciona — para **uma** nota, **se** alguém abrir
o comprovante daquela nota. Duas consequências, as duas medidas no código:

1. **A leitura automática só existe enquanto a tela está aberta.** `CanhotoAutomaticReview` monta
   dentro do painel do comprovante (`TripDetail.component.tsx:1498`), e a consulta que o alimenta só
   roda com uma nota aberta (`useTripWorkspace.hook.ts:451`, `enabled: openProofDocumentId !== null`).
   Canhoto que ninguém abriu **nunca foi lido**: fica `canhoto_review = 'pending'` com
   `canhoto_read_source = NULL` para sempre, mesmo quando o código de barras da foto casaria com a
   nota e aprovaria sozinho (220 RF26).
2. **Aprovar é um botão dentro de uma nota.** `ProofReviewActions` só aparece no painel aberto. Uma
   viagem com quarenta entregas pede quarenta aberturas, e o maço de seleção da viagem — que já
   oferece separar, carregar, devolver, ocorrência, baixa, CT-e e NFS-e (`TripStateActions`) — não
   oferece a conferência.

Resultado desta feature, nas duas pontas:

- **A rotina lê sozinha.** Uma rotina agendada varre os canhotos pendentes, decodifica o código de
  barras e reporta o que leu. O que casa com a nota já aprova pela regra que existe; o resto chega
  à pessoa **com o número lido** em vez de em branco.
- **O maço confere o que sobrou.** Marcadas as entregas, a viagem oferece "Aprovar canhoto de N
  notas": um diálogo mostra cada foto em tamanho que dá para ler, com o número da nota ao lado e o
  que a leitura achou, e aprova o que ficou marcado.

A ordem importa: a rotina é o que diminui a fila, e o maço é o que a esvazia. Aprovar em massa sem
a foto na frente seria assinar embaixo do que não se viu — por isso o diálogo mostra, e por isso só
o que foi mostrado pode ser aprovado (RF-A8).

## Fora do escopo

- **OCR no servidor.** Só o código de barras aprova (220 RF26: "máquina não interpreta — ou casou,
  ou não casou"). O OCR continua no navegador, onde ele serve para sugerir a quem decide. Rodar
  Tesseract por canhoto no worker custaria CPU para produzir exatamente o mesmo `pending`.
- **Recusar em massa.** A recusa exige motivo da lista fechada e, em "outro motivo", descrição
  escrita (220 RF31). Motivo em lote é motivo sem conferência.
- **Mexer na leitura do navegador.** `CanhotoAutomaticReview`, `canhotoReview.service.ts` e o
  caminho da nota aberta ficam como estão.
- **Recaptura do canhoto** (220 RF30) e **comprovante que não é canhoto** — assinatura e foto de
  carga não têm `canhotoReview` (`canhoto_review = 'not_applicable'`).
- Mostrar a pendência de canhoto na página `/pendencias` ou na lista de viagens. Esta feature para
  no detalhe da viagem.

## Histórias priorizadas

### P1 — A rotina lê o que ninguém abriu

**Given** uma viagem despachada com doze notas entregues, todas com foto de canhoto legível e
código de barras da DANFE, e nenhuma delas aberta por ninguém no painel
**When** a rotina agendada roda
**Then** cada canhoto cujo código de barras casa com a chave de acesso da própria nota aparece
"Conferido automaticamente", e os demais ficam aguardando conferência **com o número lido**
registrado, sem ninguém ter aberto a viagem.

### P1 — O escritório confere o maço

**Given** uma viagem com seis notas marcadas, quatro delas com canhoto aguardando conferência
**When** o operador aciona "Aprovar canhoto de 4 notas"
**Then** um diálogo mostra as quatro fotos com o número da nota ao lado; desmarcando uma, o botão
passa a oferecer três; confirmando, as três ficam "Aprovado por {nome}" e a tela diz que duas notas
marcadas não tinham canhoto para conferir.

### P2 — A falha de uma não derruba o lote

**Given** um lote de cinco canhotos em que o terceiro foi conferido por outra pessoa há um instante
**When** o operador confirma a aprovação
**Then** quatro são aprovados, o terceiro sai da lista com o veredito que valeu (texto
`deliveryProof.canhotoReview.alreadyResolved`, que já existe) e nada precisa ser refeito à mão.

## Requisitos funcionais

### Grupo A — O maço confere

- **RF-A1** Leitura em lote dos comprovantes da viagem: `GET /trips/:id/delivery-proofs`, permissão
  `fleet.read` — a mesma régua do comprovante de uma nota (`trip.routes.ts:1457`, "exigir
  `trip.manage` esconderia o comprovante de quem só olha"). Cada item carrega o `documentId` além
  do que o `GET .../documents/:documentId/proof` já devolve. Aceita `?documentIds=` com teto.
  Sem esta rota a tela precisaria de uma requisição por nota só para saber o que está pendente.
- **RF-A2** Com `trip.manage` e ao menos uma nota marcada cujo canhoto está `pending`, o maço
  oferece "Aprovar canhoto de {{count}} nota(s)". Sem nenhuma, o botão não entra no DOM.
- **RF-A3** Nota marcada sem canhoto pendente (sem comprovante, comprovante que não é canhoto, ou
  canhoto já com veredito) **não entra no lote**, e a tela diz quantas ficaram de fora — o mesmo
  aviso de exclusão das ações de campo em massa (156 T15).
- **RF-A4** O diálogo lista um item por canhoto: a foto (miniatura do comprovante, a mesma que a
  linha da nota já usa, clicável para a galeria que existe), número e série da nota, e o que a
  leitura automática leu quando houver (`canhotoReadNumber` com a origem — código de barras ou OCR).
- **RF-A5** Cada item nasce marcado e pode ser desmarcado; o rótulo do botão de confirmação mostra
  quantos vão. Zero marcados desabilita o botão.
- **RF-A6** Confirmar percorre os itens marcados chamando o `PATCH /trips/:id/documents/:documentId/proof/review`
  que já existe, com `{ action: 'approve' }` — nenhuma rota de escrita nova. Falha parcial mantém
  marcadas só as que falharam e relata quantas de quantas (padrão 156 T8b).
- **RF-A7** `409` de canhoto já resolvido não é falha do lote: aquele item sai da lista com o
  veredito que valeu, e o lote segue. ⚠️ Aprovar por cima de um `approved` **automático** devolve
  **200**, não 409 — a política não trata origem `automatic` como veredito humano, e isso é o
  comportamento certo: quem olhou a foto manda mais que quem leu a barra. A tela não chama esse caso
  de conflito.
- **RF-A8** **A tela não aprova o que não mostrou.** Item cuja imagem não carregou (erro de rede,
  URL assinada vencida, comprovante sem miniatura e sem original) nasce **desmarcado**, com o aviso
  de que a foto não abriu. É o que sustenta a conferência humana da 220 num diálogo coletivo.
- **RF-A9** Abrir o diálogo relê os comprovantes das notas marcadas: a rotina do Grupo B pode ter
  aprovado parte deles desde que a tela carregou.

### Grupo B — A rotina lê

- **RF-B1** Rotina `trip.canhoto.read` no catálogo de jobs, nas quatro cópias por valor (API,
  worker, cron, frontend) e com a paridade guardada pelos `test/job-catalog/catalog.contract.ts` de
  cada lado. O cron publica, o worker consome — o padrão de toda rotina da casa.
- **RF-B2** A varredura só considera comprovante com `kind = 'photo'`, `canhoto_review = 'pending'`,
  `canhoto_read_source IS NULL` e `canhoto_read_attempted_at IS NULL` (RF-B9), de empresa ativa,
  **de viagem não cancelada e nota não liberada**, em lotes com teto por ciclo, ordenados por
  `created_at` (a fila é por antiguidade) e respeitando `context.isStopRequested()` (padrão
  `trip-location-purge`). O corte de viagem cancelada é o que faz máquina e tela concordarem:
  `lockCanhotoProof` não filtra nenhuma das duas, e sem o corte a tela recusaria oferecer o canhoto
  que a máquina aprovaria calada.
- **RF-B3** Para cada comprovante o worker baixa o objeto, decodifica o código de barras e
  identifica a nota pela chave de acesso, com a **mesma régua do navegador**: Code-128, dígito
  verificador módulo 11, modelo `55`, e a chave comparada com as notas daquela viagem
  (`canhotoIdentification.service.ts`).
- **RF-B4** **O worker não decide.** Ele reporta o que leu (`readDocumentId`, `readNumber`,
  `readSeries`, `readSource`) e o veredito continua saindo de `resolveAutomaticCanhotoReview` no
  servidor. A 220 RF26 fica invariante: código de barras que casa aprova; o resto é `pending`.
- **RF-B5** O canal automático ganha **rota própria** —
  `PATCH /trips/:id/documents/:documentId/proof/review/automatic` — com a permissão
  `trip.canhoto-auto-review` concedida só ao papel `automation` (ADR-0047 §4: "uma permissão, e só
  ela"). A permissão entra em **duas** listas: o catálogo de `CompanyPermission` e
  `SERVICE_ONLY_PERMISSIONS` — é a segunda que `isGrantablePermission` consulta para recusar
  concessão por grupo ou avulsa, e sem ela quem tem `groups.manage` concede a si mesmo a porta do
  robô. O robô não herda `trip.manage`, logo não separa, não carrega, não cancela e não aprova à
  mão. A rota de gente continua aceitando `action: 'automatic'` para a leitura do navegador.
  ⚠️ O corpo da rota do robô é schema **próprio**: os quatro campos de leitura são `nullable()` e
  **obrigatórios**, não opcionais — com `exactOptionalPropertyTypes` um campo ausente chega
  `undefined`, e `assertReadingIsConsistent` compara contra `null`.
- **RF-B6** Idempotência por desenho: `canhoto_read_source` **ou** `canhoto_read_attempted_at`
  gravado tira o comprovante da varredura seguinte, e repetir a mesma leitura devolve `unchanged`
  sem trilha nova (220 RF27).
- **RF-B7** A rotina **nunca recusa**. Foto ilegível, sem código de barras, ou com código de outra
  nota, fica `pending` — trabalho de gente, como manda a 220 RF29.
- **RF-B8** Falha de um comprovante é resultado contado, não exceção que derruba o ciclo:
  `object_unavailable`, `unsupported_media`, `too_large`, `decode_timeout`, `api_unreachable`,
  `report_rejected` (400/404/409 da API) e `api_unauthorized` (401/403). Um comprovante ruim não
  impede os outros do mesmo ciclo. ⚠️ `report_rejected` e `api_unauthorized` vão para o Sentry: o
  primeiro é corpo malformado, que é defeito nosso; o segundo é segredo rotacionado ou permissão
  perdida. Nenhum dos dois é "imprevisto" que se possa engolir em silêncio.
- **RF-B9** **A máquina registra que tentou.** `trip_delivery_proofs` ganha
  `canhoto_read_attempted_at`, gravado quando a leitura terminou e **não** produziu código
  utilizável. Sem isso a rotina tem um defeito que nenhum teste pegaria: canhoto sem código de
  barras — o caso comum do escritório — não produz leitura, continua com `canhoto_read_source` nulo
  e volta à varredura, sendo baixado e decodificado a cada cinco minutos para sempre. Falha de
  infraestrutura (objeto ausente, teto, timeout, API fora) **não** grava a tentativa: ela merece o
  próximo ciclo. A recaptura (220 RF30) não é afetada — ela cria comprovante novo.
- **RF-B10** **A rota do robô grava trilha por comprovante** (`audit_logs`, ação
  `trip.canhoto-review.automatic`, ator = usuário do serviço, sem nota e sem PII). O caminho
  `automatic` de hoje não grava, e para o navegador isso passava: há gente logada olhando. Para um
  chamador cross-tenant, desacompanhado e de cinco em cinco minutos, não passa — e como
  `canhoto_review_by_user_id` fica nulo por CHECK no caminho automático, `audit_logs` é o único
  lugar onde a identidade do serviço aparece (ADR-0047 §6). A rota de gente fica como está.

## Requisitos não funcionais

- **RNF1** Nenhum byte de imagem, nome de recebedor ou número de documento em log — só ids opacos
  (`proofId`, `documentId`, `tripId`, `companyId`) e contagens (`security.md` §1).
- **RNF2** Decodificação **fora do event loop**, em `worker_thread`, com orçamento de tempo por
  comprovante e por ciclo (ADR-0053: "o anexo anônimo não é lido na requisição" — mesma razão).
- **RNF3** Teto de **8 MB** por comprovante, conferido **antes de baixar**, pelo tamanho já gravado
  em `stored_objects` — não depois do download. Conferir só antes de decodificar permitiria baixar
  cem megabytes para então recusar. O PNG de 12 MP do spike deu 10,7 MB e levou o RSS do worker a
  ~300 MB; 8 MB cobre JPEG e WebP de câmera com folga e corta justamente esse caso.
- **RNF4** A biblioteca de decodificação de imagem precisa rodar em Bun e no runtime do Railway sem
  passo de build próprio; a escolha é medida, não suposta (`code-standart.md` §13).
- **RNF5** O diálogo do maço com quarenta itens não trava a tela: miniaturas com `loading="lazy"`
  (o `ProofImage` já faz) e teto de itens por diálogo, com aviso quando a seleção passa do teto.
- **RNF6** A URL assinada da miniatura é de vida curta, como já é — o diálogo não guarda imagem.

## Casos extremos e falhas

- **Nota sem NF-e vinculada** (`documentNumber = null`): nunca aprova automático, já pela política.
  No diálogo aparece como canhoto sem número para comparar.
- **Canhoto já com veredito humano**: a rotina devolve `unchanged` e não sobrescreve — o automático
  nunca passa por cima de gente (220, `resolveAutomaticCanhotoReview`).
- **Código de barras de outra nota da viagem**: grava a leitura, veredito `pending`. No diálogo isso
  aparece ao lado da foto — é exatamente o caso em que a pessoa precisa olhar.
- **Objeto ausente no storage** (expirado, bucket trocado): conta `object_unavailable` e segue.
- **Imagem WebP**: aceita no upload (`DELIVERY_PROOF_MIME_TYPES`), então a decodificação precisa
  cobrir JPEG, PNG e WebP ou declarar `unsupported_media` sem falhar o ciclo.
- **Storage fora do ar**: o ciclo termina com falha contada, não com exceção solta; o próximo ciclo
  reencontra os mesmos comprovantes (RF-B2 não os perde).
- **Seleção que muda por baixo**: o maço já se limpa quando a viagem recarrega
  (`useTripDocumentSelection`), e o diálogo relê ao abrir (RF-A9).
- **Duas pessoas conferindo**: a primeira grava, a segunda recebe 409 e a tela mostra o veredito que
  valeu (RF-A7).
- **Viagem cancelada / nota liberada**: não é oferecido no maço **e** não entra na varredura
  (RF-B2). `lockCanhotoProof` não filtra nenhuma das duas, então o corte tem de estar na consulta da
  fila — senão a tela recusa e a máquina aprova calada.
- **Canhoto sem código de barras**: é o caso comum do escritório. Decodifica, não acha, grava
  `canhoto_read_attempted_at` e sai da fila (RF-B9). Sem isso, seria relido para sempre.

## Critérios de aceite

- **CA01** Rota nova devolve os comprovantes da viagem com `documentId`, e `fleet.read` basta para
  lê-la; `trip.manage` não é exigido.
- **CA02** Seis notas marcadas, quatro com canhoto pendente → o maço oferece "Aprovar canhoto de 4
  notas" e avisa que duas ficaram de fora.
- **CA03** Nenhuma nota marcada com canhoto pendente → nenhum botão de conferência no DOM.
- **CA04** Sem `trip.manage` → nenhum botão de conferência no DOM, mesmo com canhoto pendente.
- **CA05** O diálogo mostra, por item, a foto, o número e a série da nota e o número lido quando
  existe.
- **CA06** Desmarcar um item muda o rótulo do botão; desmarcar todos o desabilita.
- **CA07** Lote de cinco com um 409 → quatro aprovados, o item em conflito sai com o veredito que
  valeu, nada fica pendente de ação manual.
- **CA08** Lote de cinco com uma falha de rede → quatro aprovados, **só** o que falhou segue
  marcado, e a tela diz "1 de 5".
- **CA09** Item cuja imagem falhou em carregar nasce desmarcado e não é enviado.
- **CA10** Um ciclo da rotina sobre doze canhotos pendentes: os que casam pelo código de barras
  ficam `approved` com origem `automatic`; os que não casam ficam `pending` com
  `canhoto_read_number` preenchido; nenhum fica `rejected`.
- **CA11** Segundo ciclo imediato não toca em nenhum dos doze (RF-B6) e não grava trilha nova.
- **CA12** Canhoto com veredito humano `rejected` passa pela rotina sem mudar.
- **CA13** A rota automática recusa (`403`) um token de gente com `trip.manage` e aceita o token de
  serviço com a permissão da automação; a recíproca vale para a rota de gente.
- **CA14** Objeto ausente no storage: o ciclo termina `succeeded` com a falha contada, e os outros
  comprovantes do lote foram lidos.
- **CA15** Nenhuma linha de log do ciclo contém nome, documento ou bytes — só ids e contagens.
- **CA16** `trip.canhoto-auto-review` é recusada a grupo e a concessão avulsa
  (`isGrantablePermission` devolve `false`), e nenhum papel além de `automation` a tem.
- **CA17** Canhoto sem código de barras: primeiro ciclo decodifica e grava
  `canhoto_read_attempted_at`; o segundo ciclo **não o baixa** — é a prova de que a fila converge.
- **CA18** Objeto acima de 8 MB é recusado **sem download**, pelo tamanho gravado em
  `stored_objects`, e conta `too_large`.
- **CA19** O caminho do robô grava uma linha em `audit_logs` por comprovante, com o usuário do
  serviço como ator e sem nota nem PII; a rota de gente continua não gravando no ramo automático.
- **CA20** A consulta da fila usa o índice parcial: `EXPLAIN` mostra `Index Scan` sobre
  `trip_delivery_proofs_canhoto_pending_idx`, não `Seq Scan`.

## Dúvidas

Nenhuma. As duas decisões que estavam abertas foram fechadas antes da implementação, e as duas
mudaram o escopo:

1. **Decodificador** (RNF4): `@jsquash/{jpeg,png,webp}` em wasm, medido em
   `spike-decodificador.md` — 101 ms numa foto de 12,2 MP dentro de `worker_thread`, sob os flags de
   empacotamento do worker. Não `sharp`, para não pendurar binário nativo por plataforma no caminho
   do `--frozen-lockfile`.
2. **Permissão** (RF-B5): `trip.canhoto-auto-review`. Prefixo `trip` porque `canhoto` não é domínio
   (não existe módulo `canhoto/`, a tabela é `trip_delivery_proofs`, a rota é `/trips/...`); sufixo
   `-review` e não `-read` porque em todo o catálogo `.read` significa ver, e uma permissão de
   escrita terminada em `-read` engana quem audita a matriz de concessão.

A revisão do `architect` sobre o ADR-0091 acrescentou RF-B9 (a máquina registra que tentou), RF-B10
(trilha por comprovante), o corte de viagem cancelada na RF-B2, os dois resultados de falha novos da
RF-B8, a segunda lista de permissão na RF-B5 e o teto antes do download na RNF3. Nenhuma delas é
refinamento: cada uma tapa um caminho em que a rotina estaria errada em produção e verde no teste.
