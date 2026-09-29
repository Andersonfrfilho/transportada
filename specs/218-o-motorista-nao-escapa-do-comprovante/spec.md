# Feature 218 — O motorista não escapa do comprovante

- **Origem:** pedido do usuário em conversa (29/09/2026). Ele apertou "Entreguei" no app do
  motorista, viu a nota virar "concluída" sem que nada exigisse a foto do canhoto, e perguntou:
  "se não a pessoa pode nunca subir comprovantes". Na mesma conversa pediu telas de configuração de
  comprovante e de ocorrência com granularidade "às vezes por contratante".
- **Numeração:** conferida em 29/09/2026 com `ls specs` e `git ls-tree origin/staging -- specs/`. A
  217 é a mais alta nos dois. A 218 estava livre.
- **Specs do mesmo assunto, lidas antes:**
  - 082: origem do painel de comprovante e da exceção por CNPJ do destinatário (ADR-0057).
  - 156: interruptor de leitura do canhoto por OCR, mesma exceção por CNPJ (ADR-0069).
  - 159: "o aviso nunca bloqueia o botão abaixo" (RF12) — **esta spec substitui essa regra, só
    quando algum campo do comprovante efetivo está `required`**; sem campo obrigatório, o
    comportamento da 159 continua valendo palavra por palavra.
  - 179: `attachmentMode` (`required|optional|off`) em `company_occurrence_types` — o mesmo
    vocabulário de três estados do comprovante, aplicado à ocorrência.
  - 209: D2 — "a ocorrência nunca espera a foto", decisão deliberada para o formulário "Deu
    problema" (`DriverStopOccurrenceForm`) não ficar refém de um `PUT` que falha por rede/CSP.
    **Esta spec não revoga essa parte de D2** (a foto continua subindo depois, como item
    separado da fila) — o que muda é exigir a **captura local** (o toque em "Tirar foto", sem
    rede nenhuma) antes de habilitar o botão que registra a ocorrência, quando o `attachmentMode`
    efetivo for `required`. Ver RF-A5.
  - 079: origem do registro de ocorrência por nota (`onDocumentOccurrence`, sem fila, sem foto) —
    esta spec funde essa UI com a de 209 num botão só (D1 abaixo), sem mexer na tabela por trás
    (`trip_document_occurrences` continua distinta de `trip_stop_occurrences`).
  - 193: `receivedBy`/quem recebeu nunca bloqueia — continua assim, esta spec não mexe nisso.
  - 203/207/211: "o anexo nunca é descartado", "Concluir nunca trava", miniatura própria por
    anexo — o comportamento de quem já preenche o formulário continua valendo; o que muda é
    **quando** o formulário aparece.
  - Nenhuma spec anterior trata "por contratante" nem em comprovante nem em ocorrência — confirmado
    por investigação dedicada (grep em `specs/*/spec.md` e `specs/*/plan.md`) antes de escrever esta.
- **Correção de vocabulário, registrada aqui para não se perder de novo:** o mecanismo de exceção
  que já existe (`delivery_proof_setting_overrides`) é comumente citado como "por contratante" no
  comentário do próprio schema, mas a política (`delivery-proof-settings.policy.ts`) casa pelo
  **CNPJ do destinatário da nota** (`deliveryClients`), não pelo embarcador (`contractors`). Esta
  spec cria as duas chaves, lado a lado, para os dois assuntos (comprovante e ocorrência).

## Problema e resultado

**Problema.** Duas lacunas, uma de comportamento e uma de configuração:

1. Marcar "Entreguei" nunca depende de o motorista já ter anexado a foto/assinatura do canhoto,
   mesmo quando a empresa configurou esse campo como `required`. O aviso (`isProofPendingWarningDue`,
   spec 159 RF12) é visível, mas nada impede a nota de "sumir" da lista de pendências sem a prova —
   na prática, quem quiser nunca sobe comprovante algum.
