# Feature 246 — A exigência da ocorrência chega na rua

## Problema e resultado

A empresa já declara o que uma ocorrência precisa trazer, e já declara exceções por contratante e
por destinatário. Nada disso está onde se procura, e a parte por CNPJ não é cobrada pelo servidor.

Quatro defeitos de um fato só:

1. **O servidor ignora a exceção por CNPJ.** O snapshot do motorista já resolve os tipos de cada
   nota por contratante e destinatário (spec 218 follow-up: `drizzle-current-driver-trip.repository.ts`
   `toDriverDocument`, lido pelo app em `occurrenceRegistration.service.ts`), então o app **mostra** a
   exigência da exceção. Mas `registerDriverOccurrence` confere o registro contra o `attachmentMode`
   **do tipo**, só: quem cadastra uma exceção menos estrita vê o app liberar o botão e o servidor
   recusar; quem cadastra uma mais estrita vê o app pedir e o servidor aceitar sem. A exceção vale
   na tela e não vale na gravação. (O que se chamava de "defeito 1" — o app não mandar
   `contractorId`/`recipientTaxId` — **não é defeito**: o app não manda de propósito, porque
   `security.md` §3 proíbe dado pessoal em URL, e o snapshot já embute o resultado.)
2. **A exigência é um eixo só.** `attachment_mode` governa a foto, e `required` arrasta a
   observação junto por regra fixa no caso de uso (179 RF3). Não há como pedir a assinatura de
   quem recusou a carga — a prova que sustenta uma recusa contestada — nem exigir observação sem
   exigir foto.
3. **O momento é único, e a operação precisa de vários.** O tipo declara uma etapa (`stage`:
   galpão **ou** rua) e um caminho (`flow`: nota **ou** parada), cada um de valor único. "Avaria"
   acontece no galpão e na rua; hoje a empresa cadastra dois tipos com o mesmo nome, e o relatório
   soma errado porque são dois ids. O momento tem de ser um conjunto.
4. **O cadastro está escondido.** O catálogo mora em Configurações → Empresa, e dentro de cada tipo
   a exceção por CNPJ está num acordeão fechado ("Ver exceções"), que só carrega quando abre.
   Ambos só aparecem em tipo da etapa "Na rua" — no de galpão o campo nem é renderizado, sem aviso.

Ao fim: o operador abre **Ocorrências → Tipos**, vê numa tela só em que momentos cada tipo pode ser
registrado, o que ele exige — foto, observação, assinatura e produtos, cada um desligado, opcional
ou obrigatório — e para quais CNPJs a regra é outra. O motorista vê a exigência que vale para
**aquela** nota, incluindo a exceção, e o botão de registrar só libera quando o que foi pedido está
capturado no aparelho. O **servidor cobra a mesma exigência efetiva** que o app mostrou.

Protótipo da tela em [`preview.html`](preview.html), no tema real do painel.

## Pré-condição: a spec 241 já aplicada

Esta spec **não executa antes** da [241](../241-o-tipo-da-ocorrencia-diz-se-ela-carrega-itens/spec.md):
a 241 (menor, sem exigência na rua) vai primeiro e é ela quem **cria** o eixo de produtos. Só a
consome aqui. **Conferido em 2026-10-06:** a 241 está em `origin/staging` (`81cd849b6`), migration
`20261006033752_occurrence_type_items_mode`.

**O que a 241 entrega** (e esta spec assume existente, em API, banco e painel):

- `company_occurrence_types.items_mode varchar(16) NOT NULL DEFAULT 'optional'`, com CHECK no
  vocabulário `off | optional | required` e a CHECK `company_occurrence_types_items_off_shape_check`
  (`items_mode = 'off' ⇒ redelivery_policy = 'unset'`).
- O `UPDATE` que pôs `off` nos tipos semeados da segunda via do boleto. **Todo o resto está
  `optional`** pelo default: o registro continua mostrando o seletor de produtos para eles, como hoje.
