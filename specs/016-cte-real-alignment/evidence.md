# Evidências — Feature 016

Uma seção por task fechada: comando executado, saída relevante e o que ela prova. Task sem seção aqui
não está concluída.

⚠️ Nada de CNPJ, IE, chave de acesso, certificado, senha ou XML fiscal nesta página — as amostras de
`samples/` são documentos reais de terceiros e ficam fora do histórico do repositório.

## Insumo — comparação com 166 CT-es reais (2026-07-29)

Registrado em `research.md`: 19 campos conferidos por CT-e, 17 batendo em 166/166; `vTPrest` =
4,5% × `vNF` sem divergência; `proPred` por maior `qCom` (desempate maior `vProd`, depois menor
`nItem`) acerta 165/166 contra 115/166 do `highest_value` atual.

## T001 — contrato de `highest_quantity` falhando (2026-07-29)

Arquivo novo `apps/api-transportada/test/cte-issuance-domain/predominant-product.contract.ts`,
importado por `test/cte-issuance-domain.contract.test.ts` (entrypoint já listado no `package.json`).
Fixtures anonimizados: descrições `PRODUTO ALFA..ECHO`, chaves sintéticas de 44 dígitos, nenhum CNPJ,
IE ou razão social.

```
$ bun test apps/api-transportada/test/cte-issuance-domain.contract.test.ts
(fail) resolvePredominantProduct — modo highest_quantity > escolhe a maior quantidade mesmo havendo item de valor maior
(fail) resolvePredominantProduct — modo highest_quantity > compara a quantidade comercial crua, sem expandir a embalagem
(fail) resolvePredominantProduct — modo highest_quantity > desempata quantidade igual pelo maior valor do item
(fail) resolvePredominantProduct — modo highest_quantity > desempata quantidade e valor iguais pelo menor ordinal do item
(fail) resolvePredominantProduct — modo highest_quantity > escolhe entre os itens de todas as notas do agrupamento
(fail) resolvePredominantProduct — modo highest_quantity > rejeita quando nenhum item declara quantidade positiva
 36 pass
 6 fail
Ran 42 tests across 1 file.
```

O motivo das falhas é o certo: sem o modo implementado, `resolvePredominantProduct` cai no ramo de
`totalValue` e devolve o item de maior valor — `PRODUTO BRAVO` no caso 14093, `PRODUTO ALFA` no
desempate por valor, `PRODUTO DELTA` no grupo de duas notas — e não lança nada quando toda a
quantidade é zero.

Sete casos, seis falhando: o caso derivado de 14139 passa por coincidência, porque ali o item de maior
quantidade também é o de maior valor — as duas regras concordam. Ele fica na suíte como proteção
contra regressão do desempate.

Os 36 verdes restantes são as suítes já existentes do domínio, provando que o arquivo novo entrou na
cadeia sem quebrar nada.

## T002 — regra implementada no domínio (2026-07-29)

`CTE_PREDOMINANT_PRODUCT_MODES` ganhou `'highest_quantity'`; `CtePayloadProduct` ganhou `ordinal` e
`quantity`; `resolveByHighest` deixou de ser "primeiro maior vence" e virou comparação explícita
`magnitude` desc → `totalValue` desc → `ordinal` asc → posição da nota asc, toda em `bigint` escalado
por `parseScaledDecimal` (escala 4) — nenhum `Number` no caminho de decisão. Os três modos calculados
passam pelo mesmo comparador; só a grandeza muda (`pickMagnitude`).

```
$ bun test apps/api-transportada/test/cte-issuance-domain.contract.test.ts
 42 pass
 0 fail
 96 expect() calls
Ran 42 tests across 1 file.
```

Os 7 casos de T001 ficaram verdes e as 35 asserções antigas do domínio seguem passando — o desempate
novo não muda `highest_value`, porque a iteração já era por `ordinal` crescente e o comparador
reproduz isso explicitamente.

```
$ bun run --cwd apps/api-transportada typecheck
src/cte-issuance/infrastructure/cte-issuance-payload.query.ts(322,18): error TS2345:
  ... is missing the following properties from type 'CtePayloadProduct': ordinal, quantity
```

Uma única pendência de typecheck, exatamente onde T004 atua: `loadProducts` ainda não projeta as duas
colunas novas. Por isso **T004 foi executada antes de T003** — é ela que fecha o gate de tipos.

## T003 — migration e rollback do `CHECK` (2026-07-29)

Teste antes: `test/cte-profiles-schema/profiles.contract.ts` passou a exigir o `CHECK` com quatro
modos e ficou vermelho contra o schema anterior; depois de `db:generate` ficou verde.

```
$ bun run --cwd apps/api-transportada db:generate --name cte_predominant_product_highest_quantity
{"status":"ok","dialect":"postgresql",
 "migration_path":"drizzle/20260729182304_cte_predominant_product_highest_quantity/migration.sql"}

$ cat drizzle/20260729182304_cte_predominant_product_highest_quantity/migration.sql
ALTER TABLE "cte_emission_profiles" DROP CONSTRAINT "cte_emission_profiles_predominant_product_mode_check",
  ADD CONSTRAINT "cte_emission_profiles_predominant_product_mode_check"
  CHECK ("predominant_product_mode" in ('highest_value', 'highest_weight', 'highest_quantity', 'fixed'));
```

`rollback.sql` manual ao lado, no formato do repo: cabeçalho de licença, "manual rollback only",
`BEGIN/COMMIT`, o `ALTER` de volta para três modos e a remoção da linha de
`drizzle.__drizzle_migrations` por nome + hash sha256 do `migration.sql`
(`7a8d51…4096c1`), com `GET DIAGNOSTICS` exigindo exatamente 1. O aviso diz o que o rollback quebra:
perfil já gravado em `highest_quantity` faz o `ALTER` falhar de propósito, e a decisão sobre esses
perfis é humana.

O novo diretório também entrou na lista explícita de
`test/database-migration/static-migration.contract.ts` — sem isso a migration não é reconhecida.

```
$ bun run --cwd apps/api-transportada db:check
Everything's fine 🐶🔥

$ make migration-test
 9 pass
 0 fail
 182 expect() calls
Ran 9 tests across 2 files.
```