2. A granularidade de exceção que já existe para comprovante (por CNPJ do destinatário) não existe
   para ocorrência, e nenhuma das duas tem uma segunda chave por contratante (embarcador) —
   só dá para dizer "essa loja sempre exige assinatura", nunca "essa transportadora contratante
   sempre exige foto na ocorrência", nem as duas ao mesmo tempo com uma regra clara de quem vence.
3. O registro de ocorrência tem o mesmo problema do item 1, e em dobro: hoje são **dois** botões
   diferentes ("Deu problema", por parada, com foto opcional; "Registrar ocorrência", por nota, sem
   foto nenhuma), nenhum dos dois trava por `attachmentMode: required` — no segundo, a foto nem
   existe como opção.
4. Com três camadas de configuração (geral, contratante, destinatário) e duas telas (comprovante e
   ocorrência), o operador não tem como responder "o que vale para a nota da Alfa entregue ao
   Mercado Central?" sem abrir as duas telas e somar a precedência de cabeça.

**Resultado.**

- **(A) Gate no app do motorista — entrega.** "Entreguei" só confirma a entrega sem pedir nada
  quando **nenhum** campo do comprovante efetivo (após resolver geral → contratante →
  destinatário, o mais específico vencendo) está `required`. Havendo pelo menos um campo
  `required`, o toque abre o formulário de captura ali mesmo, na parada — e só confirma a entrega
  quando os campos `required` estiverem preenchidos. Empresa sem nenhum campo obrigatório não
  percebe mudança nenhuma.
- **(A5) Um botão só de ocorrência, com o mesmo gate.** Pedido do usuário: os dois caminhos viram
  **um** — um botão, uma lista com todos os tipos, cada um carregando o próprio `attachmentMode`.
  Com `required` efetivo, o botão que registra não habilita sem a foto já capturada no aparelho
  (não sem rede — a foto continua subindo depois, pela fila, como já é hoje). Ver D1.
- **(B) Exceção de ocorrência por contratante e por destinatário.** `attachmentMode` de cada tipo de
  ocorrência passa a aceitar uma exceção por contratante e uma por destinatário, com a mesma regra
  de precedência do item A.
- **(C) A exceção de comprovante por destinatário ganha FK de verdade** (hoje é `taxId` solto, só
  com `CHECK` de formato) **e ganha uma segunda exceção, por contratante** — as duas convivem, com
  destinatário vencendo contratante quando as duas se aplicam à mesma nota.
- **(E) Tela de verificação.** O painel ganha uma tela só de leitura onde o operador escolhe um
  contratante e/ou um destinatário e vê, lado a lado, o comprovante efetivo (os 5 campos) e o
  `attachmentMode` efetivo de cada tipo de ocorrência — a mesma resolução de 3 camadas que o app do
  motorista usa, sem precisar simular uma nota de verdade para descobrir o que vale.

## Decisões