- `itemsMode` no cadastro (`PUT`/`GET /company-settings/occurrence-types`) e nas leituras, o `422
OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` em tipo `off`, e o painel com **Produtos** em duas opções
  (Desligado / Opcional) no cadastro que mora em Configurações → Empresa. Escrever `required` volta
  `400` até esta spec.

**O que esta spec muda no que a 241 entregou** (RF1, RF1b, RF1c2):

- A escrita passa a aceitar `required` (a 241 só aceita `off` e `optional`) e o painel ganha a
  terceira opção, **Obrigatório**, no mesmo seletor de três estados.
- Acrescenta `items_minimum_count` (nulo = todos os itens), cuja CHECK exige `items_mode =
'required'`, e `photo_minimum_count`. **Nenhuma linha desta spec cria `items_mode` na tabela de
  tipos**, e o rollback também não a derruba.
- O painel de tipos que a 241 alterou **muda de endereço** (CA01): o `OccurrenceTypeCatalogPanel`
  sai de Configurações → Empresa para a aba Tipos de `/ocorrencias`. É **mover o componente que a 241
  já alterou** — com o campo Produtos, a regra de esconder a política de reentrega e seus testes —,
  nunca reescrevê-lo. Ver `plan.md` § Dependência da spec 241.

## Decisões fechadas (2026-10-06)

- **D-a — A exceção é nula: `NULL` = herda do tipo, campo a campo.** As colunas novas das duas
  tabelas de exceção (`note_mode`, `signature_mode`, `items_mode`, `photo_minimum_count`,
  `items_minimum_count`) são **NULAS e sem default**. `resolveWithOverrides` já faz `??`, então
  uma exceção que declara só a assinatura herda foto, observação e produtos do tipo. A exceção
  deixa de "declarar os três": declara **o que muda**.
- **D-b — O servidor cobra a exigência efetiva da nota.** O snapshot já entrega o resolvido ao
  app; o que falta é o **registro** ler os mesmos modos efetivos (tipo + exceção de contratante +
  exceção de destinatário). Não se manda `contractorId`/`recipientTaxId` por URL.
- **D-c — `separation + stop` vira `stop` no backfill de momentos.** Preserva o comportamento que
  todo leitor já tem hoje. Que um tipo de galpão com `flow: stop` seja um tipo sem sentido é um
  furo antigo; fechá-lo é **spec à parte**.
- **D-d — Só ocorrência de NOTA (momento `document`) guarda N fotos.** Parada fica fora: a FK da
  tabela de anexos aponta só para `trip_document_occurrences`, e `report-stop-occurrence.use-case.ts`
  não lê `attachment_mode` hoje. O **demonstrativo de ocorrências ao cliente**
  (`drizzle-occurrence-statement.repository.ts`) passa a mostrar a foto de rua e a resposta da
  correção também — aceito, com contrato (CA09). A **assinatura** fica na coluna
  `signature_object_id`, **nunca como linha de anexo**: como linha, contaria como foto no mínimo,
  no expurgo e no demonstrativo.

## Fora do escopo

- **A exigência no momento de galpão (`separation`).** Continua com a regra fixa de 1 a 5 fotos da
  spec 161 (`OCCURRENCE_PHOTO_REQUIRED`). Os dois regimes seguem convivendo; unificá-los mexe no
  fluxo do separador e no WhatsApp, e a 161 deixou isso em aberto por decisão própria. Num tipo
  que tem momento de galpão **e** de rua, os três campos valem só nos de rua, e a tela diz isso.
- **Exigência na ocorrência de parada (`stop`).** O caso de uso da parada não lê `attachment_mode`
  hoje e continua assim (D-d). A coluna `signature_object_id` existe nas duas tabelas de ocorrência
  para não exigir segunda migration; em `trip_stop_occurrences` ela **não tem escritor nem leitor**
  nesta spec.
- **Fechar o furo `separation + stop`** (D-c) — spec à parte.
- **Fundir os dois tipos "Avaria" existentes.** O backfill nunca gera `separation + document`
  (só o operador monta esse conjunto, na tela); os dois tipos já cadastrados com o mesmo nome
  continuam dois ids até o operador decidir.
