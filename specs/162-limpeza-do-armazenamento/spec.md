# Feature 162 — Limpeza do armazenamento

Origem: pedido do usuário — "precisamos de página para excluir coisas do bucket".

## Problema e resultado

O bucket cresce e ninguém tem como olhar para ele. Foto de canhoto, anexo de candidatura,
comprovante, documento de faturamento e arquivo que ficou sem dono nenhum se acumulam sem tela,
sem relatório de tamanho e sem forma de apagar — a única remoção de objeto que existe hoje é a
limpeza de rollback por requisição (`runWithStoredObjectCleanup`,
`apps/api-transportada/src/trips/application/stored-object-cleanup.service.ts:24`), e ela só cobre
o caso do upload dentro de transação desfeita. `docs/SECURITY.md:169` registra explicitamente o que
falta: "uma varredura periódica (cron) que liste os objetos … sem linha viva que os referencie há
mais de N horas e os apague".

Resultado: uma página de administração onde quem responde pela instalação vê o que ocupa espaço,
acha o que quer apagar, e apaga — **menos o que é guarda legal ou prova**, protegido por camadas
que nenhuma tela contorna.

### O que sobra para apagar, dito sem otimismo

Três respostas do usuário recortaram o escopo depois da primeira redação, e o recorte é grande o
bastante para mudar a promessa da feature. `import_source` e `contractor_mail_raw` são guarda; o
canhoto é guarda. **O maior ganho de espaço que esta spec parecia prometer — os `.zip` de lote da
importação — saiu.** O que sobra é:

| Sobra                                                                     | Tamanho típico                     | Comentário                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| Foto de ocorrência (`trip_stop_occurrences`, `trip_document_occurrences`) | grande, e crescendo                | é a fatia real; a spec 161 acrescenta mais                                      |
| Objeto órfão, sem vínculo nenhum                                          | desconhecido, provavelmente grande | canhoto substituído e upload de transação desfeita (`docs/SECURITY.md:149-174`) |
| `billing_document`                                                        | médio                              | PDF de fatura, regerável                                                        |
| `aggregate_document`, `aggregate_application_attachment`                  | pequeno                            | documento de candidato                                                          |
| Canhoto ilegível, um a um (D8)                                            | pequeno por definição              | exceção nomeada, não fonte de espaço                                            |

A feature continua valendo — mas o que ela limpa é **foto de ocorrência e órfão**, não arquivo
fiscal nem lote de importação. A consequência prática é que a detecção de órfão (D3) deixou de ser
um filtro conveniente e virou **a funcionalidade principal**; se ela não for confiável, sobra pouco.

### O modelo já previa isto, e ninguém ligou

Três colunas de `stored_objects` estão mortas desde que nasceram
(`apps/api-transportada/src/database/storage.schema.ts:45,48,51`): `status='deleted'`,
`deleted_at` e `retention_until` não têm um único escritor nem leitor em produção — medido em
`api-transportada`, `worker-transportada` e `cron-transportada`. E o CHECK
`stored_objects_deleted_check` (`storage.schema.ts:78-81`) amarra `status='deleted'` a `deleted_at`
não nulo.

Ao mesmo tempo, as **16 chaves estrangeiras** que apontam para `stored_objects` — em 13 tabelas,
todas compostas `(company_id, <coluna>) → stored_objects(company_id, id)` — são todas
`onDelete('restrict')`. Nenhuma linha de `stored_objects` referenciada pode ser apagada do banco,
nunca.

Somadas, as duas coisas dizem qual é o desenho: **excluir não é remover a linha, é tirar os bytes e
deixar a lápide.** A linha vira `deleted`, o vínculo continua íntegro, e o objeto sai do bucket.
Esta spec liga o que o schema já desenhou.

## Fora do escopo

- **Apagar objeto do bucket que não tem linha em `stored_objects`.** É outro problema, registrado em
  `docs/SECURITY.md:149-174`: o objeto que sobra quando o processo morre entre o upload e o `catch`,
  ou quando o canhoto é substituído pelo unique `(company, stop_event, kind)`. A tela lista linhas do
  banco; objeto sem linha é invisível para ela e continua dependendo daquela varredura por listagem
  do bucket, que segue pendente. Esta spec não a entrega e não a resolve.
- Excluir empresa, usuário ou qualquer registro de negócio. A tela mexe em arquivo, só.
- Expurgo por retenção de anexo de ocorrência — é a spec 161, em escrita. Esta spec entrega o
  caminho de apagar (§ RF7) que aquela reaproveita; as duas **não** podem inventar caminhos
  diferentes.
- Cota por empresa, alerta de estouro, política automática de retenção por finalidade.

## Histórias priorizadas

### P1 — Enxergar o que ocupa espaço

**Given** um administrador com `storage.read` **When** abre `/armazenamento` **Then** vê o total de
bytes por finalidade e uma lista paginada dos objetos da **sua** empresa, sem nenhuma finalidade
fiscal e sem nenhuma chave de objeto.

### P1 — Achar o que se quer apagar

**Given** a lista aberta **When** filtra por finalidade, período, tamanho mínimo, estado e por
vínculo (`vinculado` ou `órfão`) **Then** a lista responde com os objetos que casam, ordenada do
mais recente para o mais antigo, com paginação por cursor.

### P1 — Apagar, sabendo o que se perde