- **D1 — Um botão só de ocorrência (pedido do usuário em conversa, 29/09/2026).** "Deu problema"
  (`DriverStopOccurrenceForm`, spec 209, com foto) e "Registrar ocorrência"
  (`onDocumentOccurrence`, spec 079, sem foto) viram uma única UI: um botão, uma lista com **todos**
  os tipos de ocorrência da empresa, cada um mostrando se pede foto (`attachmentMode` efetivo).
  Escolher um tipo `required` exige a foto antes de habilitar "Registrar" — escolher um `optional`
  ou `off` segue como hoje (foto opcional ou ausente).
  - **A Fase 0 de execução (T0/T0b, já rodada ao fechar esta versão da spec) achou algo mais sério
    do que "falta uma regra de roteamento":** os dois caminhos usam **modelos de dado diferentes**.
    Ocorrência de nota já é `occurrenceTypeId` (FK para `company_occurrence_types`, com
    `attachmentMode` de verdade). Ocorrência de parada é `kind`, um **enum fixo em código**
    (`TRIP_STOP_OCCURRENCE_KINDS`/`DRIVER_OCCURRENCE_KINDS`: `unexpected_charge`, `long_wait`,
    `dock_closed`, `appointment_required`, `other`) que nunca passou pelo catálogo e nunca teve
    `attachmentMode` — sempre uma foto opcional, igual pros 5 valores. Achado completo em
    `evidence.md`.
  - **Resolução (decidida com o usuário): migrar o enum fixo para dentro do catálogo.** Os 5
    valores de `kind` viram 5 linhas novas de `company_occurrence_types`, uma vez, por empresa —
    ganhando `attachmentMode` de verdade como qualquer outro tipo. Ver RF-B5 para o desenho da
    migration.
  - **Cada tipo do catálogo ganha um campo `flow` (`document | stop`), editável na mesma tela onde
    `attachmentMode` já é editado hoje** (`OccurrenceTypeCatalogPanel` — pedido explícito do
    usuário: "igual lá no cadastro de ocorrência", nenhuma tela nova para isso). É o `flow` que diz
    ao componente único para qual das duas rotas/tabelas mandar o registro — o motorista nunca
    escolhe isso, só o tipo.
  - **O que muda:** a UI (um componente, reaproveitando `ProofCaptureFields` da RF-A2), o cadastro
    de tipos (ganha o campo `flow`), e a experiência do motorista (nunca mais precisa adivinhar
    qual dos dois botões usar).
  - **O que não muda:** as duas tabelas de **registro** por trás continuam separadas
    (`trip_document_occurrences`, spec 164/append-only com `trip_occurrence_cases`;
    `trip_stop_occurrences`, spec 209, com `attachment_object_id`) — só o **vocabulário de tipos**
    se unifica no catálogo. Fundir as tabelas de registro misturaria a tratativa da 164 (que é só de
    ocorrência **por nota**) com a de parada, e não foi pedido; tipo com `flow: stop` nunca abre
    `trip_occurrence_cases`.
  - **Por que a fila continua assimétrica:** ocorrência por nota (079/164) nunca teve fila offline
    — é chamada direta, síncrona, e abre tratativa (`trip_occurrence_cases`) que o escritório
    trabalha depois. Trocá-la para fila offline é mudança de arquitetura maior, fora do pedido
    desta conversa; o gate de RF-A5 exige a foto **antes do clique**, então funciona igual nas duas
    rotas sem precisar decidir isso agora.

## Fora do escopo

- Mudar o comportamento de "Não entreguei" (spec 179) — já captura a foto antes de confirmar.
- Mudar `receivedBy`/quem recebeu — continua nunca bloqueante (spec 193 D6, R2/C1).
- Retroatividade: notas já entregues sem comprovante antes desta spec não são reabertas. A tela
  "Fotos pendentes" (spec 159 T9) continua existindo como via de catch-up para esses casos e para o
  escape hatch de lançamento tardio.
- Editar/excluir contratante ou destinatário — cadastro deles é automático (ADR-0048), esta spec só
  lê as duas tabelas.
- Mudar `emailsContractor`, `redeliveryPolicy`, `leavesDocumentBehind` de tipo nenhum, existente ou
  novo — os 5 tipos que nascem com `flow: stop` (RF-B5) recebem o padrão de sempre (`false`/`unset`),
  porque tipo de parada nunca abre tratativa (spec 164) nem manda e-mail ao contratante; ninguém
  edita esses três campos à mão nesta spec.
- Portal do contratante (`contractor-portal`) — a config é só do painel do escritório.

## Histórias priorizadas

### P1 — Comprovante obrigatório trava a entrega

**Given** a empresa configurou `photo: required` no comprovante (geral, ou por exceção de
contratante/destinatário que resolve para `required` nesta nota)
**When** o motorista toca "Entreguei" numa nota dessa parada sem ter tirado a foto
**Then** a entrega não é confirmada — o formulário de comprovante abre na hora, com a foto marcada
como pendente, e só depois de anexada o toque em "Confirmar entrega" grava o `deliver` e a nota vira
"concluída".