O `migration-test` roda em Postgres descartável o ciclo completo — aplica tudo, executa cada
`rollback.sql` em ordem reversa, reaplica e derruba de novo — então este `rollback.sql` foi executado
duas vezes contra banco real, com o guard do journal passando nas duas.

```
$ bun run --cwd apps/api-transportada test
 1084 pass · 1 skip · 0 fail · 5174 expect() calls (61 arquivos)

$ bun run --cwd apps/api-transportada typecheck
$ bun run lint
$ bunx prettier --check .
All matched files use Prettier code style!
```

## T004 — fonte de payload projeta `quantity`/`ordinal` e o tenant vira teste (2026-07-29)

Executada antes de T003 por causa da pendência de tipos registrada acima.

Ordem seguida: primeiro o arquivo novo
`apps/api-transportada/test/cte-issuance-infrastructure/payload-source.contract.ts`
(+ `import` em `test/cte-issuance-infrastructure.contract.test.ts`), com a suíte **falhando** porque os
filtros ainda não existiam:

```
$ bun test apps/api-transportada/test/cte-issuance-infrastructure.contract.test.ts
SyntaxError: Export named 'buildVolumeFilters' not found in module
  .../src/cte-issuance/infrastructure/cte-issuance-payload.query.ts
 0 pass
 1 fail
```

Depois a implementação: as sete leituras da fonte passaram a montar o `where` por funções exportadas
(`buildBatchItemFilters`, `buildEmitterFilters`, `buildProfileFilters`, `buildItemDocumentFilters`,
`buildDocumentJoinFilters`, `buildParticipantFilters`, `buildAddressJoinFilters`,
`buildProductFilters`, `buildVolumeFilters`), no mesmo formato de
`drizzle-cte-issuance.repository.ts:buildIssuedDocumentFilters`, e `loadProducts` passou a projetar
`nfe_products.quantity` e `nfe_products.ordinal`.

```
$ bun test apps/api-transportada/test/cte-issuance-infrastructure.contract.test.ts
 18 pass
 0 fail
 56 expect() calls
```

O SQL renderizado pelo `PgDialect` prova `company_id = $` em `cte_batch_items`,
`cte_batch_item_documents`, `nfe_documents` (pelo join, amarrado ao `company_id` do lado esquerdo),
`nfe_participants`, `nfe_addresses` (idem), `nfe_products` e `nfe_volumes` — mais
`company_fiscal_profiles` e `cte_emission_profiles`, que também são leituras desta fonte. O último
caso troca a empresa e prova que nenhum parâmetro de outro tenant sobra na consulta.

```
$ bun run --cwd apps/api-transportada typecheck
$ bun run lint
$ bunx prettier --check .
All matched files use Prettier code style!
```

Typecheck limpo — a pendência de T002 fechou aqui. Na suíte completa da API restava **uma** falha:
`cte-profiles-schema` ainda espera o `CHECK` com três modos. É exatamente o teste que T003 atualiza
antes da migration.

## T005 — modo novo exposto no formulário de perfis (2026-07-29)

Teste antes, em `apps/frontend-transportada/test/cte-profiles/api-payload.contract.ts` (arquivo já
existente, entrypoint `test/cte-profiles.contract.test.ts` já listado no `package.json` — nada a
registrar). Dois casos novos: a listagem servida com `predominantProductMode: 'highest_quantity'`
passa pelo guard de resposta, e todo modo de `CTE_PROFILE_PREDOMINANT_PRODUCT_MODE` tem rótulo nos
dois locales, com as duas chaves cobrindo exatamente o mesmo conjunto.

```
$ bun test test/cte-profiles.contract.test.ts
error: CTE_PROFILES_RESPONSE_INVALID
  at profileFromApi (src/modules/cte-profiles/shared/cteProfilesResponse.validation.ts:114:33)
(fail) ... > accepts a profile served in the highest quantity predominant product mode

error: expect(received).toContain(expected)
Expected to contain: "highest_quantity"
Received: [ "fixed", "highest_value", "highest_weight" ]
(fail) ... > offers every predominant product mode translated in both locales

 13 pass
 2 fail
```

Os motivos são os certos: o guard rejeitava um perfil válido do backend (a tela cairia inteira), e o
seletor não tinha a opção.

Implementação: `CteProfilePredominantProductMode` e `CTE_PROFILE_PREDOMINANT_PRODUCT_MODE` ganharam
`'highest_quantity'`; `PROFILE_ENUMS.predominantProductMode` deixou de repetir a lista à mão e passou
a apontar para a constante — era essa duplicação que deixava guard e seletor divergirem; locales
ganharam "Item de maior quantidade" / "Highest quantity item". `CteProfileFiscalFields` não mudou:
ele já renderiza a constante inteira.

```
$ bun test test/cte-profiles.contract.test.ts
 15 pass · 0 fail · 95 expect() calls

$ bun run --cwd apps/frontend-transportada test
 221 pass · 0 fail · 1264 expect() calls (12 arquivos)

$ bun run --cwd apps/frontend-transportada typecheck
$ bun run lint
$ bunx prettier --check apps/frontend-transportada
All matched files use Prettier code style!
```

## T006 — borda HTTP grava e devolve o modo novo (2026-07-29)

`test/cte-profiles-http/create.contract.ts` ganhou um caso de ida e volta — `POST` com
`predominantProductMode: 'highest_quantity'` chega ao caso de uso com o modo intacto e volta 201 com
o mesmo modo no `data` — e o caso do nome fixo ganhou um terceiro cenário: `highest_quantity` com
`predominantProductName` preenchido continua 400, igual aos outros modos calculados. O fixture
`cte-profiles-http.fixture.ts` passou a aceitar `createResult` para o caso de uso falso devolver um
perfil diferente do padrão; sem isso não dá para provar a serialização.

O teste nasce verde, porque o `z.enum` da rota deriva de `CTE_PREDOMINANT_PRODUCT_MODES`, ampliado em
T002. Para provar que ele guarda mesmo a borda — e não só acompanha — rodei uma mutação: removi
`'highest_quantity'` da constante e rodei a suíte.

```
$ bun test test/cte-profiles-http.contract.test.ts   # com a constante mutilada
expect(received).toBe(expected)
Expected: 201
Received: 400
(fail) ... > persists and returns the highest quantity predominant product mode
 21 pass
 1 fail
```

