# Feature 245 — A exigência da ocorrência chega na rua

## Problema e resultado

A empresa já declara o que uma ocorrência precisa trazer, e já declara exceções por contratante e
por destinatário. Nada disso está onde se procura, e a parte por CNPJ não produz efeito nenhum.

Três defeitos de um fato só:

1. **A exceção por CNPJ é inerte.** A rota do motorista aceita `contractorId` e `recipientTaxId` e
   resolve as três camadas corretamente (`list-field-occurrence-types.use-case.ts`), mas o app do
   motorista chama `/me/trips/current/occurrence-types` sem os dois parâmetros — o snapshot da
   viagem não carrega contratante nem destinatário da nota. O motorista sempre recebe o modo geral
   do tipo. Quem cadastra a exceção no painel vê a linha gravada e acredita que ela vale na rua.
   A spec 218 registrou a pendência de propósito (`tasks.md:138`); é esta spec.
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
registrado, o que ele exige — foto, observação e assinatura, cada um desligado, opcional ou
obrigatório — e para quais CNPJs a regra é outra. O motorista recebe a exigência que vale para
**aquela** nota, incluindo a exceção, e o botão de registrar só libera quando o que foi pedido está
capturado no aparelho.

Protótipo da tela em [`preview.html`](preview.html), no tema real do painel.

## Pré-condição: a spec 241 já aplicada

Esta spec **não executa antes** da [241](../241-o-tipo-da-ocorrencia-diz-se-ela-carrega-itens/spec.md):
a 241 (menor, sem exigência na rua) vai primeiro e é ela quem **cria** o eixo de produtos. Só a
consome aqui.

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

## Fora do escopo

- **A exigência no momento de galpão (`separation`).** Continua com a regra fixa de 1 a 5 fotos da
  spec 161 (`OCCURRENCE_PHOTO_REQUIRED`). Os dois regimes seguem convivendo; unificá-los mexe no
  fluxo do separador e no WhatsApp, e a 161 deixou isso em aberto por decisão própria. Num tipo
  que tem momento de galpão **e** de rua, os três campos valem só nos de rua, e a tela diz isso.
- **Quantidade mínima de fotos na ocorrência.** A entrega tem `cargoMinimumCount`; a ocorrência
  fica com uma foto. É uma coluna a mais no mesmo molde quando a operação pedir.
- **Nome e documento de quem deu a negativa.** Numa recusa raramente se consegue, e `receivedBy`
  já é decidido como campo que nunca bloqueia (193).
- **Retroatividade.** Ocorrência já gravada não é reavaliada contra a exigência nova.
- **A correção e o cancelamento da ocorrência registrada.** Saíram para a
  [spec 240](../240-a-correcao-da-ocorrencia-ganha-tela/spec.md), que vai primeiro: a API da 167
  está pronta e falta só a tela, então é trabalho independente e muito menor que este.
- **O comprovante de entrega** (`DeliveryProofFieldSettings`) não muda. A foto e a assinatura de
  ocorrência nunca entram em `trip_delivery_proofs` — a spec 209 existe por causa desse defeito.
- **A rota do escritório** em nome do motorista para ocorrência de parada continua mandando só
  `kind` (pendência da 218, paridade incompleta).
- **Tipo `flow: stop` recusado na rota de nota** — outra pendência da 218, defesa em profundidade
  que não depende desta mudança.

## Histórias priorizadas

### P1 — O operador acha o que o tipo exige

**Given** sou operador com `companies.settings` e abro **Ocorrências**
**When** clico na aba **Tipos**
**Then** vejo a lista de tipos agrupada por etapa e, em cada tipo de rua, três campos à vista —
Foto, Observação, Assinatura —, cada um em Desligado / Opcional / Obrigatório
**And** a aba Configurações → Empresa não oferece mais "Tipos de ocorrência": o cadastro tem um
endereço só.

### P1b — Um tipo vale em mais de um momento

**Given** "Avaria" acontece tanto no galpão quanto na rua
**When** marco, no seletor múltiplo de momentos, **Separação no galpão** e **Entrega da nota**
**Then** o mesmo tipo — um id só — aparece para o separador e para o motorista
**And** a permissão continua saindo do momento: quem registra no galpão precisa de `trip.manage` e
quem registra na rua, de `trip.report`
**And** tipo sem nenhum momento marcado não é aceito — ele não apareceria para ninguém.