### P2 — Empresa sem campo obrigatório não muda nada

**Given** a empresa não tem nenhum campo `required` no comprovante efetivo desta nota
**When** o motorista toca "Entreguei"
**Then** a entrega confirma na hora, exatamente como hoje (spec 159/203), e o comprovante continua
podendo ser anexado depois.

### P3 — Exceção de ocorrência por contratante

**Given** o operador configurou, no tipo de ocorrência "Endereço não encontrado", uma exceção para o
contratante "Distribuidora Alfa" com `attachmentMode: required`
**When** o motorista registra essa ocorrência numa nota cujo emitente é a Distribuidora Alfa
**Then** a foto é exigida no formulário da ocorrência, mesmo que o tipo, na configuração geral,
tenha `attachmentMode: optional`.

### P4 — Destinatário vence contratante

**Given** o contratante "Distribuidora Alfa" tem exceção de comprovante `photo: off`, e o
destinatário "Mercado Central" (que recebe cargas da Alfa) tem exceção `photo: required`
**When** o motorista entrega uma nota da Alfa para o Mercado Central
**Then** o efetivo é `required` — o destinatário, por ser a exceção mais específica, vence.

### P5 — Ocorrência obrigatória trava o registro, no botão único

**Given** o tipo de ocorrência "Endereço não encontrado" resolve como `attachmentMode: required`
para esta nota
**When** o motorista abre o botão único de ocorrência, escolhe esse tipo e tenta registrar sem ter
tirado a foto
**Then** o botão de registrar fica desabilitado, com a foto marcada como pendente; assim que o
motorista tira a foto (sem precisar de rede), o botão habilita e o registro segue pelo `flow` do
tipo (fila offline com dois itens se `stop`; chamada direta se `document`) — o motorista não
escolhe a rota, só o tipo.

### P6 — Verificar antes de perguntar ao motorista

**Given** o operador configurou exceções de comprovante e de ocorrência para vários contratantes e
destinatários
**When** ele abre a tela de verificação e escolhe "Distribuidora Alfa" + "Mercado Central"
**Then** vê, sem editar nada, o comprovante efetivo (5 campos) e o `attachmentMode` efetivo de cada
tipo de ocorrência para essa combinação — a mesma conta que o app do motorista faria.

## Requisitos funcionais

**RF-A1** `DocumentRow`/`DriverStopCard` calculam o plano efetivo do comprovante
(`resolveProofFormPlan`) a partir do valor já resolvido pelo servidor no snapshot
(`document.deliveryProof`, RF-C3 abaixo passa a incluir a resolução de 3 níveis). Se
`listMissingProofFields` (já existente, `proofFormPlan.service.ts`) para o estado atual de
anexos/campos devolve lista vazia, o botão "Entreguei" se comporta como hoje. Se a lista tem algum
item, o botão vira "Confirmar entrega", desabilitado, e o mesmo formulário de captura de
`DeliveryProofSection` (foto, assinatura, nome, documento — **não** `receivedBy`, que nunca bloqueia)
renderiza ali, antes da confirmação.

**RF-A2** O componente de captura usado antes da entrega é o **mesmo** código do usado depois (spec
159 T9 já pede isso para a tela "Fotos pendentes") — extrair o miolo de `DeliveryProofSection` (a
grade de botões, as miniaturas, os campos) para um componente interno reaproveitado nos dois
contextos, parametrizado por "o que fazer quando os obrigatórios completam" (hoje: `handleComplete`
nunca bloqueia; no gate novo: habilita o botão de confirmar, que é quem chama `onDeliver`).