Constante restaurada em seguida (`git diff` do schema voltou ao esperado: só a linha do modo novo).

```
$ bun test test/cte-profiles-http.contract.test.ts
 22 pass · 0 fail · 77 expect() calls

$ bun run --cwd apps/api-transportada test
 1085 pass · 1 skip · 0 fail · 5179 expect() calls (61 arquivos)

$ bun run --cwd apps/api-transportada typecheck
$ bun run lint
$ bunx prettier --check apps/api-transportada
All matched files use Prettier code style!
```

Nenhum arquivo de teste novo — os dois casos entraram em suíte já registrada.

## T007 — fonte de payload de um item com três notas (2026-07-29)

O agrupamento `sender_recipient` só existia no `CHECK` do schema: nenhum teste percorria a leitura de
um item com mais de uma nota. Para cobrir sem banco, `test/cte-issuance-infrastructure/support.ts`
(novo, arquivo de apoio — não é entrypoint, entra pela cadeia de `import` do contrato já registrado)
ganhou um duplo do query builder do Drizzle: `select().from(t)` resolve linhas por nome de tabela,
`orderBy` registra a expressão renderizada pelo `PgDialect`, `limit` corta. Fixtures anonimizadas —
chaves sintéticas de 44 dígitos, `PRODUTO ALFA..DELTA`, remetente/destinatário fictícios.

Quatro casos novos em `payload-source.contract.ts`, contra um item de três notas do mesmo par:
ordem por `position`, produtos e volumes de cada nota na sua própria entrada, o mesmo par
remetente/destinatário nas três, e cobrança + perfil lidos uma vez do snapshot do item.

O contrato nasce verde — a leitura multi-nota já funcionava, faltava prova. Para mostrar que ele
prende a ordem de verdade, removi o `.orderBy(asc(cteBatchItemDocuments.position))` da query:

```
$ bun test test/cte-issuance-infrastructure.contract.test.ts   # sem a ordenação
expect(received).toContain(expected)
Expected to contain: "\"cte_batch_item_documents\".\"position\" asc"
Received: [ "\"nfe_products\".\"document_id\" asc", "\"nfe_products\".\"ordinal\" asc",
  "\"nfe_volumes\".\"document_id\" asc", "\"nfe_volumes\".\"ordinal\" asc" ]
(fail) ... > returns one entry per invoice, in the position order of the item documents
 21 pass
 1 fail
```

Query restaurada (`orderBy` de volta na linha 270) e suíte verde:

```
$ bun test test/cte-issuance-infrastructure.contract.test.ts
 22 pass · 0 fail · 70 expect() calls

$ bun run --cwd apps/api-transportada test
 1089 pass · 1 skip · 0 fail · 5193 expect() calls (61 arquivos)

$ bun run --cwd apps/api-transportada typecheck
$ bun run --cwd apps/api-transportada lint
$ bunx prettier --check apps/api-transportada
All matched files use Prettier code style!
```

Os seis casos de isolamento de tenant de T004 seguem no mesmo arquivo e continuam verdes.

## T008 — builder do CT-e agrupado (2026-07-29)

O builder já somava a carga de várias notas, mas o contrato só exercitava duas notas iguais e a
divergência de **remetente**. `test/cte-issuance-domain/grouped.support.ts` (novo, arquivo de apoio —
entra pela cadeia de `import` do contrato já registrado) traz três notas anonimizadas do mesmo par
remetente/destinatário, calibradas para que cada modo calculado vença em uma nota diferente: maior
quantidade na primeira (`PRODUTO ALFA`, 30), maior valor na segunda (`PRODUTO CHARLIE`, 250,50) e
maior peso na terceira (`PRODUTO DELTA`, 40 kg).

Quatro casos novos em `cte-payload-builder.contract.ts`:

- `vCarga` = 100,00 + 250,50 + 80,00 = **430,50**, `documentos` com as três chaves na ordem, e
  `quantidades` somando os volumes das três notas — `UN 6`, `PESO BRUTO 62,75`, `PESO LIQUIDO 53`.
- `proPred` percorrido nos três modos calculados, cada um vencendo em uma nota diferente.
- remetente, destinatário e municípios tomados da primeira nota do grupo.
- `CTE_PAYLOAD_INCONSISTENT_PARTIES` quando o **destinatário** da terceira nota diverge (o caso de
  remetente divergente já existia).

Contrato nasce verde — faltava prova, não comportamento. Duas mutações mostram que ele prende:

```
$ # resolveByHighest percorrendo só a primeira nota (invoices.slice(0, 1))
$ bun test test/cte-issuance-domain.contract.test.ts
error: modo highest_value
Expected: "PRODUTO CHARLIE"
Received: "PRODUTO ALFA"
(fail) buildCtePayload — agrupamento de notas > escolhe o produto predominante entre os itens de
       todas as notas do grupo
 43 pass · 3 fail

$ # assertConsistentParties comparando só o remetente
$ bun test test/cte-issuance-domain.contract.test.ts
error: Expected the call to fail with CTE_PAYLOAD_INCONSISTENT_PARTIES
(fail) buildCtePayload — agrupamento de notas > rejeita o grupo quando o destinatário de uma das
       notas diverge
 45 pass · 1 fail
```

Fontes restauradas (`git diff` limpo em `src/cte-issuance/domain/`) e gates verdes:

```
$ bun run --cwd apps/api-transportada test
 1093 pass · 1 skip · 0 fail · 5205 expect() calls (61 arquivos)

$ bun run typecheck
$ bun run lint
$ bunx prettier --check apps/api-transportada/test/cte-issuance-domain/*.ts
All matched files use Prettier code style!
```

Prova o agrupamento `sender_recipient` de ponta a ponta no domínio: N notas → um CT-e, com `vCarga` e
`infQ` somados, uma `infNFe` por nota e recusa quando o par de partes não é o mesmo. Nenhum CNPJ, IE
ou chave real nas fixtures novas.

## T009 — emissão multi-nota no caso de uso (2026-07-29)

`test/cte-issuance-application/support.ts` ganhou `GROUPED_PAYLOAD_SOURCE` — a mesma fonte de payload
de sempre, trocando só `invoices` pelas três notas anonimizadas de T008 — e dois casos novos entraram
em `payload.contract.ts`:

- emitir um item com três notas persiste um payload com as três chaves na ordem, `carga.vCarga`
  430,50 e o par remetente/destinatário do grupo: a seleção agrupada atravessa
  `findPayloadSource → assembleCteIssuancePayload → savePayload` sem perder nota.
- `payloadSha256` idêntico em duas montagens da mesma tentativa agrupada e **diferente** do digest da
  tentativa de nota única — o hash é estável sem ser cego à seleção.

Verde de nascença de novo; duas mutações mostram o que cada caso prende:

```
$ # assembleCteIssuancePayload montando só a primeira nota (source.invoices.slice(0, 1))
$ bun test test/cte-issuance-application.contract.test.ts
- Expected  - 8
+ Received  + 0
    { "chave": "2222…0002", "tipo": "nfe" },
    { "chave": "2222…0003", "tipo": "nfe" },
(fail) ... > carries a grouped selection of three invoices into the persisted payload
 48 pass · 1 fail

$ # digest calculado só sobre providerConfig, ignorando o payload
$ bun test test/cte-issuance-application.contract.test.ts
error: expect(received).not.toBe(expected)
Expected: not "2c86474554b25550d6431275a28226c76041d486ce7d38b8a13aa0dddb104bde"
(fail) ... > fingerprints a grouped attempt apart from a single invoice attempt
 48 pass · 1 fail
```

Fonte restaurada (`git diff` sem `cte-issuance/application/` no stat) e gates verdes:

```
$ bun test test/cte-issuance-application.contract.test.ts
 49 pass · 0 fail · 226 expect() calls

$ bun run --cwd apps/api-transportada test
 1095 pass · 1 skip · 0 fail · 5216 expect() calls (61 arquivos)

$ bun run typecheck
$ bun run lint
$ bunx prettier --check apps/api-transportada/test/cte-issuance-application/
All matched files use Prettier code style!
```

Fecha a Fase B: o agrupamento `sender_recipient` agora está preso por contrato na leitura (T007), no
builder (T008) e na emissão (T009).

## T010 — `taxRegime` da empresa local conferido (2026-07-29)

Consulta **de leitura**, sem `update`, no Postgres local (`transportada-local-postgres-1`), sem trazer
CNPJ nem IE para a tela — só comprimentos, para provar que os campos estão preenchidos:

```
$ docker exec transportada-local-postgres-1 psql -U transportada -d transportada \
    -c "select company_id, tax_regime, length(cnpj), state, length(state_registration), length(rntrc)
        from company_fiscal_profiles order by company_id;"
              company_id              | tax_regime | cnpj_len | state | ie_len | rntrc_len
--------------------------------------+------------+----------+-------+--------+-----------
 00000000-0000-4000-8000-000000000001 | 1          |       14 | SP    |     12 |         8
(1 row)
```

Uma empresa cadastrada, `tax_regime = '1'` (Simples Nacional). Para conferir contra o emitente real
sem expor identificador, o CNPJ gravado foi comparado em shell com o `<emit><CNPJ>` dos cinco CT-es de
`samples/`, imprimindo apenas o resultado da comparação:

```
cte-14093.xml cnpj_igual=sim crt_xml=1
cte-14094.xml cnpj_igual=sim crt_xml=1
cte-14108.xml cnpj_igual=sim crt_xml=1
cte-14123.xml cnpj_igual=sim crt_xml=1
cte-14139.xml cnpj_igual=sim crt_xml=1
```

**Valor antes: `1`. Ação tomada: nenhuma — não há divergência. Valor depois: `1`.** O CRT declarado
nos CT-es reais do mesmo emitente é 1 nos cinco, igual ao que está gravado, então o `PUT` de
configurações fiscais não foi necessário. O grupo ICMSSN sai certo porque `providerConfig.crt` nasce
desse campo — vínculo que T011 prende por contrato.

## T011 — CRT e grupo ICMS presos por contrato (2026-07-29)

Três casos novos em `test/cte-issuance-application/payload.contract.ts`:

- `providerConfig.crt` sai de `companyFiscalProfiles.taxRegime`: com a empresa em regime `'3'` o
  payload persistido carrega `crt: '3'` — e a asserção exige explicitamente que **não** seja o valor
  do fixture (`'1'`), então um `crt` fixo no código não passa.
- empresa sem regime gravado (`taxRegime: ''`) falha cedo com `CTE_ISSUANCE_EMITTER_INCOMPLETE` (422)
  e nada é persistido.
- perfil Simples (CST 90, alíquota 0) produz `icms: { cst: '90' }` e o payload serializado não contém
  `indSN` nem `ICMSSN` — com o comentário de uma linha registrando que
  `<ICMSSN><indSN>1</indSN>` é decisão do `CteXmlBuilder` do pacote a partir do `crt`, e não nossa.

Verde de nascença; três mutações, uma por caso:

```
$ # crt: '1' fixo em composeProviderConfig
Expected: "3" / Received: "1"
(fail) ... > takes the provider CRT from the company fiscal profile, never from a fixed value

$ # 'taxRegime' fora de EMITTER_REQUIRED_FIELDS
error: Expected ApiError to be thrown
(fail) ... > rejects issuance when the company has no tax regime recorded
 50 pass · 2 fail

$ # composeIcms devolvendo { cst: '90', indSN: '1' }
+   "indSN": "1",
(fail) ... > emits only cst 90 for a Simples Nacional profile, without any ICMSSN field
 51 pass · 1 fail
```

Fontes restauradas e gates verdes:

```
$ bun test test/cte-issuance-application.contract.test.ts
 52 pass · 0 fail · 239 expect() calls

$ bun run --cwd apps/api-transportada test
 1098 pass · 1 skip · 0 fail · 5229 expect() calls (61 arquivos)

$ bun run typecheck
$ bun run lint
$ bunx prettier --check apps/api-transportada/test/
All matched files use Prettier code style!
```

Junto com T010 (`tax_regime = '1'` conferido no banco local), fecha o caminho do CRT: o valor vem da
empresa, atravessa o `providerConfig` sem ser reescrito, e o grupo ICMSSN do XML continua sendo
responsabilidade do pacote fiscal.

## T012 — ADR-0019 (2026-07-29)