- **Nome e documento de quem deu a negativa.** Numa recusa raramente se consegue, e `receivedBy`
  já é decidido como campo que nunca bloqueia (193).
- **Retroatividade.** Ocorrência já gravada não é reavaliada contra a exigência nova.
- **A correção e o cancelamento da ocorrência registrada.** Saíram para a
  [spec 240](../240-a-correcao-da-ocorrencia-ganha-tela/spec.md), que vai primeiro.
- **O comprovante de entrega** (`DeliveryProofFieldSettings`) não muda. A foto e a assinatura de
  ocorrência nunca entram em `trip_delivery_proofs` — a spec 209 existe por causa desse defeito.
- **A rota do escritório** em nome do motorista para ocorrência de parada continua mandando só
  `kind` (pendência da 218, paridade incompleta).
- **Tipo `flow: stop` recusado na rota de nota** — outra pendência da 218, defesa em profundidade
  que não depende desta mudança.
- **Foto e assinatura pelo WhatsApp do motorista.** O canal não colhe nenhuma das duas: ver RF13.

## Histórias priorizadas

### P1 — O operador acha o que o tipo exige

**Given** sou operador com `companies.settings` e abro **Ocorrências**
**When** clico na aba **Tipos**
**Then** vejo a lista de tipos agrupada por etapa e, em cada tipo de rua, quatro campos à vista —
Foto, Observação, Assinatura, Produtos —, cada um em Desligado / Opcional / Obrigatório
**And** a aba Configurações → Empresa não oferece mais "Tipos de ocorrência": o cadastro tem um
endereço só.

### P1b — Um tipo vale em mais de um momento

**Given** "Avaria" acontece tanto no galpão quanto na rua
**When** marco, no seletor múltiplo de momentos, **Separação no galpão** e **Entrega da nota**
**Then** o mesmo tipo — um id só — aparece para o separador e para o motorista
**And** a permissão continua saindo do momento **do registro**: cada caso de uso tem o momento
fixo (separador: `separation`, motorista: `document`, escritório: `office`) e a política da rota
(`trip.manage` / `trip.report` / `trip.report-on-behalf`) não muda
**And** tipo sem nenhum momento marcado não é aceito — ele não apareceria para ninguém.

### P2 — A exceção por CNPJ fica à vista

**Given** estou na aba Tipos
**When** olho um tipo de rua
**Then** vejo, sem abrir acordeão, quantas exceções ele tem e para quem — por contratante e por
destinatário, identificados por nome e CNPJ
**And** consigo adicionar, trocar o modo e remover uma exceção ali mesmo
**And** cada exceção declara só **o que muda**: os quatro campos aceitam **Igual ao tipo** (nulo),
que herda o valor do tipo — uma exceção que só endurece a assinatura não precisa repetir foto,
observação e produtos.

### P3 — A exigência que vale é a daquela nota

**Given** o tipo "Recusa total" pede foto opcional no geral, mas é obrigatória para o destinatário
`12.345.678/0001-90`
**When** o motorista abre a ocorrência de uma nota desse destinatário
**Then** o app mostra `required` para a foto — a exceção do destinatário vence a do contratante, que
vence o geral
**And** o servidor, no registro, cobra a mesma foto `required` — e não a do tipo
**And** numa nota de outro destinatário o mesmo tipo volta a `optional`, no app e no servidor.

### P4 — O motorista não registra sem o que foi pedido

**Given** o tipo efetivo exige foto e assinatura
**When** o motorista preenche a ocorrência
**Then** o botão de registrar só habilita com a foto capturada **e** a assinatura desenhada no
aparelho, sem depender de rede
**And** o envio continua pela fila: a ocorrência nunca espera o upload terminar (209 D2).

### P5 — A verificação diz a verdade

**Given** abro a tela de verificação de configuração para um contratante e um destinatário
**When** consulto um tipo de ocorrência
**Then** vejo os campos resolvidos, com a camada que decidiu cada um.

## Requisitos funcionais