### P2 — A exceção por CNPJ fica à vista

**Given** estou na aba Tipos
**When** olho um tipo de rua
**Then** vejo, sem abrir acordeão, quantas exceções ele tem e para quem — por contratante e por
destinatário, identificados por nome e CNPJ
**And** consigo adicionar, trocar o modo e remover uma exceção ali mesmo
**And** cada exceção declara os três campos, não só a foto.

### P3 — A exigência que vale é a daquela nota

**Given** o tipo "Recusa total" pede foto opcional no geral, mas é obrigatória para o destinatário
`12.345.678/0001-90`
**When** o motorista abre a ocorrência de uma nota desse destinatário
**Then** o app recebe `required` para a foto — a exceção do destinatário vence a do contratante, que
vence o geral
**And** numa nota de outro destinatário o mesmo tipo volta a `optional`.

### P4 — O motorista não registra sem o que foi pedido

**Given** o tipo efetivo exige foto e assinatura
**When** o motorista preenche a ocorrência
**Then** o botão de registrar só habilita com a foto capturada **e** a assinatura desenhada no
aparelho, sem depender de rede
**And** o envio continua pela fila: a ocorrência nunca espera o upload terminar (209 D2).

### P5 — A verificação diz a verdade

**Given** abro a tela de verificação de configuração para um contratante e um destinatário
**When** consulto um tipo de ocorrência
**Then** vejo os três campos resolvidos, com a camada que decidiu cada um.

## Requisitos funcionais

- **RF0** O tipo declara um **conjunto** de momentos, nunca menos de um. O vocabulário é fechado e
  sai do que existe hoje: `separation` (separação no galpão), `document` (entrega da nota),
  `stop` (chegada à parada) e `office` (escritório, em nome do motorista). O conjunto substitui
  `stage` + `flow`, que eram dois campos de valor único.
- **RF0b** A permissão continua decidida pelo momento, não pelo tipo: `separation` é `trip.manage`,
  os de rua são `trip.report`. Um tipo com momentos dos dois lados é registrável pelos dois papéis,
  cada um no seu momento — e **nunca** amplia o que um papel podia fazer no momento do outro.
- **RF1** O tipo de ocorrência passa a declarar quatro exigências independentes — `photoMode`,
  `noteMode`, `signatureMode` e `itemsMode` (produtos da nota) —, cada uma em `off` / `optional` /
  `required`, reaproveitando `DELIVERY_PROOF_FIELD_MODES`. Nenhum vocabulário novo. `itemsMode` **já existe no tipo** (spec 241);
  aqui entram `photoMode`, `noteMode` e `signatureMode`, e o `itemsMode` ganha o estado `required` e
  passa a existir nas duas tabelas de exceção.
- **RF1a** Os quatro campos usam **o mesmo seletor de três estados, com as mesmas três palavras**:
  Desligado · Opcional · Obrigatório. Nada de "Sem foto", "Pelo menos um produto" e outras
  redações por campo — quatro vocabulários para um eixo só obrigam a reler cada linha, e é o que
  a tela de hoje faz. O que cada estado significa por campo fica numa linha de dica abaixo da
  grade, uma vez, não repetido em cada rótulo.
- **RF1b** `itemsMode = required` exige **ao menos um produto** marcado. A seleção de produto, a
  quantidade e a unidade já existem (166/172) e não mudam; o que entra é a exigência. O
  `allows_multiple_items`, que hoje é coluna invisível no painel, aparece na aba ao lado dela —
  um produto ou vários é escolha do mesmo cadastro.
- **RF1c** `photoMode = required` aceita uma **quantidade mínima** de fotos, de 1 a 5, no molde do
  `cargoMinimumCount` da entrega. Lida só quando a foto é obrigatória.
- **RF1c2** `itemsMode = required` aceita o mesmo: uma **quantidade mínima de produtos**, ou a
  opção **todos os itens da nota** — que é o caso da recusa total, onde exigir "pelo menos um"
  deixa passar ocorrência pela metade. Lida só quando Produtos é obrigatório.
- **RF1h** Os controles são os **componentes que a aplicação já tem**, não `<select>` nativo nem
  invenção da tela: `Select` para os quatro modos e para os campos de valor único, `MultiSelect`
  para os momentos, `SearchableSelect` para escolher o cliente da exceção. Filtro continua pílula,
  como em `TripOccurrenceFilters` da aba vizinha. Tela nova que desenha o próprio controle é como
  nasce o segundo design system.