`docs/adr/0019-cte-predominant-product-and-icmssn.md` no formato dos ADRs do repo (Contexto ·
Decisão · Consequências), registrando as duas decisões fiscais desta feature:

- o critério de produto predominante é **parâmetro do perfil de emissão** — e, por consequência, da
  empresa —, nunca regra fixa de transportadora. A tabela de acerto de `research.md` (165/166 contra
  115/166 do `highest_value`) é o fundamento, com a ressalva explícita de que ela prova o critério de
  **um** emitente e não uma exigência legal; por isso o resultado é uma opção configurável e a
  divergência de 1/166 fica fora do escopo.
- `ICMSSN`/`indSN` é decisão do `CteXmlBuilder` do pacote fiscal a partir do `crt`; o nosso payload
  continua devolvendo `{cst:'90'}`, e o `crt` nasce de `companyFiscalProfiles.taxRegime`.

Alternativa descartada registrada no ADR: tratar `highest_quantity` como correção do
`highest_value`, o que mudaria silenciosamente o CT-e de outras empresas.

```
$ rg -n "0019" specs/016-cte-real-alignment/spec.md
ADR-0019 citado na seção "Decisões registradas", com link relativo para docs/adr/

$ bunx prettier --check docs/adr/0019-cte-predominant-product-and-icmssn.md specs/016-cte-real-alignment/spec.md
All matched files use Prettier code style!
```

A seção de peso do ADR entra em T016, junto com a implementação da Fase D.

## T013 — contrato falhando da fonte de peso (2026-07-29)

Cinco casos novos em `apps/api-transportada/test/cte-issuance-domain/predominant-product.contract.ts`,
no `describe('resolvePredominantProduct — modo highest_weight')`. Fixtures anonimizados (chaves
`1234…`, produtos ALFA/BRAVO/CHARLIE/DELTA/ECHO), com `buildInvoice` ganhando `volumes` opcional e o
auxiliar `buildVolume` para controlar o peso do volume por nota.

| caso | montagem                                                                                               | esperado                                                        |
| ---- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| (a)  | uma nota, nenhum item com peso, volume `101,7320`                                                      | não lança; vence o item de maior `vProd`                        |
| (b)  | três notas sem peso de item, volumes `10` / `90` / `50`; na nota de `90` dois itens empatam em `vProd` | vence a nota de maior peso bruto e, nela, o menor `nItem`       |
| (c)  | dois itens com peso próprio (`5` e `40`) na nota de volume menor                                       | vence o item mais pesado                                        |
| (d)  | item com peso `50` ao lado de item sem peso, volume `30`; outra nota sem peso de item, volume `80`     | fonte por item descartada inteira → vence a nota de volume `80` |
| (e)  | nenhum peso em item e nenhum peso em volume                                                            | `CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT`                    |

```
$ bun test ./test/cte-issuance-domain.contract.test.ts
ApiError: The predominant product could not be resolved with the mode highest_weight.
      at resolvePredominantProduct (src/cte-issuance/domain/cte-cargo.service.ts:163:84)
(fail) modo highest_weight > usa o peso bruto do volume quando nenhum item traz peso próprio

ApiError: The predominant product could not be resolved with the mode highest_weight.
      at resolvePredominantProduct (src/cte-issuance/domain/cte-cargo.service.ts:163:84)
(fail) modo highest_weight > sem peso por item, vence a nota de maior peso bruto e nela o maior valor

error: expect(received).toBe(expected)
Expected: "PRODUTO CHARLIE"
Received: "PRODUTO ALFA"
(fail) modo highest_weight > descarta a fonte por item inteira quando só parte dos itens traz peso

 48 pass
 3 fail
Ran 51 tests across 1 file.
```

Falha pelo motivo certo: hoje `pickMagnitude` lê só `product.grossWeight`, que a importação de NF-e
nunca preenche — sem peso por item toda magnitude é zero e o modo lança em vez de cair no volume
(casos a e b); e quando **parte** dos itens tem peso, o único item com peso vence sozinho, ignorando
o volume (caso d), que é exatamente a regra de tudo-ou-nada que T014 precisa implementar.

Os casos (c) e (e) já passam — são guardas de regressão: com peso em todos os itens a escolha por
item continua valendo, e sem peso nenhum o erro atual é o correto.

```
$ bun run --cwd apps/api-transportada typecheck
$ bunx tsc --noEmit
(sem saída — limpo)
```

## T014 — fonte de peso implementada no domínio (2026-07-29)

`pickMagnitude` (que lia um campo fixo por modo) deu lugar a `buildMagnitudeResolver`, que decide a
**fonte** antes de comparar. `highest_quantity` e `highest_value` seguem lendo o item. `highest_weight`
passa por `hasWeightOnEveryProduct`: só usa `product.grossWeight` se **todos** os itens do grupo o
declararem positivo; caso contrário a fonte por item é descartada inteira e cada nota passa a pesar o
seu `sumVolumeGrossWeight` — todos os itens da mesma nota entram na disputa com a mesma magnitude, e o
desempate segue sendo `totalValue` desc → `ordinal` asc → posição da nota asc.

Nada mudou no comparador nem no tipo: `CtePayloadProduct.grossWeight` continua sendo o ponto de
extensão para quando a importação de NF-e passar a extrair peso por item — no dia em que todos os
itens vierem com peso, a fonte troca sozinha. Toda a aritmética continua em `bigint` escalado por
`parseScaledDecimal` (escala 4); nenhum `Number` entra na decisão.

```
$ bun test ./test/cte-issuance-domain.contract.test.ts
 51 pass
 0 fail
 113 expect() calls
Ran 51 tests across 1 file.
```

Os três casos vermelhos de T013 ficaram verdes e os dois guardas de regressão continuam passando.

Um teste antigo precisou mudar de expectativa, e é o próprio bug que esta fase corrige:
`cte-payload-builder.contract.ts` afirmava "rejeita highest_weight quando nenhum item declara peso" —
ou seja, congelava a falha. Como a nota golden tem peso de volume (`101,7320`) e nenhum peso por item,
o modo hoje devolve o produto predominante em vez de lançar. O teste virou "cai no peso do volume no
modo highest_weight quando a nota não traz peso por item". A rejeição continua coberta, agora no caso
certo: sem peso em item **e** sem peso em volume (T013, caso e).