**Given** objetos selecionados **When** confirma a exclusão **Then** cada objeto vira `deleted`,
entra na janela de arrependimento, e o resultado diz, item a item, o que aconteceu.

### P1 — O que é guarda não está lá para ser clicado

**Given** qualquer usuário, qualquer filtro **When** pede a lista ou manda apagar o id de um XML de
NF-e, CT-e, MDF-e ou NFS-e, de um `import_source` ou de um `contractor_mail_raw` **Then** o objeto
não aparece na lista e o pedido de exclusão é recusado com `422 STORAGE_OBJECT_NOT_PURGEABLE`,
mesmo que o id tenha vindo de fora da tela.

### P1 — O canhoto aparece, marcado, e o lote não o alcança

**Given** a lista com objetos de finalidade `delivery_proof` **When** algum deles tem linha em
`trip_delivery_proofs` **Then** ele aparece **marcado como protegido**, com o motivo escrito, a
caixa de seleção desabilitada, e nenhum lote consegue incluí-lo.

### P2 — O canhoto ilegível tem uma saída, e ela cobra explicação

**Given** um canhoto cuja foto ninguém consegue ler **When** o administrador usa a exclusão
individual por ilegibilidade e escreve o motivo **Then** o objeto é excluído, o motivo vai para a
trilha de auditoria, e **a nota do motorista não muda**.

### P2 — Desfazer enquanto dá

**Given** um objeto excluído há menos de `STORAGE_PURGE_GRACE_DAYS` **When** o administrador pede
restauração **Then** ele volta a `final`, o arquivo volta a ser servido, e a volta fica na trilha.

### P2 — Quem lê um arquivo apagado não recebe erro de sistema

**Given** um registro que aponta para um objeto já excluído **When** alguém pede o download
**Then** recebe `410 STORED_OBJECT_PURGED`, e a tela que o mostra diz "arquivo removido pelo
administrador" — nunca 500, nunca tela quebrada.

## Decisões

### D1 — Permissão própria, em duas: `storage.read` e `storage.purge`

`settings.manage` **não** serve, pelo mesmo argumento que já está escrito no catálogo para
`cargo.measure` (`authorization.policy.ts:84-88`): ela entrega de carona o preço do combustível, a
tabela de frete e a credencial da prefeitura. E ler o que ocupa espaço não é o mesmo que apagar —
a separação é a de `operations.read` / `operations.run` (`authorization.policy.ts:36-42`), com o
mesmo motivo elevado: aqui a ação é irreversível depois da janela.

- `storage.read` — lista e resumo.
- `storage.purge` — exclusão e restauração.

Ambas só para `company-admin` em `COMPANY_ROLE_PERMISSIONS`. Escopo `company` nas duas.

**Tenant.** `companyId` sempre do contexto autenticado, nunca do payload. Toda consulta e toda
escrita filtram por ele, e as FKs compostas `(company_id, id)` impedem alcançar objeto de outra
empresa mesmo com id válido em mãos. Contrato de isolamento obrigatório
(`test/*-schema/tenant-safety.contract.ts`, regra do `apps/api-transportada/CLAUDE.md`).

### D2 — A lista não mostra caminho, e identifica por vínculo

A resposta **nunca** traz `object_key`, `bucket`, `provider` nem `sha256`. Não é enfeite: a mesma
regra já está implementada em `operations.routes.ts:22-23`, cujo `SENSITIVE_KEY_PATTERN` varre
`storagekey|storage_key` das respostas de operação, e em `docs/SECURITY.md:49`.

Cada item devolve:

```
{ id, purpose, purposeLabel, mimeType, sizeBytes, status, createdAt, deletedAt,
  purgeableAt,
  link: { kind: 'linked' | 'orphan', recordType, recordLabel },
  protection: { state: 'purgeable' | 'protected', reason: null | 'delivery_proof',
                individualPurgePath: null | 'illegible' } }
```

**Objeto protegido aparece na lista, marcado, e não some.** A escolha é deliberada e contraria o
instinto de esconder: sumir faz o operador procurar para sempre um arquivo que ele continua vendo no
relatório de espaço. Ele aparece com o rótulo "Protegido — comprovante de entrega", com a caixa de
seleção desabilitada e a razão visível ao passar o mouse (`@/components/ui/tooltip`, nunca `title`
nativo).

Isso vale para o protegido **por vínculo** (D6, classe `by-link`). As sete finalidades protegidas
por inteiro continuam **fora da lista** — o pedido original do usuário é que nem apareçam como
opção. A distinção é entre informar e oferecer: o **resumo** (RF1) conta os bytes de toda
finalidade, inclusive as de guarda, para que o operador entenda onde o espaço foi parar; a
**lista** é onde se age, e ali só entra o que pode ser agido ou o que precisa ser explicado.

`recordLabel` é montado no servidor a partir do registro que referencia o objeto, e é **legível sem
ser PII**: "Canhoto — viagem 1042, parada 3", "Anexo de candidatura — protocolo 8c31", "Documento de
fatura 2026-0417". Nunca nome, telefone, CPF ou e-mail de pessoa (LGPD, `security.md` §1). Órfão
recebe `recordLabel: null` e a tela escreve "Sem vínculo".

Filtros: `purpose`, `from`, `to` (sobre `created_at`), `minSizeBytes`, `status`, `link`.
Ordenação fixa `created_at desc, id desc`. Paginação por cursor keyset com o utilitário do produto
(`shared/keyset-cursor.support.ts`, `decodeKeysetCursor`/`encodeKeysetCursor`), `limit` padrão 25,
teto 100, chave de query fora da lista é `400` — exatamente o desenho de `parseAuditPage`
(`operations.routes.ts:213-220`).