**RF-A3** Cada `attach()` continua enfileirando a foto/assinatura imediatamente, como hoje (spec 203)
— o gate não atrasa o upload do anexo, só atrasa o clique que confirma `deliver`. Isso preserva a
mesma ordem de fila e a mesma garantia offline que já existem.

**RF-A4** O lançamento tardio (escape hatch "Registrar entrega depois") passa pelo mesmo gate — não
há exceção para ele. Se a empresa/contratante/destinatário exige comprovante, o registro tardio
também exige.

**RF-A5** (D1) Os dois caminhos de ocorrência do app do motorista viram um componente único de
registro:

- Lista **todos** os tipos de ocorrência da empresa (hoje divididos entre o painel "Registrar
  ocorrência" por nota e o formulário "Deu problema" por parada, depois de RF-B5 unificados no
  mesmo catálogo), cada um com o próprio `attachmentMode` efetivo visível.
- Escolher um tipo mostra a captura de foto (`ProofCaptureFields`, RF-A2) sempre que
  `attachmentMode !== 'off'`; com `required`, o botão de registrar só habilita depois da foto
  capturada localmente (sem rede).
- Ao confirmar, o registro sai pela rota que o campo `flow` do tipo escolhido manda: chamada direta
  e sem fila para `flow: document` (spec 079/164), dois itens na fila offline para `flow: stop`
  (spec 209) — o motorista nunca escolhe a rota, só o tipo.

**RF-B5** (D1) Migration do vocabulário de tipos de ocorrência de parada:

- `company_occurrence_types` ganha a coluna `flow` (`text`, `document | stop`, `not null default
'document'`) — todo tipo existente é `document` por definição (nunca foi usado em `trip_stop_occurrences`
  antes desta spec).
- Migration insere, uma vez, 5 linhas novas por empresa em `company_occurrence_types` — uma por
  valor de `TRIP_STOP_OCCURRENCE_KINDS` (`unexpected_charge`, `long_wait`, `dock_closed`,
  `appointment_required`, `other`), com `flow: 'stop'`, `attachmentMode: 'optional'` (mesmo
  comportamento de hoje: foto sempre oferecida, nunca obrigatória, até o operador mudar), e o
  `name` traduzido igual ao rótulo que o app já mostra hoje para cada `kind`.
- `trip_stop_occurrences` ganha `occurrence_type_id uuid` (FK para `company_occurrence_types.id`,
  nullable), backfilled por `(company_id, kind)` → a linha nova correspondente da mesma empresa. A
  coluna `kind` **não é apagada** — continua como registro histórico de qual valor fixo gerou aquele
  tipo, e nada além do backfill lê `kind` depois desta spec.
- `OccurrenceTypeCatalogPanel` ganha o campo `flow` no formulário de cada tipo (select de 2 opções,
  ao lado de `attachmentMode`) — nenhuma tela nova.

**RF-B1** Nova granularidade de exceção para `company_occurrence_types.attachment_mode`:

- `company_occurrence_type_contractor_overrides` — `(companyId, occurrenceTypeId, contractorId)`
  único, um `attachmentMode`.
- `company_occurrence_type_recipient_overrides` — `(companyId, occurrenceTypeId, taxId)` único
  (mesma forma canônica de CPF/CNPJ da tabela irmã de comprovante), um `attachmentMode`.

**RF-B2** Resolução: `override do destinatário ?? override do contratante ?? attachmentMode do tipo
?? 'off'` — mesma função pura reaproveitada por comprovante e ocorrência (RF-D1 abaixo).

**RF-B3** `GET`/`PUT /company-settings/occurrence-types/:occurrenceTypeId/attachment-overrides`
(`settings.manage`), corpo `{ contractorOverrides: [...], recipientOverrides: [...] }`,
substituição total por tipo (mesmo padrão de `replaceOverrides` do comprovante) — não é PATCH
incremental.