```
$ bun run --cwd apps/api-transportada test
 1103 pass · 1 skip · 0 fail · 5234 expect() calls (61 arquivos)

$ bun run --cwd apps/api-transportada typecheck
$ bun run lint
$ bunx prettier --check apps/api-transportada/src/cte-issuance apps/api-transportada/test/cte-issuance-domain
All matched files use Prettier code style!
```

## T015 — peso de item nunca vira declaração de carga (2026-07-29)

Caso novo em `cte-payload-builder.contract.ts`: a nota golden com peso próprio nos dois itens
(`10` + `80` = **90**) e volume de peso bruto **101,732**. Dois números diferentes de propósito, e o
payload tem que seguir o volume.

```
$ bun test ./test/cte-issuance-domain.contract.test.ts
 52 pass
 0 fail
 117 expect() calls
```

O caso nasceu verde — o builder já compunha `infQ` a partir de `nfe_volumes`. Para provar que ele
guarda, `sumTotals` foi mutado para somar também `product.grossWeight` no peso bruto:

```
$ bun test ./test/cte-issuance-domain.contract.test.ts   # com a mutação
Expected: 101.732
Received: 90
(fail) declara o peso do volume mesmo quando os itens trazem peso próprio
(fail) reproduz vPrest, componentes e carga
(fail) soma a carga e lista uma infNFe por nota
(fail) monta vCarga, documentos e quantidades de um grupo de três notas
 48 pass
 4 fail
```

`101,732` virou `90` exatamente onde o contrato aponta, e mais três contratos de carga caíram junto —
inclusive o do grupo de três notas, onde os pesos por item somam 55 contra 62,75 dos volumes. Fonte
restaurada do backup e suíte de volta a 52/52; `git diff` de `src/cte-issuance/domain/` não tem
resíduo da mutação.

O mesmo caso registra o outro lado da regra: com peso em todos os itens, `proPred` sai
`AMACIANTE FOFO 2L` (o item de 80 kg). Peso por item escolhe o produto predominante; peso de volume
declara a carga. `UN`, `PESO BRUTO` e `PESO LIQUIDO` continuam saindo de `nfe_volumes`.

```
$ bun run --cwd apps/api-transportada test
 1104 pass · 1 skip · 0 fail · 5238 expect() calls (61 arquivos)

$ bunx prettier --check apps/api-transportada/test/cte-issuance-domain
All matched files use Prettier code style!
```

## T016 — decisão de peso na ADR-0019 (2026-07-29)

`docs/adr/0019-cte-predominant-product-and-icmssn.md` ganhou a terceira decisão da feature, nas três
seções já existentes:

- **Contexto**: `highest_weight` lia `nfe_products.gross_weight`, coluna que a importação nunca
  preenche — o modo só falhava, e havia teste congelando essa falha. O peso que a NF-e traz está em
  `nfe_volumes`, por volume.
- **Decisão**: peso de volume é a declaração legal da carga (inclui a embalagem) e continua sendo a
  única fonte de `infQ`; peso por item, sob regra de tudo-ou-nada, serve só para escolher o produto
  predominante — basta um item sem peso e a fonte por item cai inteira, porque item sem peso
  perderia por falta de dado, não por ser mais leve. `CtePayloadProduct.grossWeight` fica como ponto
  de extensão para quando a importação passar a extrair peso por item.
- **Consequências**: perfil em `highest_weight` passa a emitir em vez de falhar; com peso vindo só do
  volume, `highest_weight` e `highest_value` coincidem numa nota só e divergem no CT-e agrupado; e o
  volume por nota, que o cálculo de rota vai precisar, já é dado persistido.

```
$ rg -n "0019" specs/016-cte-real-alignment/spec.md
182: ADR-0019 — modo de produto predominante por perfil + ICMSSN do pacote
185: ADR-0019 — peso do volume é a declaração legal da carga

$ bunx prettier --check docs/adr/0019-cte-predominant-product-and-icmssn.md specs/016-cte-real-alignment
All matched files use Prettier code style!
```

## Verificação final da feature (2026-07-29)

```
$ bun run --cwd apps/frontend-transportada test
 221 pass · 0 fail · 1264 expect() calls (12 arquivos)

$ make migration-test
 9 pass · 0 fail · 182 expect() calls (Postgres descartável, aplica → rollback → reaplica)

$ make check
 6 pass · 0 fail        (cron)
 1104 pass · 0 fail     (api)
 228 pass · 0 fail      (worker)
 24 pass · 0 fail       (smoke)
 221 pass · 0 fail      (frontend)
 format:check · lint · typecheck · build — todos limpos; PWA construída
```

As 16 tasks estão `[x]` em `tasks.md`. T009 da feature 014 não foi tocada.

## Ajuste de UI pós-feature: layout de `/cte-profiles` e filtro de CT-e emitido (2026-07-29)

Pedido do usuário depois de rodar a stack local: corrigir o desalinhamento da página de perfis
de emissão e oferecer um filtro de notas com/sem CT-e, com o padrão em "sem CT-e emitido".

Contratos escritos **antes** da implementação, ambos falhando na primeira execução:

```
$ bun test test/cte-profiles.contract.test.ts        # antes
 7 fail  (workspaceDeckEditing, métricas de controle, checkbox, panelHead, estados vazios)

$ bun test test/nfe-workspace.contract.test.ts       # antes
 SyntaxError: Export named 'isCteIssued' not found in module useNfeDocumentTable.hook.ts
```

Arquivos de contrato novos, registrados nos entrypoints já listados no `package.json`:

- `test/cte-profiles/layout.contract.ts` → `test/cte-profiles.contract.test.ts`
- `test/nfe-workspace/cte-issued-filter.contract.ts` → `test/nfe-workspace.contract.test.ts`

Correções de layout: deck em coluna única (o shell fecha em `74rem`, então qualquer split lado a
lado cortava a tabela de 6 colunas), painel em edição destacado com borda cobre, ação "Novo perfil"
promovida para o cabeçalho do painel, grid de campos por `repeat(auto-fit, minmax(13rem, 1fr))` com
`align-items: end`, controles com as mesmas métricas de `company-settings` (`min-height: 3rem`,
`padding: var(--space-3)`, `border-radius: 0`, foco cobre), checkbox em linha com `accent-color`,
observações ocupando a linha inteira e estados vazios declarados nos grupos repetíveis.