### D3 — Órfão é linha sem nenhuma das 16 referências, e a consulta não varre o banco

**Definição.** Objeto órfão é a linha de `stored_objects` da empresa, com `status <> 'deleted'`, para
a qual não existe nenhuma linha em nenhuma das 16 colunas abaixo:

| Tabela                              | Coluna                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `nfe_import_items`                  | `source_object_id`                                                     |
| `nfe_documents`                     | `xml_object_id`                                                        |
| `nfe_events`                        | `xml_object_id`                                                        |
| `cte_fiscal_documents`              | `xml_object_id`, `cancellation_xml_object_id`                          |
| `mdfe_fiscal_documents`             | `xml_object_id`, `closure_xml_object_id`, `cancellation_xml_object_id` |
| `nfse_fiscal_documents`             | `xml_object_id`, `pdf_object_id`                                       |
| `billing_invoice_documents`         | `object_id`                                                            |
| `aggregate_documents`               | `stored_object_id`                                                     |
| `aggregate_application_attachments` | `stored_object_id`                                                     |
| `trip_stop_occurrences`             | `attachment_object_id`                                                 |
| `trip_delivery_proofs`              | `object_id`                                                            |
| `trip_document_occurrences`         | `attachment_object_id`                                                 |

⚠️ **A spec 161, mesclada, leva esta tabela a 18 colunas em 14 tabelas**: a nova
`trip_document_occurrence_attachments` referencia `stored_objects` por `stored_object_id` e por
`thumbnail_object_id`. Quem implementar a T5 confere o estado de `origin/staging` antes de escrever
os `NOT EXISTS` — a lista é a peça que envelhece mais rápido desta spec, e o contrato de
exaustividade da camada 1 é o que avisa.

(Referências conferidas uma a uma em `apps/api-transportada/src/database/`: `nfe.schema.ts:198,312,825`,
`cte-issuance.schema.ts:200,207`, `mdfe.schema.ts:618,625,632`, `nfse.schema.ts:764,771`,
`billing.schema.ts:288`, `fleet.schema.ts:772`, `aggregate-application.schema.ts:166`,
`trip.schema.ts:1100,1333,1490`.)

**Como a consulta descobre isso sem varrer tudo.** `NOT EXISTS` por coluna, avaliado **linha a linha
na ordem do keyset**, nunca como agregação sobre a tabela inteira: o planejador caminha o índice de
ordenação, testa cada candidata e para em `limit + 1`. Para que cada teste seja uma sondagem de
índice e não um seq scan, a migration cria os índices que faltam — **nenhuma das 16 colunas de FK
tem índice hoje**, porque o Postgres não indexa coluna de chave estrangeira sozinho.

Isso conserta um segundo problema de tabela: sem esses índices, toda verificação `restrict` dessas
16 FKs já é uma varredura sequencial hoje.

Índice de ordenação novo: `(company_id, created_at desc, id desc)`.

⚠️ O filtro `link=orphan` numa empresa onde quase tudo é vinculado caminha muitas linhas para
encher uma página. É o preço aceito em troca de não materializar contagem de referência (que
exigiria gatilho em 13 tabelas, ou um campo que envelhece calado). A RNF4 põe teto nisso.

### D4 — Excluir é tirar os bytes e deixar a lápide; vínculo não se desfaz

`POST /storage/purges`, corpo `{ objectIds: [...] }` de 1 a 50 ids, cabeçalho `Idempotency-Key`
obrigatório (regra de `apis.md`; a instalação já tem `idempotency_records`). Responde `200` com
resultado **por item** — o lote não é tudo-ou-nada, porque recusar 50 por causa de 1 fiscal obriga
o operador a caçar qual era.

| Situação                                                      | `outcome`                                        | Efeito                                                                |
| ------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| Objeto purgável, livre ou vinculado                           | `purged`                                         | `status='deleted'`, `deleted_at=now()`, `retention_until=now()+grace` |
| Já estava `deleted`                                           | `already_purged`                                 | nada; sem trilha nova (nada mudou)                                    |
| Finalidade protegida por inteiro (as 7)                       | `refused_protected` (`reason: 'purpose'`)        | nada                                                                  |
| `delivery_proof` vinculado a `trip_delivery_proofs` (canhoto) | `refused_protected` (`reason: 'delivery_proof'`) | nada — só D8 alcança                                                  |
| `lease_owner` com lease ainda válido                          | `refused_leased`                                 | nada — upload em curso                                                |
| Id inexistente ou de outra empresa                            | `not_found`                                      | nada; a resposta não distingue os dois                                |

**Vinculado pode ser apagado, e o vínculo fica.** A linha permanece e a FK `restrict` continua
satisfeita — por isso não existe desvincular aqui. Desvincular seria esta tela reescrever o registro
de outro módulo (anular `trip_delivery_proofs.object_id`, apagar a linha do comprovante), que é
exatamente o estrago invisível que uma tela de limpeza não pode causar. O que a tela deve é
**avisar**: a confirmação de um lote que contém objetos vinculados lista quais registros perdem o
arquivo, e exige uma segunda confirmação digitada.