- **RF0** O tipo declara um **conjunto** de momentos, nunca menos de um. O vocabulário é fechado e
  sai do que existe hoje, gerado de uma constante `OCCURRENCE_MOMENTS`: `separation` (separação no
  galpão), `document` (entrega da nota), `stop` (chegada à parada) e `office` (escritório, em nome
  do motorista). O conjunto substitui `stage` + `flow`, que eram dois campos de valor único; as duas
  colunas **permanecem**, derivadas do conjunto (plan § Momentos).
- **RF0b** A permissão continua decidida pelo **caso de uso**, não pelo tipo: cada rota tem o
  momento fixo e a política que já tinha — `separation` é `trip.manage`, `document` e `stop` são
  `trip.report`, `office` é `trip.report-on-behalf` (o escritório em nome do motorista). A guarda
  nova é `acceptsOccurrenceMoment({ moments, moment })`. É proibido calcular permissão a partir dos
  momentos do tipo. Um tipo com momentos dos dois lados é registrável pelos dois papéis, cada um no
  seu momento — e **nunca** amplia o que um papel podia fazer no momento do outro.
- **RF1** O tipo de ocorrência passa a declarar quatro exigências independentes — `photoMode`,
  `noteMode`, `signatureMode` e `itemsMode` (produtos da nota) —, cada uma em `off` / `optional` /
  `required`, reaproveitando `DELIVERY_PROOF_FIELD_MODES`. Nenhum vocabulário novo. `itemsMode` **já
  existe no tipo** (spec 241); aqui entram `photoMode`, `noteMode` e `signatureMode`, e o `itemsMode`
  ganha o estado `required` e passa a existir (nulo) nas duas tabelas de exceção.
- **RF1a** Os quatro campos usam **o mesmo seletor de três estados, com as mesmas três palavras**:
  Desligado · Opcional · Obrigatório. Nada de "Sem foto", "Pelo menos um produto" e outras
  redações por campo. O que cada estado significa por campo fica numa linha de dica abaixo da
  grade, uma vez, não repetido em cada rótulo. **Estado de hoje, que o cadastro existente já
  mostra:** observação **Opcional** (hoje sempre opcional, e obrigatória onde a foto é obrigatória),
  assinatura **Desligada**, foto e produtos como estão gravados. Na **exceção** o seletor ganha uma
  quarta opção neutra, **Igual ao tipo** (nulo, herda), que é o estado inicial de uma exceção nova.
- **RF1b** `itemsMode = required` exige **ao menos um produto** marcado. A seleção de produto, a
  quantidade e a unidade já existem (166/172) e não mudam; o que entra é a exigência. O
  `allows_multiple_items`, que hoje é coluna invisível no painel, aparece na aba ao lado dela —
  um produto ou vários é escolha do mesmo cadastro.
- **RF1c** `photoMode = required` aceita uma **quantidade mínima** de fotos, de 1 a 5, no molde do
  `cargoMinimumCount` da entrega. Lida só quando a foto é obrigatória, e **só na ocorrência de nota**
  (D-d). Na exceção, nulo herda a do tipo.
- **RF1c2** `itemsMode = required` aceita o mesmo: uma **quantidade mínima de produtos**, ou a
  opção **todos os itens da nota** (nulo) — o caso da recusa total, onde exigir "pelo menos um"
  deixa passar ocorrência pela metade. Lida só quando Produtos é obrigatório. **Na exceção, o par
  `items_mode` + `items_minimum_count` vem junto:** exceção com `items_mode` nulo herda o par do
  tipo; exceção com `items_mode` declarado usa o próprio par, e `items_minimum_count` nulo significa
  "todos os itens", como no tipo.
- **RF1h** Os controles são os **componentes que a aplicação já tem**, não `<select>` nativo nem
  invenção da tela: `Select` para os quatro modos e para os campos de valor único, `MultiSelect`
  para os momentos, `SearchableSelect` para escolher o cliente da exceção. Filtro continua pílula,
  como em `TripOccurrenceFilters` da aba vizinha.