Filtro: `cteIssued` entrou como filtro de seleção da tabela de Notas (`nfe-workspace`) — a página de
perfis não lista notas. Valor padrão `pending`; a nota conta como emitida somente quando está
vinculada a lote/CT-e não cancelado (`cteBlockReason === 'CTE_BATCH_DOCUMENT_ALREADY_LINKED'`), o
que já chegava ao cliente. Nenhuma query mudou, logo nenhum teste de isolamento de tenant foi
afetado. Preferências salvas antes do filtro voltam ao padrão na desserialização.

```
$ bun run typecheck        # 4 apps — limpo
$ bun run lint             # 4 apps — limpo
$ bun run format:check     # All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada test
 236 pass · 0 fail · 1325 expect() calls (12 arquivos)
```

Verificação na stack local (Playwright, Chrome real, 1440/1280/768/375):

```
overflow {"bodyClientWidth":1440,"bodyScrollWidth":1440,"tableClientWidth":1142,"tableScrollWidth":1142}
```

Sem scroll horizontal e sem corte de coluna na tabela de perfis. Na tabela de Notas o primeiro
filtro aparece como "CT-E · Sem CT-e emitido" e o contador do painel passa a exibir o subconjunto
filtrado, comprovando que o padrão esconde as notas já vinculadas a CT-e.

## Ajuste de UI pós-feature: select único no design system (2026-07-29)

Motivação relatada: em todas as telas a seta do `<select>` nativo ficava colada na borda direita e a
lista de opções abria com o tema do sistema operacional, fora dos tokens do produto. O pedido incluiu
transformar o novo componente em **regra local** — todo select do projeto passa por ele.

Contrato escrito antes da implementação (`test/design-system/select.contract.ts`, registrado no
entrypoint `test/design-system.contract.test.ts` e na lista explícita do `package.json`):

```
$ bun test test/design-system.contract.test.ts
error: ENOENT: no such file or directory, open 'src/components/ui/select.tsx'
 0 pass · 6 fail
```

O contrato cobre seis pontos: existência de um único `Select` exportado pelo design system; ausência
de `<select` em **todos** os `.tsx` de `src/` exceto o próprio componente; contrato de teclado/ARIA
(`aria-expanded`, `aria-haspopup="listbox"`, `aria-activedescendant`, `role="listbox"`,
`role="option"`, `aria-selected`, setas, `Home`/`End`, `Enter`, `Escape`, espaço); estilo em tokens
(`border-radius: 0`, `appearance: none`, `gap` entre rótulo e chevron, contorno de foco em cobre,
chevron girando 180°, sem hexadecimal e sem `rgb()`); variantes `compact`/`disabled`; e a documentação
(`docs/frontend/selects.md` + citação em `CLAUDE.md`).

Implementação: `src/components/ui/select.tsx` + `select.module.css`. Listbox acessível com gatilho
`<button type="button">`, navegação por teclado, rolagem que acompanha a opção ativa, fechamento por
clique fora e devolução do foco ao gatilho. `SELECT_TRIGGER_CLASS_NAMES` é exportado para o
`DateRangePicker`, que abre um calendário em vez de uma lista mas usa a mesma pele de gatilho.

Migração: 32 ocorrências de `<select>` nativo em 11 arquivos (perfis de CT-e, frota, configurações da
empresa, lotes de CT-e, MDF-e, notas, frete) e os 3 consumidores do `SelectMenu` local do
`nfe-workspace`, que foi **removido** junto com o CSS que estilizava `select` em sete folhas de
estilo (`fieldGrid select`, `conditionRow select`, `filterBar select`, `.fileField select`,
`.workspace-panel select` e o bloco `.selectMenu…`). Onde o `SelectMenu` tinha `clearable` implícito
`true`, a prop foi passada explicitamente — o novo `Select` assume `false`.

Duas correções durante a verificação visual: o `DateRangePicker` reusava as classes removidas do
`SelectMenu` (gatilho ficou sem estilo) e o gatilho esticava até a altura da linha do grid de filtros
(`align-items: flex-start` no root).

```
$ bun run typecheck        # 4 apps — limpo
$ bun run lint             # 4 apps — limpo
$ bun run format:check     # All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada test
 242 pass · 0 fail · 1360 expect() calls (13 arquivos)
$ bun run --cwd apps/frontend-transportada build   # ok (PWA: 11 entradas de precache)
```

Verificação na stack local (Playwright, Chrome real, 1440×950):

```
nativeSelects(home) 0
nativeSelects(cte-profiles) 0
listboxAberto 1
opcoes [ "Todos", "Sem CT-e emitido", "Com CT-e emitido" ]
ariaExpanded true
ariaActive _r_1_-1        ariaActiveDepoisSeta _r_1_-2
listboxDepoisEscape 0
gatilho {"width":218.8,"height":48}
overflow {"bodyClientWidth":1440,"bodyScrollWidth":1440}
```

Zero `<select>` nativo renderizado, listbox abre e fecha, `ArrowDown` move o `aria-activedescendant`,
`Escape` fecha, gatilhos com a mesma altura na barra de filtros e sem scroll horizontal.

## Ajuste de UI pós-feature: largura única de container (2026-07-30)

Defeito reportado: em `/cte-profiles` as bordas esquerda e direita do cabeçalho da aplicação não
coincidiam com as dos painéis abaixo. Causa medida no CSS: cabeçalho e conteúdo são containers
centrados irmãos com larguras independentes — `.application-header` com goteira `--space-12` (acima
de 48rem) e teto `78rem`, enquanto `.cteProfilesShell` usava goteira `--space-8` e teto `74rem`.
`fleet` e `company-settings` tinham o mesmo desvio; `cte-batch` e `mdfe-manifest` erravam ao
contrário (teto `82rem`, mais largos que o cabeçalho); `operations` ainda usava `2rem`/`1.5rem`/`3rem`
literais.

Contrato antes da implementação (`test/design-system/layout-width.contract.ts`, registrado em
`test/design-system.contract.test.ts` e na lista explícita do `package.json`):

```
$ bun test test/design-system.contract.test.ts
 6 pass · 6 fail   # os 6 novos falham: token ausente, shells com largura própria, doc inexistente
```