**RF-B4** `OccurrenceTypeCatalogPanel` ganha uma seção "Exceções" por tipo (colapsada por padrão,
como o resto do painel), com duas listas editáveis: por contratante (busca em `contractors`) e por
destinatário (busca em `deliveryClients`), mesmo padrão visual do painel de comprovante.

**RF-C1** Nova tabela `delivery_proof_setting_contractor_overrides` — mesma forma de
`deliveryProofSettingOverrides`, trocando `taxId` livre por `contractorId uuid` com FK
`(companyId, contractorId) → contractors(companyId, id)`.

**RF-C2** `deliveryProofSettingOverrides.taxId` (destinatário) ganha FK formal
`(companyId, taxId) → deliveryClients(companyId, taxId)`, `on delete restrict on update cascade`.
Migration faz backfill: toda linha de override cujo `taxId` não tem `deliveryClients`
correspondente ganha uma linha nova em `delivery_clients` (`displayName: ''`, `status: 'active'`,
os campos operacionais vazios) **antes** de criar a constraint — nenhuma exceção configurada se
perde.

**RF-C3** `resolveDeliveryProofSettings` (política) passa a receber três camadas —
`general`, `contractorOverride`, `recipientOverride` — com a mesma precedência de RF-B2:
`recipientOverride ?? contractorOverride ?? general ?? default`. O ponto que hoje resolve por
`recipientTaxId` (`resolveProofSettingsForRecipient`, ou o call site que a snapshot do motorista
usa) passa a resolver também por `emitterTaxId` da nota (o contratante é o emitente da NF-e,
ADR-0048 §1) — a implementação confirma o nome exato da coluna/consulta existente antes de escrever
código (`nfeParticipants`, tabela onde `emitter_tax_id` está gravado hoje).

**RF-C4** `TripDeliveryProofSettingsPanel` ganha a segunda lista de exceção (por contratante), ao
lado da existente (por destinatário, que só perde o rótulo genérico e ganha "Por destinatário"
explícito na tela, para não confundir com a nova).

**RF-D1** A função pura de precedência (`mais específico vence`) é escrita **uma vez**,
parametrizada pelo tipo do valor resolvido (`resolve-with-overrides.policy.ts` ou nome equivalente
no módulo `shared` da API), e reaproveitada por RF-B2 e RF-C3 — nenhum dos dois reimplementa a regra
com as próprias palavras.

**RF-E1** `GET /company-settings/settings-resolution?contractorId=&recipientTaxId=` (`settings.manage`,
os dois parâmetros opcionais, mas pelo menos um informado) devolve `{ deliveryProof: <5 campos
efetivos>, occurrenceTypes: [{ id, name, stage, attachmentMode: <efetivo> }] }`, usando o mesmo
`resolve-with-overrides.policy.ts` de RF-D1 — **nenhuma consulta nova reimplementa a precedência**,
só junta o geral e as duas listas de override já lidas pelas rotas existentes e aplica a função.

**RF-E2** Tela nova (ou aba dentro de uma das duas telas de configuração — a T-série decide o menor
acréscimo de navegação, seguindo web.md §14 "a tela existente manda") com dois campos de busca
(contratante, destinatário), só leitura, mostrando o resultado de RF-E1 numa tabela. Sem escolha
nenhuma, mostra a configuração geral (sem override).

## Requisitos não funcionais

- Nenhuma das duas novas tabelas de override tem coluna própria de auditoria além de
  `createdAt`/`updatedAt` — segue o padrão de `deliveryProofSettingOverrides`.
- Isolamento por `companyId` em toda consulta nova — teste negativo obrigatório em
  `test/*-schema/tenant-safety.contract.ts` (backend.md/database.md).
- `contractorId`/`taxId` de override nunca aparecem em log (mesmo tratamento de PII de CPF que o
  resto do produto já dá a `taxId`).
- Toda rota nova (`attachment-overrides`, `delivery-proof-contractor-overrides`) é `settings.manage`,
  igual às irmãs existentes.

## Casos extremos e falhas