**Idempotência.** Repetir o mesmo `Idempotency-Key` devolve a mesma resposta sem tocar o bucket.
Repetir com chave nova sobre objeto já `deleted` devolve `already_purged`. Nos dois casos, nenhuma
segunda linha de trilha.

### D5 — Janela de arrependimento de 7 dias, porque bucket não tem lixeira

**Duas fases, e a escolha é deliberada.**

1. **Na hora**, ao clicar: a linha vira `deleted`, e o arquivo **para de ser servido imediatamente**
   — é isso que o operador pediu.
2. **Depois de `STORAGE_PURGE_GRACE_DAYS` (padrão 7)**: uma rotina nova do worker
   (`storage.object.purge`) apaga os bytes do bucket, de verdade, e só então a exclusão é
   irreversível.

Apagar na hora foi descartado: o bucket não tem lixeira, não há versionamento configurado, e o erro
de um clique numa tela de lote não teria nenhum desfazer. Sete dias custam armazenamento de uma
semana e compram o desfazer inteiro. `retention_until` — hoje uma coluna morta — passa a ser o campo
que marca quando os bytes podem sair, e é ele que a rotina lê.

`POST /storage/objects/:id/restore` (`storage.purge`) desfaz enquanto `retention_until > now()`:
volta a `final`, zera `deleted_at` e `retention_until`, e grava trilha. Passado o prazo, a rota
responde `409 STORAGE_OBJECT_ALREADY_PURGED`. Restaurar devolve sempre a `final`, nunca a `staging`
— objeto em `staging` com lease vivo nem chega a ser excluível (D4).

### D6 — A barreira é por finalidade **e por vínculo**, em quatro camadas, e a primeira é o compilador

Classificar por finalidade não basta, e a medição é a razão: **`delivery_proof` é uma finalidade
para três coisas diferentes**. Ela é gravada pelo canhoto do motorista
(`drizzle-driver-field-report.repository.ts:599`, que insere em `trip_delivery_proofs`), pelo
canhoto do escritório (`drizzle-delivery-proof.repository.ts:292`, mesma tabela) e pelo anexo de
ocorrência do escritório (`drizzle-office-occurrence-batch.repository.ts:122`, que insere em
`trip_document_occurrences`). Proteger a finalidade inteira tiraria da tela justamente as fotos de
ocorrência que o usuário quer poder apagar; liberá-la exporia o canhoto. **Quem separa é o vínculo.**

Três classes, e a classificação de um objeto é `(finalidade, tabela que o referencia)`:

| Classe      | Significado                                                               |
| ----------- | ------------------------------------------------------------------------- |
| `protected` | protegido por inteiro, qualquer que seja o vínculo — nem aparece na lista |
| `purgeable` | apagável por inteiro                                                      |
| `by-link`   | depende de quem referencia; resolvido pela segunda tabela                 |

**Classificação por finalidade** (`STORAGE_PURPOSE_CLASSIFICATION`):

| Finalidade                                                                    | Classe      | Por quê                                                                                                                                       |
| ----------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `nfe_document`, `nfe_event`, `cte_document`, `mdfe_document`, `nfse_document` | `protected` | XML original preservado (CLAUDE.md da raiz); constituição §5, "histórico imutável"; guarda legal                                              |
| `import_source`                                                               | `protected` | **guarda fiscal: é evidência e defesa contratual** — decisão do usuário. Não é classificação por precaução à espera de resposta; é a resposta |
| `contractor_mail_raw`                                                         | `protected` | **peça de defesa contratual, não evidência operacional descartável** — decisão do usuário, mesma razão                                        |
| `delivery_proof`                                                              | `by-link`   | canhoto é guarda; anexo de ocorrência não                                                                                                     |
| `billing_document`                                                            | `purgeable` | documento de fatura, regerável                                                                                                                |
| `aggregate_document`                                                          | `purgeable` | documento de candidato                                                                                                                        |
| `aggregate_application_attachment`                                            | `purgeable` | anexo de pré-cadastro                                                                                                                         |
| `trip_occurrence_attachment`                                                  | `purgeable` | foto de ocorrência de galpão (spec 161)                                                                                                       |
| `trip_occurrence_thumbnail`                                                   | `purgeable` | miniatura da mesma foto (spec 161)                                                                                                            |

**Resolução por vínculo** (`STORAGE_LINK_CLASSIFICATION`), aplicada só à classe `by-link`:

| Tabela que referencia                  | Classe      | Por quê                                                                                        |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `trip_delivery_proofs`                 | `protected` | **é o canhoto** — prova da entrega. Única saída: D8                                            |
| `trip_stop_occurrences`                | `purgeable` | foto de ocorrência de parada                                                                   |
| `trip_document_occurrences`            | `purgeable` | foto de ocorrência de nota                                                                     |
| `trip_document_occurrence_attachments` | `purgeable` | foto de ocorrência de galpão (spec 161)                                                        |
| _sem vínculo_ (órfão)                  | `purgeable` | nada o referencia e nada o serve; por definição não é o comprovante vigente de entrega nenhuma |

⚠️ **O órfão de `delivery_proof` merece uma frase honesta.** Boa parte deles é canhoto
**substituído**: o unique `(company, stop_event, kind)` faz a foto nova tomar o lugar da antiga, e a
linha antiga de `stored_objects` fica sem referência (`docs/SECURITY.md:160-163`). Apagá-los é o
comportamento desejado — o comprovante vigente é o que está vinculado —, mas quem apaga precisa
saber que ali há canhoto velho. A tela diz isso no texto do filtro de órfãos.