- **RF1d** Para cumprir a RF1c, a ocorrência de rua passa a guardar suas fotos em
  `trip_document_occurrence_attachments` — a tabela que a spec 161 criou para o galpão —, com
  backfill da coluna `attachment_object_id` e leitura unificada. É a pendência que a 161 deixou
  registrada; sem ela não há como pedir mais de uma foto na rua.
- **RF1e** O aviso ao contratante entra na aba junto do resto do cadastro: o interruptor
  `notifies`, a **seleção do modelo de notificação** (`emailTemplateKey`, lista dos modelos
  cadastrados, com o conteúdo visível antes de escolher) e a política de reentrega
  (`redeliveryPolicy`) — colunas que já existem e que o painel atual edita. Mudar de endereço não
  é desculpa para perder campo, e escolher modelo às cegas por uma chave é o que a tela antiga
  fazia.
- **RF1f** O destinatário da exceção é **escolhido numa lista**, não digitado: o seletor busca por
  nome ou CNPJ entre os clientes cadastrados, no mesmo molde do seletor de contratante. CNPJ
  digitado à mão entra errado e a exceção silenciosamente nunca casa.
- **RF2** `attachment_mode` é a exigência da **foto** e continua sendo a mesma coluna, renomeada
  conceitualmente, sem perder o que está gravado. Nada de coluna paralela.
- **RF3** A regra fixa "`required` arrasta a observação" sai do caso de uso e vira dado: na
  migration, todo tipo com foto `required` nasce com observação `required`. O comportamento
  observável não muda para nenhum cadastro existente.
- **RF4** As duas tabelas de exceção (`company_occurrence_type_contractor_overrides` e
  `company_occurrence_type_recipient_overrides`) passam a carregar os três modos, com o mesmo
  backfill da RF3.
- **RF5** A resolução em três camadas — destinatário > contratante > tipo > `off` — vale campo a
  campo, e continua saindo de `resolve-with-overrides.policy.ts`. Nenhuma segunda implementação.
- **RF6** O snapshot da viagem do motorista passa a carregar `contractorId` e `recipientTaxId` de
  cada nota, e o app os envia ao pedir os tipos. Ausentes, o comportamento é o de hoje: cai no modo
  geral do tipo.
- **RF7** O app do motorista bloqueia o registro enquanto um campo `required` não estiver
  capturado localmente: foto, observação preenchida, assinatura desenhada. O bloqueio é do botão,
  nunca uma recusa depois do toque.
- **RF8** A API recusa o registro que chega sem o que o tipo efetivo exige, com código de erro
  estável por campo. `TripOccurrenceNoteRequiredError` e `TripOccurrenceAttachmentRequiredError`
  continuam valendo; a assinatura ganha o seu.
- **RF9** A assinatura da ocorrência sobe pelo mesmo par `occurrence-uploads` + `confirm` da 179 e
  é guardada como anexo da ocorrência. Ela **nunca** entra em `trip_delivery_proofs`, na
  pontualidade nem na nota do motorista.
- **RF10** O painel ganha a aba **Tipos** em `/ocorrencias` e perde a aba "Tipos de ocorrência" em
  Configurações. O registro central de endereços (`SETTINGS_PANEL_PLACEMENT`) continua com um
  endereço por painel.
- **RF11** A lista é de **tipos recolhidos**, um por linha, e o operador abre só os que quer ver.
  A linha fechada já diz o que importa sem abrir: nome, os momentos, as quatro exigências em
  forma curta e quantas exceções o tipo tem. Aberto, o tipo mostra tudo — incluindo as exceções,
  **sem um segundo nível de recolhimento**. Um acordeão dentro de outro é o que esconde a exceção
  por CNPJ hoje.
- **RF11b** A aba tem **busca** no topo, por nome do tipo e por nome ou CNPJ de quem tem exceção —
  achar "quem tem regra diferente" é a pergunta que a tela precisa responder quando a lista
  cresce —, mais **filtros** combináveis: por momento, por ativo/inativo, por exigência (ex.: só
  os que exigem assinatura), por avisa/não avisa e por "tem exceção". Os filtros são pílulas, no
  mesmo molde das de `TripOccurrenceFilters` na aba vizinha, para a aba nova não inventar um
  segundo vocabulário de filtro na mesma tela.