- **RF1d** Para cumprir a RF1c, a ocorrência de rua passa a guardar suas fotos em
  `trip_document_occurrence_attachments` — a tabela que a spec 161 criou para o galpão —, com
  backfill da coluna `attachment_object_id` e leitura unificada. A **leitura** "anexo novo, senão
  coluna antiga" **já existe** desde a 161 T10; falta o backfill e a escrita dupla.
- **RF1e** O aviso ao contratante entra na aba junto do resto do cadastro: o interruptor
  `notifies`, a **seleção do modelo de notificação** (`emailTemplateKey`, lista dos modelos
  cadastrados, com o conteúdo visível antes de escolher) e a política de reentrega
  (`redeliveryPolicy`) — colunas que já existem e que o painel atual edita.
- **RF1f** O destinatário da exceção é **escolhido numa lista**, não digitado: o seletor busca por
  nome ou CNPJ entre os clientes cadastrados, no mesmo molde do seletor de contratante.
- **RF2** `attachment_mode` é a exigência da **foto** e continua sendo a mesma coluna, renomeada
  conceitualmente, sem perder o que está gravado. Nada de coluna paralela.
- **RF3** A regra fixa "`required` arrasta a observação" sai do caso de uso e vira dado: na
  migration, todo tipo com foto `required` nasce com observação `required`, e **todo outro tipo
  nasce `optional`** (a observação hoje é sempre opcional; o default `off` a esconderia). O
  comportamento observável não muda para nenhum cadastro existente.
- **RF4** As duas tabelas de exceção (`company_occurrence_type_contractor_overrides` e
  `company_occurrence_type_recipient_overrides`) ganham as colunas novas **nulas** (D-a). Só uma é
  preenchida no backfill, e em **toda** linha existente: `note_mode = 'required'` onde
  `attachment_mode = 'required'`, senão `'optional'` — para a observação efetiva seguir a foto
  efetiva da regra da 179. `signature_mode`, `items_mode` e os mínimos ficam nulos (herdam).
- **RF5** A resolução em três camadas — destinatário > contratante > tipo > `off` — vale **campo a
  campo**, com nulo da exceção herdando, e continua saindo de `resolve-with-overrides.policy.ts`
  (`??`). Nenhuma segunda implementação, e **a mesma resolução serve ao snapshot e ao registro**.
- **RF6** O **registro no servidor** (`registerDriverOccurrence`) lê os modos **efetivos** da nota —
  tipo + exceção de contratante + exceção de destinatário, resolvidos por `resolveWithOverrides`,
  com contratante e destinatário lidos **da nota no servidor**, nunca do payload — no lugar do
  `attachmentMode` do tipo só. **Efeito declarado:** hoje o servidor ignora as exceções e exige pelo
  tipo; a partir daqui uma exceção **menos estrita** que o tipo passa a afrouxar de verdade (o
  motorista registra sem a foto que o tipo pede), e uma **mais estrita** passa a endurecer. A
  ativação em produção só ocorre depois da medição da T3.0 (quantas exceções afrouxam um tipo
  `required`).
- **RF7** O app do motorista bloqueia o registro enquanto um campo `required` não estiver
  capturado localmente: foto (e o mínimo), observação preenchida, assinatura desenhada, produtos. O
  bloqueio é do botão, nunca uma recusa depois do toque.
- **RF8** A API recusa o registro que chega sem o que o tipo efetivo exige, com código de erro
  estável por campo. `TripOccurrenceNoteRequiredError` (`TRIP_OCCURRENCE_NOTE_REQUIRED`) e
  `TripOccurrenceAttachmentRequiredError` continuam valendo; a assinatura ganha o seu.
- **RF9** A assinatura da ocorrência sobe pelo mesmo par `occurrence-uploads` + `confirm` da 179 e
  é guardada na coluna **`signature_object_id`** da ocorrência, com FK composta para
  `stored_objects`. **Nunca** vira linha de `trip_document_occurrence_attachments` (contaria como
  foto no mínimo, no expurgo e no demonstrativo) e **nunca** entra em `trip_delivery_proofs`, na
  pontualidade nem na nota do motorista.