- Contratante ou destinatário apagado/inativado depois de ter override: a FK é `restrict` — não dá
  para apagar a linha de `contractors`/`deliveryClients` enquanto o override existir. Coerente com o
  resto do produto (nenhuma entidade referenciada é removível por `restrict`).
- Nota sem contratante resolvível (emitente não bate com nenhum `contractors.taxId` — não deveria
  acontecer, já que `contractors` nasce do emitente, mas a resolução trata ausência como
  "sem override de contratante", cai para geral).
- Duas exceções empatando (mesmo contratante em duas linhas) é impedido pelo `unique` da tabela —
  não é caso de execução, é caso de escrita rejeitada com 409/400 already coberto pela constraint.
- App do motorista offline no momento de decidir se o gate se aplica: a decisão já vem resolvida no
  snapshot (`document.deliveryProof`/`occurrenceType.attachmentMode` efetivos), então funciona sem
  rede — nenhuma consulta nova acontece no aparelho.
- `trip_stop_occurrences` gravada antes desta spec: `occurrence_type_id` vem `null` do backfill só
  se a empresa não tinha o `kind` correspondente por algum motivo (não deveria acontecer — RF-B5
  semeia os 5 para toda empresa); leitura histórica cai para `kind` quando `occurrence_type_id` for
  nulo, nunca falha.
- Fila cheia (30 itens/50 MB) com o gate ativo: o motorista não consegue completar os campos
  `required` porque o anexo não teve como entrar na fila. Aviso explícito ("fila cheia, libere
  espaço") — não é "nunca trava" (spec 203) porque aqui já estamos no caminho que trava de propósito;
  mas o aviso precisa dizer _por quê_ trava, não só que está travado.

## Critérios de aceite

- Empresa com todo campo `optional`/`off`: nenhuma mudança visível ou de comportamento no app do
  motorista (regressão zero, prova por teste de contrato existente + um novo caso "nada required").
- Empresa com `photo: required` geral: "Entreguei" não confirma sem foto; confirma imediatamente após
  anexada, sem segundo toque em nenhum outro lugar.
- Exceção por contratante e por destinatário, testadas juntas, resolvem pelo destinatário quando as
  duas colidem (P4).
- Migration de `delivery_proof_setting_overrides` roda em banco com override "órfão" (sem
  `deliveryClients` correspondente) sem falhar e sem apagar a exceção.
- `make check` e `make migration-test` verdes; contrato negativo de tenant para as duas tabelas
  novas e para a extensão de `company_occurrence_types`.
- Botão único de ocorrência: os tipos que antes só apareciam em "Deu problema" e os que só
  apareciam em "Registrar ocorrência" aparecem juntos, na mesma lista, cada um com o próprio `flow`.
- Ocorrência com `attachmentMode: required` (`flow: document` ou `flow: stop`): "Registrar" não
  habilita sem foto capturada; habilita e registra normalmente assim que a foto é tirada, sem
  esperar upload, pela rota que o `flow` do tipo manda.
- Migration de RF-B5 roda em banco com empresas que já têm tipos cadastrados (o caso comum hoje) sem
  falhar, sem duplicar tipo e sem perder nenhuma `trip_stop_occurrences` gravada (`kind` preservado).
- Tela de verificação: escolher contratante + destinatário mostra os mesmos valores que o app do
  motorista aplicaria para uma nota real dessa combinação (prova cruzada com o teste de P1/P5).

## Dúvidas

Nenhuma bloqueante. Todas as dúvidas de desenho — qual entidade era "contratante" hoje; se
destinatário e contratante deveriam conviver; como unificar os dois caminhos de ocorrência dado que
usam modelos de dado incompatíveis — foram resolvidas em conversa antes da spec fechar (ver
"Correção de vocabulário", a decisão "os dois" nas Histórias P3/P4, e D1 + RF-B5 para a migration do
enum fixo para o catálogo com o campo `flow`).