- **RF11c** A consulta de exceções não pode multiplicar requisições por linha: uma por tela, não
  uma por tipo. É o motivo de a seção de hoje só carregar ao abrir, e a correção é a consulta em
  lote, não manter o acordeão.
- **RF12** A tela de verificação (`settings-resolution`) mostra os três campos resolvidos por tipo.

## Requisitos não funcionais

- Migration aditiva, com `rollback.sql`. Nenhum `DROP` de coluna nesta spec.
- `companyId` do contexto autenticado, nunca do payload. As duas tabelas de exceção já são por
  empresa e continuam.
- Nenhum CNPJ, CPF ou nome em log. A exceção se loga pelo id do tipo e pelo id da exceção.
- A aba nova não pode subir consulta de tipo enquanto o operador estiver na aba de ocorrências —
  o escopo de dados por aba é o que `resolveSettingsDataScope` já garante.
- O app do motorista continua funcionando sem rede: a exigência vem do cache de tipos
  (`occurrenceTypesCache.service.ts`), e a captura é local.

## Casos extremos e falhas

- **Nota sem contratante ou sem destinatário resolvido** — cai no modo geral do tipo, como hoje.
  Nunca falha o pedido de tipos.
- **Cache de tipos velho no aparelho** — o motorista registra sob a exigência que tinha em mãos; o
  servidor é quem recusa se o cadastro endureceu no meio. A mensagem diz qual campo faltou.
- **Exceção cadastrada para CNPJ que não é cliente** — a FK `(companyId, taxId)` da 218 já governa o
  comprovante; a exceção de ocorrência por destinatário é por `taxId` livre e segue assim.
- **Tipo de galpão** — os três campos não aparecem na aba e a API ignora o que vier: a etapa decide,
  e a regra do galpão é a da 161.
- **Assinatura desenhada e app fechado antes do envio** — o item fica na fila como a foto; a fila
  cheia derruba o anexo e nunca o relato (209).
- **Reenvio com a mesma `Idempotency-Key`** — completa o anexo uma vez, nunca sobrescreve.

## Critérios de aceite

- **CA00** Um tipo com os momentos `separation` e `document` aparece nas duas listas — a do
  separador e a do motorista — com o mesmo id, e a tentativa de registrar no momento que o papel
  não cobre volta 403, não 200. Provado por integração, com o par de papéis.
- **CA00b** A migration converte todo tipo existente em exatamente um momento, derivado do par
  `stage`/`flow` que ele já tinha, e nenhuma lista muda de conteúdo — provado por integração sobre
  dado semeado antes da tabela nova.
- **CA01** Em `/ocorrencias` existe a aba Tipos; em Configurações não existe mais a aba de tipos de
  ocorrência, e um contrato prova que o painel tem exatamente um endereço.
- **CA02** Um tipo com foto `optional` no geral e `required` por destinatário devolve `required`
  para uma nota daquele destinatário e `optional` para outra — provado por integração.
- **CA03** O snapshot do motorista traz `contractorId` e `recipientTaxId` por nota, e o app os
  envia na consulta de tipos — provado por contrato no app e por integração na API.
- **CA04** Cadastro existente não muda de comportamento: tipo com `attachment_mode = 'required'`
  continua exigindo foto e observação depois da migration — provado por integração sobre dado
  semeado antes da coluna nova.
- **CA05** O botão de registrar fica desabilitado enquanto faltar campo `required`, e habilita
  assim que o último é capturado, sem rede — provado por contrato no app do motorista.
- **CA06** Registro sem assinatura em tipo que a exige volta erro com código estável, e a
  assinatura gravada não aparece em `trip_delivery_proofs` nem na pontualidade — provado por
  integração.
- **CA07** `make migration-test` verde com o `rollback.sql`, com a 241 já aplicada: o rollback não
  derruba `items_mode` do tipo, só o que esta spec criou.
- **CA08** Revisão de design e usabilidade da aba nova, com print nas três larguras.

## Dúvidas

Nenhuma. As duas decisões de produto que bloqueavam foram fechadas pelo usuário em 2026-10-02:
o conjunto de exigências é **foto, observação e assinatura de quem deu a negativa**, e a ocorrência
de galpão **fica como está**.