- **RF10** O painel ganha a aba **Tipos** em `/ocorrencias` e perde a aba "Tipos de ocorrência" em
  Configurações. O registro central de endereços (`SETTINGS_PANEL_PLACEMENT`) continua com um
  endereço por painel.
- **RF11** A lista é de **tipos recolhidos**, um por linha, e o operador abre só os que quer ver.
  A linha fechada já diz o que importa sem abrir: nome, os momentos, as quatro exigências em
  forma curta e quantas exceções o tipo tem. Aberto, o tipo mostra tudo — incluindo as exceções,
  **sem um segundo nível de recolhimento**.
- **RF11b** A aba tem **busca** no topo, por nome do tipo e por nome ou CNPJ de quem tem exceção,
  mais **filtros** combináveis: por momento, por ativo/inativo, por exigência (ex.: só os que exigem
  assinatura), por avisa/não avisa e por "tem exceção". Os filtros são pílulas, no mesmo molde das
  de `TripOccurrenceFilters` na aba vizinha.
- **RF11c** A consulta de exceções não pode multiplicar requisições por linha: uma por tela, não
  uma por tipo.
- **RF12** A tela de verificação (`settings-resolution`) mostra os campos resolvidos por tipo.
- **RF13** **Consequência declarada — WhatsApp do motorista.** O canal não colhe foto nem
  assinatura. Um tipo com assinatura `required` (efetiva) **não é registrável por esse canal**: o
  servidor devolve o erro estável da assinatura, como já devolve `OCCURRENCE_PHOTO_REQUIRED`/anexo
  para foto obrigatória. A lista do WhatsApp **não** é filtrada por exigência nesta spec; o erro
  diz o campo faltante. Quem quiser esconder esses tipos do canal abre spec própria.
- **RF14** O **demonstrativo de ocorrências ao cliente** (`drizzle-occurrence-statement.repository.ts`)
  passa a mostrar a foto de rua (agora em `trip_document_occurrence_attachments`) e a resposta da
  correção também. A assinatura **não** aparece no demonstrativo como foto.

## Requisitos não funcionais

- Migration aditiva, com `rollback.sql`. Nenhum `DROP` de coluna de dado nesta spec; o rollback só
  derruba o que a 246 criou.
- `companyId` do contexto autenticado, nunca do payload. As duas tabelas de exceção já são por
  empresa e continuam. Tabela de momentos no padrão de tenant (`tenant-safety.contract.ts`).
- Nenhum CNPJ, CPF ou nome em log. A exceção se loga pelo id do tipo e pelo id da exceção.
- A aba nova não pode subir consulta de tipo enquanto o operador estiver na aba de ocorrências —
  o escopo de dados por aba é o que `resolveSettingsDataScope` já garante.
- O app do motorista continua funcionando sem rede: a exigência vem do snapshot/cache de tipos
  (`occurrenceTypesCache.service.ts`), e a captura é local.
- **Janela de deploy tolerante:** painel e API leem tipo sem linha de momento pelos derivados de
  `stage`/`flow`; `PUT` sem `moments` mantém os gravados (plan § Momentos).

## Casos extremos e falhas

- **Nota sem contratante ou sem destinatário resolvido** — cai no modo geral do tipo, como hoje.
  Nunca falha o pedido de tipos nem o registro.
- **Cache de tipos velho no aparelho** — o motorista registra sob a exigência que tinha em mãos; o
  servidor é quem recusa se o cadastro endureceu no meio. A mensagem diz qual campo faltou.
- **Exceção que afrouxa o tipo** — a partir da RF6 vale de verdade no servidor (medição T3.0 antes
  de ativar em produção).
- **Exceção cadastrada para CNPJ que não é cliente** — a FK `(companyId, taxId)` da 218 já governa o
  comprovante; a exceção de ocorrência por destinatário usa a mesma FK para `delivery_clients`.
- **Tipo de galpão** — os campos não aparecem na aba e a API ignora o que vier: o momento decide,
  e a regra do galpão é a da 161.