**As quatro camadas**, de fora para dentro:

1. **Tipo.** `STORAGE_PURPOSE_CLASSIFICATION: Record<StorageObjectPurpose, StorageProtectionClass>`
   e `STORAGE_LINK_CLASSIFICATION: Record<StorageObjectRecordType, 'protected' | 'purgeable'>`.
   Sendo `Record` sobre uniões fechadas, **finalidade nova ou tabela referenciadora nova não
   compilam** até alguém classificá-las à mão. É a camada que sobrevive ao tempo — e é ela que
   acolhe a finalidade própria de anexo de ocorrência, se a spec 161 criar uma.
2. **Consulta.** O repositório sempre acrescenta `purpose not in (<protegidas por inteiro>)` — as
   sete nunca existem para a tela, e `purpose` com valor protegido é `400`. A classe `by-link` é
   resolvida **no mesmo passo de vínculo da D3**, sem consulta extra: a classificação é função pura
   de `(purpose, recordType)`, e o `recordType` já vem de lá. O keyset não se perde, e o custo é
   zero acima do que a D3 já paga.
3. **Caso de uso.** `purgeStoredObjects` relê finalidade **e vínculo** de cada id, dentro da
   transação e com a linha travada (`select … for update`), e recusa `refused_protected` com a razão.
   O travamento não é zelo: entre listar e apagar, um objeto órfão pode ganhar vínculo em
   `trip_delivery_proofs` e virar canhoto. Reconferir fora da transação deixaria essa janela aberta.
4. **Rotina do worker.** A varredura que apaga os bytes reclassifica antes de chamar o provedor —
   finalidade protegida e vínculo de canhoto nunca perdem os bytes, mesmo que uma linha tenha sido
   marcada `deleted` por engano, por migration futura ou por defeito de outra spec.

Provado por contrato, não por inspeção: um teste percorre `STORAGE_OBJECT_PURPOSES` inteiro e, para
`delivery_proof`, percorre as três tabelas referenciadoras mais o caso órfão.

⚠️ **A camada 1 já provou o seu valor, no mesmo dia.** Enquanto esta spec era escrita, a spec 161
acrescentou duas finalidades a `STORAGE_OBJECT_PURPOSES` — `trip_occurrence_attachment` e
`trip_occurrence_thumbnail` (`storage.schema.ts`, na árvore de trabalho) — e uma tabela nova,
`trip_document_occurrence_attachments`, com **duas** colunas apontando para `stored_objects`
(`stored_object_id` e `thumbnail_object_id`). Com a classificação por `Record` exaustivo, nada disso
passa despercebido: o código não compila até alguém dizer a que classe cada uma pertence. Sem ela,
finalidade nova entraria na tela por omissão — ou sumiria dela, calada. As duas estão classificadas
acima, e a tabela nova entra na D3 quando a 161 for mesclada.

Efeito colateral bem-vindo: com finalidades próprias para ocorrência de galpão, o uso triplo de
`delivery_proof` para de crescer. Mas ele **não desaparece** — as linhas antigas continuam com
`delivery_proof`, e é por elas que a resolução por vínculo continua obrigatória. Quem ler isto depois
da 161 não deve concluir que a regra `by-link` virou legado.

### D7 — A página é administração, não painel de configuração

Módulo novo `storage` no frontend, rota `/armazenamento`, item `storage` no grupo
**Administração** de `NAVIGATION_GROUPS` (`main.tsx:175-178`), hoje com `company-settings` sozinho.

Não entra em `company-settings` porque a regra "Configuração perto do efeito"
(`apps/frontend-transportada/CLAUDE.md`) governa **painel de configuração** — campo que se grava e
passa a valer numa tela. Isto é uma tela operacional com listagem filtrada, paginação e ação
destrutiva em lote, cujo parente é `modules/operations/`, não `DriverAllowancePanel`. Modelar por
`modules/operations/` (página + hook + client + validation + viewModel + locales + module.css).

O item de menu é filtrado por `storage.read` — hoje o menu não filtra por permissão (só o desvio de
`isFieldOnlyUser`, `main.tsx:457-465`), e esta é a primeira exceção, justificada por ser tela
destrutiva. A API valida de qualquer forma; esconder é cortesia, não segurança.

### D8 — O canhoto ilegível: uma saída nomeada, individual, e que cobra explicação

Proteger o canhoto não é proibi-lo para sempre. O caso real é a foto que **ninguém consegue ler** —
ela não serve como prova, e guardá-la só ocupa espaço. Então existe uma saída, e ela é estreita de
propósito:

- **Rota própria e individual:** `POST /storage/objects/:id/purge-illegible` (`storage.purge`).
  Um objeto por chamada. Não há versão em lote, e `POST /storage/purges` **recusa** qualquer canhoto
  com `refused_protected` — nenhum filtro, nenhum lote e nenhuma outra rota alcançam o canhoto.
  Este é o único caminho, e o contrato CA15 prova que é o único.
- **Motivo obrigatório, escrito:** campo de texto livre `reason`, **mínimo 20 e máximo 500
  caracteres**, obrigatório. Não é caixa de seleção nem motivo de catálogo: marcar uma caixa não
  deixa ninguém explicar por que aquela foto não se lê, e é a explicação que faz a exclusão
  auditável. O teto de 500 não é arbitrário — é o CHECK `audit_logs_reason_check`
  (`fiscal-operation.schema.ts:88-90`), e o motivo vai na coluna `reason` da trilha, que já existe.
  Por isso **não há migration de `audit_logs`**.