Os seis pontos do contrato: token único no `:root`; goteira alargada uma única vez em `40rem`; todo
shell com `width: var(--layout-width)`; nenhum `min(100% - …)` fora do token; shell de `operations`
sobre os tokens de espaçamento; regra registrada em `docs/frontend/layout.md` e no `CLAUDE.md`.

Implementação: `--layout-gutter` / `--layout-max-width` / `--layout-width` no `:root` de
`src/styles/index.css` (mais `--space-10`, que era referenciado pelo skeleton de transição sem estar
definido); `width: var(--layout-width)` em `.application-header`, `.workspace-shell`,
`.foundation-shell`, `.page-transition-skeleton` e nos sete shells de módulo; remoção dos três
overrides de largura em `@media (min-width: 40rem)` do `index.css`, do override de `48rem` em
`companySettings.module.css` e do de `40rem` em `nfeWorkspace.module.css`; cabeçalho de copyright nos
seis `*.module.css` que estavam sem ele.

Gate:

```
$ bun run format:check   # All matched files use Prettier code style!
$ bun run lint           # 4 apps, 0 warning
$ bun run typecheck      # 4 apps, ok
$ bun run --cwd apps/frontend-transportada test
 248 pass · 0 fail · 1373 expect() calls (13 arquivos)
$ bun run --cwd apps/frontend-transportada build   # ok
```

Medição na stack local (Playwright, Chrome real): delta entre a borda do cabeçalho e a do conteúdo,
com a regra antiga reaplicada via `style.width` para comparação:

```
antes  1440x950 {"deltaLeft":32,"deltaRight":-32,"overflow":0}
depois 1440x950 {"deltaLeft":0,"deltaRight":0,"overflow":0}
depois 1024x900 {"deltaLeft":0,"deltaRight":0,"overflow":0}
depois  420x900 {"deltaLeft":0,"deltaRight":0,"overflow":0}
```

Todas as nove rotas autenticadas medidas em 1440×950 (`/`, `/cte-profiles`, `/cte-batches`,
`/mdfe-manifests`, `/fleet`, `/company-settings`, `/operations`, `/billing`, `/freight`):
`left 132 · right 1380 · width 1248` no cabeçalho e no conteúdo, `deltaLeft 0`, `deltaRight 0`,
`overflow 0`.

## Ajuste de UI pós-feature: altura única de campo (2026-07-30)

Relato: "tem campos fora do padrão de altura nesse modal" — no modal de emissão de CT-e, o campo
`NOME DO LOTE` fechava mais baixo que os selects `PERFIL DE EMISSÃO` e `AGRUPAMENTO` na mesma linha.

Causa medida (não inferida): o input do modal reusava `.filterInput` (métrica de barra de filtro, sem
`min-height`) enquanto o gatilho do select tem `3rem`. A auditoria de todas as folhas de estilo
mostrou que a divergência era sistêmica — `3rem` no design system, `2.75rem` em frota e manifesto,
`2.5rem` nas linhas de condição, `2.25rem` na moldura de busca, nenhuma altura no modal — e que um
rótulo em grade sem `align-content: start` deixa o campo esticar junto com a célula vizinha mais
alta (`Máximo de tentativas` em `/company-settings` media 70px ao lado de campos de 48px).

Contrato antes da implementação — `test/design-system/field-metrics.contract.ts`, registrado em
`test/design-system.contract.test.ts` e na lista explícita do `package.json`:

```
$ bun test test/design-system.contract.test.ts   # primeira rodada, antes de implementar
 12 pass · 7 fail        (os 7 novos testes falhando)
$ bun test test/design-system.contract.test.ts   # após os 3 testes extras da segunda auditoria
 19 pass · 3 fail
$ bun test test/design-system.contract.test.ts   # depois da implementação
 22 pass · 0 fail · 71 expect() calls
```

Pontos do contrato: (1) os seis tokens `--field-*` declarados em `:root`; (2) toda folha que
dimensiona campo usa `min-height: var(--field-height…)`; (3) nenhuma regra de `input`/`textarea`
inventa altura fora dos tokens (exceções: `5rem` de textarea longa e `0` do file input escondido);
(4) nenhuma altura fora do padrão sobrando em cte-batch/fleet/mdfe-manifest; (5) altura, padding e
corpo de texto sempre da mesma métrica; (6) todo rótulo em grade com `align-content: start`; (7) o
campo do modal na métrica cheia, ao lado dos selects; (8) barras de filtro e moldura de busca na
métrica compacta; (9) `docs/frontend/fields.md` existente e citado no `CLAUDE.md`.

Implementação: tokens `--field-height`/`--field-height-compact`/`--field-padding`/
`--field-padding-compact`/`--field-font-size`/`--field-font-size-compact` em `:root`; adoção em
`select.module.css`, `index.css`, company-settings, cte-batch, cte-profiles, fleet, mdfe-manifest,
nfe-workspace e operations; regra própria `.cteEmissionField input` no modal (mesma borda, fundo e
foco do select) e remoção do `filterInput` do componente; `align-content: start` nos 11 rótulos em
grade; `.tableSearch` de `height: 2.25rem` para `min-height` compacto; `docs/frontend/fields.md` e a
regra correspondente no `CLAUDE.md`.

Gate:

```
$ bun run format:check   # All matched files use Prettier code style!
$ bun run lint           # 4 apps, ok
$ bun run typecheck      # 4 apps, ok
$ bun run --cwd apps/frontend-transportada test
 258 pass · 0 fail · 1396 expect() calls (13 arquivos)
$ bun run --cwd apps/frontend-transportada build   # ok
```

Medição na stack local (Playwright, Chrome real, 1440×950):

```
modal de emissão  Nome do lote 48px · Perfil de emissão 48px · Agrupamento 48px · overflow 0
/operations       alturas distintas [38.4] em 5 campos      (métrica compacta)
/fleet            alturas distintas [48]   em 2 campos
/cte-batches      alturas distintas [48]   em 5 campos
/mdfe-manifests   alturas distintas [48]   em 16 campos
/company-settings alturas distintas [48]   em 30 campos     (antes havia um campo de 70px)
busca da tabela   moldura 38.4px           (input interno sem borda, 17px de linha de texto)
```