- **Assinatura desenhada e app fechado antes do envio** — o item fica na fila como a foto; a fila
  cheia derruba o anexo e nunca o relato (209).
- **Reenvio com a mesma `Idempotency-Key`** — completa o anexo uma vez, nunca sobrescreve.
- **Lote do escritório** — um objeto serve N ocorrências (`purpose delivery_proof`), e o backfill
  da RF1d o transforma em N linhas com o mesmo `stored_object_id`; o expurgo da 161 supõe uma linha
  por objeto (plan § Anexos). Documentado, não resolvido aqui.

## Critérios de aceite

- **CA00** Um tipo com os momentos `separation` e `document` aparece nas duas listas — a do
  separador e a do motorista — com o mesmo id, e a tentativa de registrar no momento que o papel
  não cobre **não grava**: motorista em tipo só-`separation` na rota de nota volta `409
TRIP_DOCUMENT_NOT_REACHABLE`; separador com tipo só-`document` na rota de galpão volta `422
OCCURRENCE_TYPE_NOT_SEPARATION`; escritório com tipo sem `office` volta `422
OCCURRENCE_TYPE_NOT_FIELD`; conta com os dois papéis repete cada caso. Provado por integração.
- **CA00b** A migration converte todo tipo existente nos momentos derivados do par `stage`/`flow`
  (tabela do plan), e nenhuma lista muda de conteúdo — provado por integração sobre dado semeado
  antes da tabela nova, **verificando as linhas da tabela de momentos**, não só as listas (a leitura
  tolerante mascararia um backfill arrancado).
- **CA01** Em `/ocorrencias` existe a aba Tipos; em Configurações não existe mais a aba de tipos de
  ocorrência, e um contrato prova que o painel tem exatamente um endereço.
- **CA02** Um tipo com foto `optional` no geral e `required` por destinatário devolve `required`
  para uma nota daquele destinatário e `optional` para outra — provado por integração, **no
  snapshot e no registro**.
- **CA03** O registro no servidor cobra a exigência **efetiva** da nota: exceção mais estrita
  endurece, exceção menos estrita afrouxa, destinatário vence contratante, e tipo sem exceção cobra
  exatamente o que cobrava (CA04) — provado por integração, com os contratantes e destinatários
  lidos da nota no servidor, nunca do payload.
- **CA04** Cadastro existente **sem exceção** não muda de comportamento: tipo com `attachment_mode =
'required'` continua exigindo foto e observação depois da migration — provado por integração
  sobre dado semeado antes da coluna nova, no **valor da coluna** (T1.3) e no **comportamento do
  registro** (`TRIP_OCCURRENCE_NOTE_REQUIRED`, T2.3b).
- **CA05** O botão de registrar fica desabilitado enquanto faltar campo `required`, e habilita
  assim que o último é capturado, sem rede — provado por contrato no app do motorista.
- **CA06** Registro sem assinatura em tipo que a exige volta erro com código estável, e a
  assinatura gravada não aparece em `trip_delivery_proofs`, na pontualidade, **nem como linha de
  anexo de foto** — provado por integração.
- **CA07** `make migration-test` verde com o `rollback.sql`, com a 241 já aplicada: o rollback não
  derruba `items_mode` do tipo nem as CHECKs da 241, só o que esta spec criou.
- **CA08** Revisão de design e usabilidade da aba nova, com print nas três larguras.
- **CA09** O demonstrativo de ocorrências ao cliente mostra a foto de rua e a resposta da correção,
  e não mostra a assinatura como foto — provado por contrato/integração do demonstrativo.

## Dúvidas

Nenhuma aberta. Fechadas pelo usuário em 2026-10-02 (conjunto de exigências; galpão como está) e em
2026-10-06 (D-a a D-d acima). Decisões tomadas na revisão da spec e registradas em `evidence.md`
(ver "Correções da spec antes de implementar"): RF13 (WhatsApp sem filtro), par
`items_mode`+`items_minimum_count` na exceção, sem CHECK `off ⇒ unset` nas exceções, assinatura
também gravável em `trip_stop_occurrences` sem escritor.