- **Sem PII no motivo:** a validação recusa o que casar com padrão de CPF, CNPJ, telefone, e-mail ou
  CEP, com `400` e mensagem dizendo o que tirar. "A foto saiu escura e não dá para ler o nome" passa;
  "canhoto da Maria Silva, 11 98888-7777" não. A regra existe porque o motivo é texto livre indo
  para um registro permanente (LGPD, `security.md` §1), e texto livre é onde PII entra.
- **Trilha própria:** `action` `storage.object.purged_illegible`, `reason` com o motivo,
  `metadata` com `{ ipAddress, purpose, sizeBytes, recordType, proofId }`. A trilha guarda o motivo
  para sempre; a constituição §5 põe a auditoria entre o que não se sobrescreve.
- **Mesma janela de arrependimento** da D5: 7 dias, restaurável.

### D9 — A nota do motorista **não** muda, e isso foi medido, não suposto

A pergunta era real: a spec 159 (ADR-0070) fez a foto do comprovante pesar na nota do motorista. Se
a nota fosse recalculada a partir da existência do objeto, apagar um canhoto ilegível rebaixaria o
motorista por um problema de qualidade de imagem que não é falta dele — e caladamente.

**Não é o caso, e a razão é estrutural.** O veredito da foto é **materializado na linha do
comprovante**, não derivado do arquivo: `trip_delivery_proofs.punctuality`
(`apps/api-transportada/src/database/trip.schema.ts:1308-1315`, "o veredito da foto", ADR-0070 §2)
é gravado no momento da captura. E o cálculo da nota lê essa coluna:
`apps/api-transportada/src/fleet/infrastructure/drizzle-driver-score.repository.ts:133` seleciona
`tripDeliveryProofs.punctuality`, com `leftJoin(tripDeliveryProofs, …)` na linha 144 — e o arquivo
**não referencia `storedObjects` em ponto nenhum**, nem filtra por `status` ou `deleted_at`.

Somado ao fato de que a exclusão é lápide (a linha de `trip_delivery_proofs` sobrevive intacta,
porque a FK é `restrict` e nada a desvincula — D4), o resultado é direto: **apagar os bytes do
canhoto não toca a nota.** Preservar a nota não exige mudar cálculo nenhum; exige apenas não
desvincular, que já é a regra.

Decisão, portanto: **a exclusão por ilegibilidade não afeta a nota**, e a tela **não** exibe aviso
de rebaixamento — avisar de um efeito que não existe ensinaria o operador a temer a ação errada. O
que a tela diz é o que é verdade: "a nota do motorista não muda; o registro da entrega e do
comprovante permanece".

Medido também: **não existe coluna de nota** em `fleet.schema.ts` — a nota é derivada na leitura,
nunca em cron (`driver-score.policy.ts:4`, ADR-0070 §5). E os únicos dois caminhos que mudariam a
nota de uma entrega são **apagar a linha de `trip_delivery_proofs`** (o `leftJoin` viraria nulo,
`photoPunctuality` viraria `undefined` e, passadas as `missingAfterHours`, a entrega passaria a
pesar `missing_proof` em vez de `on_time`) ou **reescrever `punctuality` na própria linha**. Esta
spec não faz nenhum dos dois, e a D4 proíbe ambos explicitamente: a lápide não remove linha e não
desvincula nada.

⚠️ Isso é um **acoplamento a proteger**, não um fato eterno. Se algum dia a nota passar a depender
da existência do objeto, esta decisão cai junto. Por isso o teste da CA14 não confere a
implementação: ele calcula a nota do motorista, apaga o canhoto, recalcula e exige valor idêntico.
É um contrato de regressão contra uma mudança futura no cálculo, e é ele que avisa se alguém ligar
a nota ao storage.

## Requisitos funcionais

- **RF1.** `GET /storage/summary` (`storage.read`) — total de objetos e de bytes por finalidade
  purgável, e por estado (`vivo` / `na janela`), da empresa do contexto.
- **RF2.** `GET /storage/objects` (`storage.read`) — lista paginada por cursor, no formato e com os
  filtros de D2, sem finalidade fiscal e sem chave de objeto.
- **RF3.** `POST /storage/purges` (`storage.purge`) — exclusão em lote de 1 a 50 ids, com
  `Idempotency-Key`, resultado por item conforme a tabela de D4. O lote **nunca** alcança canhoto:
  id de objeto vinculado a `trip_delivery_proofs` responde `refused_protected`.
- **RF3b.** `POST /storage/objects/:id/purge-illegible` (`storage.purge`) — exclusão individual de
  canhoto ilegível, com `reason` obrigatório de 20 a 500 caracteres, recusado com `400` se contiver
  padrão de CPF, CNPJ, telefone, e-mail ou CEP. É o **único** caminho que apaga canhoto.
- **RF4.** `POST /storage/objects/:id/restore` (`storage.purge`) — restaura dentro da janela; fora
  dela, `409 STORAGE_OBJECT_ALREADY_PURGED`.
- **RF5.** Toda exclusão e toda restauração gravam uma linha em `audit_logs` **por objeto**, na mesma
  transação da ação, no molde de `trip-field-office-audit.persistence.ts:21`:
  `action` `storage.object.purged` / `storage.object.restored`, `entity_type` `stored_object`,
  `entity_id` = id do objeto, `target_type`/`target_id` iguais, `permission` `storage.purge`,
  `correlation_id` da requisição, `metadata` `{ ipAddress, purpose, sizeBytes, linkKind, batchId }`,
  `before_snapshot`/`after_snapshot` com `{ status, deletedAt, retentionUntil }`.
  O IP sai de `resolveClientIp(request)` (`http/client-ip.service.ts:11`) e vai em
  `metadata.ipAddress` — é onde o produto já o grava, e por isso **não há coluna nova nem migration
  de `audit_logs`**. Nunca entra na trilha: chave de objeto, nome de arquivo ou qualquer PII.
- **RF5b.** A exclusão por ilegibilidade grava `action` `storage.object.purged_illegible` com o
  motivo na coluna `reason` de `audit_logs` (CHECK de 500 já existente,
  `fiscal-operation.schema.ts:88-90`) e `metadata` com `{ ipAddress, purpose, sizeBytes,
recordType, proofId }`.
- **RF5c.** A exclusão de canhoto **não altera** `trip_delivery_proofs` — nem a linha, nem
  `punctuality`, nem `object_id`. A nota do motorista permanece idêntica (D9).
- **RF6.** Rotina `storage.object.purge` no worker — apaga do bucket os objetos `deleted` com
  `retention_until <= now()` e finalidade purgável, em lotes, e marca a linha como reconciliada;
  registrada nos catálogos de job das **duas** apps (`test/job-catalog/catalog.contract.ts` compara
  os dois).
- **RF7.** O apagar de verdade é **um só caminho**: `NfeStorageGateway.deleteObject`
  (`nfe-storage-gateway.ts:61`, já existente e já usado pela limpeza de rollback). Nem esta spec nem
  a 161 abrem um segundo.
- **RF8.** Toda rota que serve um objeto armazenado passa a responder `410 STORED_OBJECT_PURGED`
  quando a linha está `deleted`, e a tela que a consome mostra "arquivo removido pelo administrador".
  Sem isto, a exclusão troca uma foto por um `500`.
- **RF9.** A tela: resumo por finalidade, filtros de D2, tabela com seleção múltipla, confirmação em
  duas etapas quando o lote contém objeto vinculado (listando os registros afetados), estado de
  carregamento com `skeleton`, e aviso próprio para falha e para lista vazia.
- **RF10.** Objeto protegido por vínculo aparece na lista **marcado**, com a razão legível e a caixa
  de seleção desabilitada; nunca some. Objeto de finalidade protegida por inteiro não aparece na
  lista, mas seus bytes entram no resumo (D2).
- **RF11.** A ação individual de canhoto ilegível vive na linha do objeto protegido, exige o motivo
  escrito, e o texto de confirmação diz que **a nota do motorista não muda** e que o registro da
  entrega e do comprovante permanece.

## Requisitos não funcionais

- **RNF1.** Isolamento por empresa em toda consulta e escrita, com contrato negativo entre empresas.
- **RNF2.** Nenhuma resposta, log ou trilha carrega `object_key`, `bucket`, `sha256`, nome de
  arquivo ou PII.
- **RNF3.** `POST /storage/purges` declara `rateLimit` (`{ store: 'postgres', scope, maxRequests,
windowSeconds }`) e entra em `test/rate-limited-routes.contract.test.ts` — é ação destrutiva em
  lote, e é o freio que existe contra alguém martelar o bucket.
- **RNF4.** `GET /storage/objects` responde em menos de 1 s com 100 mil linhas de `stored_objects`,
  inclusive com `link=orphan`, medido em integração contra Postgres de verdade.
- **RNF5.** A rotina do worker tem teto de lotes e respeita `isStopRequested()`, como
  `rate-limit-window-purge.routine.ts:47-52`.

## Casos extremos e falhas

- **O bucket já não tem o objeto** (apagado por fora, ou lote repetido depois de falha parcial): a
  rotina trata `not found` do provedor como sucesso e segue — apagar o que não existe é o estado
  desejado.
- **O provedor falha no meio do lote**: a linha continua `deleted` com `retention_until` vencido, e
  o próximo ciclo tenta de novo. A exclusão é idempotente por construção.
- **Objeto excluído e restaurado dentro da janela, com a rotina rodando junto**: a rotina seleciona
  por `status='deleted' and retention_until <= now()`; restaurar zera os dois, então a linha sai da
  seleção. Corrida resolvida no `where`, não em leitura prévia.
- **Lote com 50 ids dos quais 49 são protegidos**: responde `200` com 49 `refused_protected` e 1
  `purged`. A tela mostra o resumo por resultado, separando "protegido por finalidade" de
  "protegido por ser comprovante".
- **Órfão que ganha vínculo entre listar e apagar**: um `delivery_proof` órfão pode virar canhoto
  entre a listagem e a confirmação. A reclassificação da camada 3 roda dentro da transação, com a
  linha travada (`select … for update`), e o objeto é recusado com `refused_protected` — a janela
  não existe.
- **Motivo de ilegibilidade com 19 caracteres, ou com um telefone dentro**: `400`, com mensagem
  dizendo o que falta ou o que tirar. O motivo nunca chega à trilha sem passar por essa validação.
- **Objeto em `staging` com lease vivo**: `refused_leased`. Um upload em curso não é lixo.
- **Empresa sem nenhum objeto**: resumo zerado e lista vazia têm texto próprio, distinto do texto de
  falha (mesma lição da RF5 da spec 157).

## Critérios de aceite

- **CA1.** Contrato: `storage.read` e `storage.purge` existem em `TRANSPORTADA_PERMISSIONS`, estão em
  `company-admin` e em nenhum outro papel; as quatro rotas exigem a permissão certa; `settings.manage`
  sozinho não alcança nenhuma delas.
- **CA2.** Contrato: para **cada** uma das 7 finalidades protegidas por inteiro, o objeto não
  aparece em `GET /storage/objects` (nem sem filtro, nem com `purpose` igual a ela — que é `400`) e
  `POST /storage/purges` com o id dele responde `refused_protected`, sem chamar o gateway.
- **CA2b.** Contrato: para `delivery_proof`, a classificação é percorrida nos **quatro** casos —
  vinculado a `trip_delivery_proofs` (protegido, aparece marcado, lote recusa), a
  `trip_stop_occurrences` (apagável), a `trip_document_occurrences` (apagável) e órfão (apagável).
- **CA3.** Contrato: `STORAGE_PURPOSE_CLASSIFICATION` e `STORAGE_LINK_CLASSIFICATION` cobrem as duas
  uniões inteiras — um teste de tipo prova que finalidade nova **ou tabela referenciadora nova** não
  compilam sem classificação.
- **CA4.** Contrato: nenhuma resposta das quatro rotas contém `objectKey`, `bucket`, `provider` ou
  `sha256`, varrido no JSON serializado.
- **CA5.** Contrato: objeto vinculado excluído vira `deleted` **e** a coluna que o referencia
  continua apontando para a mesma linha; nenhuma tabela de negócio é escrita.
- **CA6.** Contrato: repetir `POST /storage/purges` com o mesmo `Idempotency-Key` devolve a mesma
  resposta e chama `deleteObject` zero vez a mais; objeto já `deleted` devolve `already_purged` e não
  grava segunda trilha.
- **CA7.** Contrato: exclusão e restauração gravam `audit_logs` com ator, alvo, `metadata.ipAddress`,
  permissão e instantâneos; e a trilha não contém chave de objeto nem PII.
- **CA8.** Contrato: restauração dentro da janela volta a `final`; fora da janela é `409`.
- **CA9.** Integração contra Postgres: `link=orphan` e `link=linked` classificam corretamente objetos
  semeados em cada uma das 16 colunas de referência; e a RNF4 é medida com 100 mil linhas.
- **CA10.** Contrato do worker: a rotina apaga só `deleted` com `retention_until` vencido e finalidade
  purgável, respeita teto e `isStopRequested()`, e o job aparece nos catálogos das duas apps.
- **CA11.** Contrato: rota que serve objeto `deleted` responde `410 STORED_OBJECT_PURGED`.
- **CA12.** Contrato negativo de tenant: id de objeto de outra empresa responde `not_found` na
  exclusão e nunca aparece na lista.
- **CA14.** Contrato: a nota do motorista é calculada, o canhoto é excluído por ilegibilidade, a
  nota é recalculada — e os dois valores são **idênticos**, inclusive a penalidade da entrega. Não
  confere a implementação atual: é contrato de regressão contra alguém ligar a nota ao storage no
  futuro (D9). Prova junto que `trip_delivery_proofs` não foi escrita — nem a linha, nem
  `punctuality`, nem `object_id`.
- **CA15.** Contrato: `purge-illegible` é o **único** caminho que apaga canhoto — `POST
/storage/purges` recusa, nenhum filtro o torna selecionável, e a rotina do worker não o alcança
  sem ter passado por ali. O `reason` com menos de 20 ou mais de 500 caracteres é `400`, e o
  `reason` contendo CPF, CNPJ, telefone, e-mail ou CEP é `400`; o aceito vai para `audit_logs.reason`.
- **CA16.** Contrato do frontend: a tela distingue falha de lista vazia; o lote com vínculo exige a
  segunda confirmação; o objeto protegido aparece **marcado**, com razão legível e seleção
  desabilitada; o formulário de ilegibilidade não envia sem motivo válido e mostra o texto de que a
  nota do motorista não muda; o item de menu some sem `storage.read`. Print da lista com um
  protegido marcado, da confirmação de lote e do formulário de ilegibilidade em `prints/`, com
  revisão de design e usabilidade no `evidence.md` (`web.md` §15).

## Dúvidas

Nenhuma. As três perguntas da primeira redação foram respondidas pelo usuário e viraram decisão:

1. **`import_source` é guarda fiscal** — não apagável. É evidência e defesa contratual. Registrado
   em D6 como `protected`, com essa justificativa, e não mais "por precaução".
2. **`contractor_mail_raw` idem** — peça de defesa contratual, não evidência operacional
   descartável. `protected` em D6.
3. **Canhoto é protegido, com uma saída nomeada** — protegido por vínculo (D6), visível e marcado
   (D2/RF10), apagável só pelo caminho individual de foto ilegível com motivo escrito (D8). E a
   consequência levantada junto com a pergunta foi medida e resolvida: **a nota do motorista não
   muda** (D9), porque o veredito é materializado em `trip_delivery_proofs.punctuality` e o cálculo
   nunca lê o storage — preservar a nota não exige mudar cálculo nenhum, exige não desvincular, que
   já é a regra da D4.
