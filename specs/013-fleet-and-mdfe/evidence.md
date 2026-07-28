# Evidência — Feature 013

## T001 — Evento de encerramento MDF-e (110112)

Repositório: `~/Documents/personal/adatechnology-packages/packages/backend/fiscal-provider`.

### Formato verificado antes de implementar

Fonte primária: XSDs `PL_MDFe_300a` (`eventoMDFeTiposBasico_v3.00.xsd`, `evEncMDFe_v3.00.xsd`,
`retEventoMDFe_v3.00.xsd`, `procEventoMDFe_v3.00.xsd`) e a implementação de referência
`nfephp-org/sped-mdfe` (`Tools::sefazEncerra` / `Tools::sefazEvento`).

| ponto         | MDF-e 3.00                                                          | divergência com o CT-e                      |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| raiz          | `<eventoMDFe versao="3.00" xmlns=".../mdfe">`                       | —                                           |
| `Id`          | `ID` + `tpEvento` + chave + `nSeqEvento` com 2 dígitos              | igual                                       |
| `detEvento`   | atributo **`versaoEvento`**                                         | CT-e usa `versao`                           |
| payload       | grupo `<evEncMDFe>` dentro do `detEvento`                           | CT-e põe `descEvento` direto no `detEvento` |
| `evEncMDFe`   | `descEvento`, `nProt`, `dtEnc`, `cUF`, `cMun`, `indEncPorTerceiro?` | —                                           |
| assinatura    | sobre `infEvento` / atributo `Id`                                   | igual                                       |
| SOAP          | `<mdfeDadosMsg>` com o evento **cru**, sem GZip                     | só o `RecepcaoSinc` compacta                |
| SOAP Header   | **nenhum** — não existe `mdfeCabecMsg`                              | CT-e envia `cteCabecMsg`                    |
| retorno       | `retEventoMDFe > infEvento` direto, `cStat` 135                     | CT-e interpõe `retEvento`                   |
| arquivo legal | `procEventoMDFe` = evento assinado + `retEventoMDFe`                | mesmo desenho do ADR-0015                   |

Sobre o SOAP Header: `sped-mdfe` não monta `SoapHeader` em nenhum serviço do MDF-e — o
`objHeader` só aparece em `sped-nfe`. O `sendMdfeAutorizacao` que já está em produção no pacote
segue a mesma regra, então o evento manteve a coerência.

`cOrgao` é a UF do **emitente**; `cUF`/`cMun` do `evEncMDFe` são o lugar onde a viagem terminou —
os dois são campos distintos e o teste fixa essa separação.

### Arquivos

| arquivo                                           | papel                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/sefaz/MdfeEventoXmlBuilder.ts`               | novo — `buildMdfeEncerramentoXml`, `buildMdfeCancelamentoXml`, `MDFE_TP_EVENTO` |
| `src/sefaz/SefazXmlSigner.ts`                     | novo `signMdfeEventoXml` (assina `infEvento`, `Signature` depois dele)          |
| `src/sefaz/MdfeSoapClient.ts`                     | novo `sendMdfeEvento` + `parseMdfeEventoResponse` + `buildProcEventoMdfe`       |
| `src/providers/SefazMdfeProvider.ts`              | novo `close()` com validação pré-rede                                           |
| `src/types.ts`                                    | novo `CloseMdfeParams`                                                          |
| `src/index.ts`                                    | exporta `CloseMdfeParams`                                                       |
| `test/contract/mdfe-evento-wire.contract.test.ts` | novo — 18 testes, escrito antes da implementação                                |

### Validação antes de gastar chamada à SEFAZ

`INVALID_CHAVE`, `MISSING_PROTOCOLO`, `INVALID_MUNICIPIO_ENCERRAMENTO`,
`INVALID_UF_ENCERRAMENTO`, `INVALID_DATA_ENCERRAMENTO` — todos recusam sem tocar a rede, com
teste provando que `fetch` não foi chamado.

### Resultados

```
bun test test/contract/mdfe-evento-wire.contract.test.ts   18 pass  0 fail  (54 expects)
bun run test:contract                                      95 pass  0 fail  (5 arquivos)
bun run check                                              sem erro
bun run build                                              CJS dist/index.js 263.78 KB
```

O teste também prova que senha e PFX do certificado não aparecem no envelope transmitido.

## T002 — Evento de cancelamento MDF-e (110111)

Mesmo caminho do 110112: `buildMdfeCancelamentoXml` → `signMdfeEventoXml` → `sendMdfeEvento` →
`procEventoMDFe` em `xmlEvento`. O `SefazMdfeProvider.cancel` deixou de devolver
`MDFE_EVENTO_NAO_SUPORTADO`.

Grupo do evento, conforme `evCancMDFe_v3.00.xsd` e `Tools::sefazCancela` do `sped-mdfe`:

```xml
<detEvento versaoEvento="3.00">
  <evCancMDFe><descEvento>Cancelamento</descEvento><nProt>…</nProt><xJust>…</xJust></evCancMDFe>
</detEvento>
```

### Validação antes de gastar chamada à SEFAZ

`INVALID_CHAVE`, `MISSING_PROTOCOLO` e `INVALID_JUSTIFICATIVA` (mínimo 15 caracteres, exigência da
SEFAZ) recusam sem tocar a rede. A justificativa é truncada em 255 caracteres e tem caractere
reservado de XML escapado — teste com `&` provando `&amp;` no `xJust`.

### Arquivos

| arquivo                                           | mudança                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/sefaz/MdfeEventoXmlBuilder.ts`               | `buildMdfeCancelamentoXml` + `escapeXml`                                            |
| `src/providers/SefazMdfeProvider.ts`              | `cancel()` real + `validateCancelParams`                                            |
| `test/contract/mdfe-evento-wire.contract.test.ts` | +9 testes (27 no arquivo)                                                           |
| `test/contract/mdfe-sefaz-wire.contract.test.ts`  | o teste do `MDFE_EVENTO_NAO_SUPORTADO` virou teste de transmissão real pela factory |

### Resultados

```
bun test test/contract/mdfe-evento-wire.contract.test.ts   27 pass  0 fail
bun run test:contract                                     104 pass  0 fail  (5 arquivos)
bun run check                                              sem erro
bun run build                                              CJS dist/index.js 266.03 KB
```

**Fase A concluída** — o pacote fiscal emite, encerra e cancela MDF-e.

## T003 — Papel `driver` e permissões `fleet.*`, `mdfe.*`, `trip.*`

Matriz implementada exatamente como o ADR-0016 §2 fixou:

| permissão                                   | company-admin | finance | fiscal | operator | viewer | driver |
| ------------------------------------------- | ------------- | ------- | ------ | -------- | ------ | ------ |
| `fleet.read`                                | ✅            | —       | ✅     | ✅       | ✅     | —      |
| `fleet.manage`                              | ✅            | —       | —      | ✅       | —      | —      |
| `mdfe.read`                                 | ✅            | —       | ✅     | ✅       | ✅     | —      |
| `mdfe.manage`                               | ✅            | —       | ✅     | ✅       | —      | —      |
| `mdfe.issue` / `mdfe.close` / `mdfe.cancel` | —             | —       | ✅     | —        | —      | —      |
| `trip.read` / `trip.report`                 | —             | —       | —      | —        | —      | ✅     |

O `driver` fica com dois itens e mais nada: teste prova que ele não alcança `invoices.read`,
`cte.read`, `billing.read`, `fleet.read`, `mdfe.read`, `operations.read` nem
`view-preferences.manage`, e que nenhum papel de escritório alcança `trip.*`. Os três eventos
fiscais do MDF-e ficam só no `fiscal` — emissão e cancelamento de CT-e já seguem essa regra.

### Arquivos

| arquivo                                                                 | mudança                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/identity/domain/authorization.policy.ts`                           | +9 permissões em `TRANSPORTADA_PERMISSIONS`, matriz dos 5 papéis ampliada, papel `driver` novo     |
| `src/database/identity.schema.ts`                                       | `COMPANY_ROLES` com `driver`, check `membership_roles_role_check` ampliado                         |
| `drizzle/20260728133253_driver_company_role/migration.sql`              | `DROP CONSTRAINT` + `ADD CONSTRAINT` do check                                                      |
| `drizzle/20260728133253_driver_company_role/rollback.sql`               | apaga as linhas `driver`, restaura o check estreito, remove a entrada do journal com guarda `<> 1` |
| `realm/transportada-local-realm.json`                                   | realm role `driver`                                                                                |
| `test/authorization.contract.test.ts`                                   | matriz completa + 3 testes novos (driver isolado, `trip.*` exclusivo, eventos MDF-e só no fiscal)  |
| `test/identity-schema.contract.test.ts`                                 | `COMPANY_ROLES` e SQL do check                                                                     |
| `test/database-migration/identity-constraints.assertion.ts`             | insere `driver` em `membership_roles` contra o Postgres real                                       |
| `test/database-migration/static-migration.contract.ts`                  | nova pasta de migration na lista versionada                                                        |
| `test/auth-me.contract.test.ts`, `test/tenant-context.contract.test.ts` | permissões resolvidas de `fiscal + viewer`                                                         |
| `test/keycloak-realm.contract.test.ts` (raiz)                           | `driver` no contrato do realm                                                                      |

O seed local (`LOCAL_IDENTITY_ROLES`) **não** ganhou `driver`: pelo ADR-0016 §1 usuário não vira
motorista por ter o papel — sem linha em `fleet_drivers` não há condutor.

### Resultados

```
bun run --cwd apps/api-transportada test    787 pass  0 fail  1 skip  (50 arquivos)
bun test test/keycloak-realm.contract.test.ts  6 pass  0 fail
bun run --cwd apps/api-transportada typecheck  sem erro
bun run --cwd apps/api-transportada db:check   Everything's fine
make migration-test                            9 pass  0 fail  (migration + rollback reais)
bun run lint                                   sem aviso
```

`make migration-test` aplica **todos** os `rollback.sql` pós-identidade em ordem reversa, duas
vezes — o rollback novo rodou de verdade contra Postgres e a guarda de uma única entrada no journal
passou.

A allowlist do frontend entra no T004, no mesmo commit.

## T004 — Allowlist do frontend em sincronia e papel `driver` na sessão

`useAuthMe.query.ts` é o guarda estrito da resposta do `/auth/me`: `isLiteralArray` rejeita
qualquer permissão ou papel fora da allowlist, e o hook estoura `IDENTITY_AUTH_ME_INVALID` num
200 perfeitamente válido. Com o T003 no ar e o frontend parado nos cinco papéis, um membership
`driver` derrubaria a sessão inteira — é exatamente a família de bug já registrada no projeto.

`COMPANY_PERMISSIONS` recebeu as 9 permissões novas e `COMPANY_ROLES` recebeu `driver`.

### O teste que impede a divergência de voltar

O contrato ganhou um teste que lê os arquivos versionados da API — `authorization.policy.ts` e
`identity.schema.ts` — extrai os literais e compara com a allowlist do frontend:

```ts
expect(frontendPermissions).toEqual(apiPermissions) // sem 'companies.manage', que é de plataforma
expect(frontendRoles).toEqual(apiRoles)
```

É leitura de texto, não import: a regra de nenhuma app importar código-fonte de outra continua
valendo. A partir daqui, permissão nova na API sem allowlist atualizada quebra o `make check` em vez
de quebrar a tela do usuário.

### Arquivos

| arquivo                                           | mudança                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/modules/identity/queries/useAuthMe.query.ts` | +9 permissões, papel `driver`                                                                     |
| `test/frontend-contract.test.ts`                  | catálogo ampliado, teste do papel `driver` com `trip.*`, teste de sincronia com a política da API |

O view-model de sessão (`getKeycloakAuthProvider().getProfile()`) deriva nome, iniciais e foto dos
claims do token e não carrega papéis — o papel só existe no tipo do `/auth/me`, que é onde o
`driver` entrou. Nenhuma navegação é gateada por papel hoje, então não há tela a esconder ainda.

### Resultados

```
bun run --cwd apps/frontend-transportada test    165 pass  0 fail  (10 arquivos)
bun run --cwd apps/frontend-transportada typecheck  sem erro
bun run --cwd apps/frontend-transportada lint       sem aviso
bun run format:check                                sem pendência
```

Antes da implementação os três testes novos falharam (catálogo, papel `driver` e sincronia) —
vermelho registrado antes do verde.

**Fase B concluída** — backend e frontend enxergam o mesmo conjunto de papéis e permissões.

## T005 — Schema de frota: veículos, motoristas e o vínculo entre eles

Três tabelas novas em `src/database/fleet.schema.ts`, desenhadas contra os campos que o MDF-e 3.00
exige do veículo e do condutor — não contra um cadastro genérico. `tara`, `capKG`, `capM3`, `tpRod`,
`tpCar`, `tpProp` e o grupo `<prop>` já nascem com o nome e o domínio do layout, então o
`mdfe-payload.builder.ts` do T011 lê a linha e escreve o XML sem tradução no meio.

| tabela                             | papel                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `fleet_vehicles`                   | tração e reboque na mesma tabela, separados por `role`                     |
| `fleet_drivers`                    | condutor, com `membership_id` opcional para quando ele ganhar login no app |
| `fleet_driver_vehicle_assignments` | período condutor↔veículo, com histórico nas linhas liberadas              |

### As regras que o banco recusa, não a aplicação

- `fleet_vehicles_wheel_type_check` — `tpRod` só existe no `veicTracao`. O check é uma equivalência
  (`role = 'traction'` **se e somente se** há `wheel_type`), então reboque com rodado e tração sem
  rodado caem os dois.
- `fleet_vehicles_owner_check` — o grupo `<prop>` é tudo-ou-nada e proibido em veículo próprio.
  Emitir `<prop>` com o CNPJ do próprio emitente é rejeição na SEFAZ.
- `fleet_drivers_company_id_tax_id_unique` — um CPF por empresa; o mesmo CPF pode dirigir para duas
  transportadoras.
- `fleet_vehicles_company_id_plate_unique` — placa única por empresa, no padrão Mercosul (`AAA1A23`)
  e no antigo (`AAA1234`), sempre sem separador.
- `…_live_vehicle_unique` e `…_live_driver_unique` — uniques **parciais** (`where released_at is
null`): uma viagem tem um veículo e um condutor ao mesmo tempo, e o histórico continua inteiro nas
  linhas já liberadas.

### Tenant-safety estrutural do vínculo com o login

`membership_id` sozinho deixaria um motorista da empresa A apontar para um membership da empresa B.
A FK virou composta:

```ts
foreignKey({
  columns: [table.membershipId, table.companyId],
  foreignColumns: [userCompanyMemberships.id, userCompanyMemberships.companyId],
  name: 'fleet_drivers_company_membership_fk',
})
```

o que exigiu `unique('user_company_memberships_id_company_id_unique')` em `identity.schema.ts` — a
unicidade original em `(user_id, company_id)` ficou intacta. Assignments seguem o mesmo padrão:
referenciam `(company_id, driver_id)` e `(company_id, vehicle_id)` contra os uniques `(company_id,
id)`, então nenhuma linha alcança outro tenant. O teste vivo prova: o insert cruzado morre com
`23503 fleet_drivers_company_membership_fk`.

Motorista sem login roda o MDF-e inteiro — `membership_id` é a **única** coluna nullable das três
tabelas, e o contrato afirma isso comparando `requiredColumnNames` com `columnNames` filtrado.

### Arquivos

| arquivo                                                      | mudança                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `src/database/fleet.schema.ts`                               | as três tabelas, constantes de domínio e checks           |
| `src/database/schema-check.constant.ts`                      | `inList` extraído (2ª ocorrência) — sem mudança de SQL    |
| `src/database/cte-emission-profile.schema.ts`                | passa a importar `inList` em vez de redeclarar            |
| `src/database/identity.schema.ts`                            | unique composto `(id, company_id)` para a FK do motorista |
| `src/database/database.schema.ts`                            | import, `export *` e as três tabelas no `databaseSchema`  |
| `drizzle/20260728140645_fleet_vehicles_and_drivers/`         | `migration.sql` gerado + `rollback.sql` escrito à mão     |
| `test/fleet-schema.contract.test.ts` + `test/fleet-schema/*` | 24 testes: colunas, constraints, uniques, tenant-safety   |
| `test/database-migration/fleet-constraints.assertion.ts`     | as constraints exercitadas contra Postgres de verdade     |
| `test/database-migration/{support,static-migration,…}`       | `FLEET_TABLES` e a migration nova na lista estática       |
| `apps/api-transportada/package.json`                         | o arquivo de teste novo na lista explícita                |

### Resultados

```
bun test test/fleet-schema.contract.test.ts      24 pass  0 fail  (79 expects)
bun run --cwd apps/api-transportada test        811 pass  0 fail  1 skip  (51 arquivos)
bun run --cwd apps/api-transportada typecheck   sem erro
bun run --cwd apps/api-transportada db:check    Everything's fine
make migration-test                               9 pass  0 fail  (154 expects — eram 130)
bun run lint                                     sem aviso
bun run format:check                             sem pendência
```

O vermelho antes do verde ficou registrado: a primeira execução do contrato falhou com
`SyntaxError: Export named 'fleetVehicles' not found in module '…/database.schema.ts'`.

O `rollback.sql` não passou de primeira — o `DO $ … $;` com tag de cifrão simples estourou
`42601 syntax error at or near "$"` no `make migration-test`. Corrigido para `DO $$ … $$;`, como as
migrations anteriores já faziam. O hash do journal é do `migration.sql`, então não mudou. Os 24
expects a mais confirmam que as assertivas de frota rodaram de fato contra o banco descartável.

## T006 — Application + rotas `/fleet/vehicles` e `/fleet/drivers`

Seis rotas sobre as duas tabelas de cadastro: `GET`/`POST` em cada coleção e `PATCH` por id. Leitura
exige `fleet.read`, escrita exige `fleet.manage` — quem só lê recebe 403 no POST e no PATCH sem que o
use case chegue a ser chamado.

### O que o desenho decidiu

**Sem `Idempotency-Key`.** As rotas de criação de perfil e de lote gravam registro de idempotência
porque um POST repetido criaria linha duplicada. Aqui não: `fleet_vehicles_company_id_plate_unique` e
`fleet_drivers_company_id_tax_id_unique` transformam o reenvio em `409` no próprio banco. Chave de
idempotência sobre isso seria máquina parada — o cadastro já é seguro para repetir por construção.

**404 e 409 dizem coisas diferentes.** O `UPDATE … WHERE company_id AND id AND version` não devolve
linha em dois casos opostos: o veículo não existe (ou é de outro tenant, que dá no mesmo pela cláusula
de empresa) ou a versão enviada é velha. O use case desempata com um `findById` depois do update sem
linha — ausente vira `FLEET_VEHICLE_NOT_FOUND` (404), presente vira `FLEET_VEHICLE_VERSION_CONFLICT`
(409). Os dois ramos estão presos por teste de aplicação.

**O vínculo com login é opcional e nunca atravessa o tenant.** Motorista roda o MDF-e inteiro sem
usuário — `membershipId` é a única coluna anulável das duas tabelas. Quando vem preenchido, o use
case chama `hasMembership({ companyId, membershipId })` antes de gravar, tanto no create quanto no
update, e devolve `422 FLEET_DRIVER_MEMBERSHIP_NOT_FOUND` se o membership não for daquela empresa. A
consulta ainda exige `status = 'active'`: membership desligado não loga no app, então o vínculo
nasceria morto. Isso é defesa em profundidade — a FK composta
`fleet_drivers_company_membership_fk` provada na T005 já barra o atravessamento no banco.

**As duas regras de layout do MDF-e ficam na borda.** O `superRefine` do schema rejeita `wheelType`
em reboque e a sua ausência em tração (`tpRod` só existe no `veicTracao`), e trata o grupo `<prop>`
como tudo-ou-nada proibido em veículo próprio. Deixar passar aqui viraria rejeição da SEFAZ lá na
frente, com o manifesto já montado.

**`companyId` nunca vem do payload.** Os schemas são `.strict()`, então um `companyId` contrabandeado
no corpo é `400`; a lista tem allowlist de chaves de query, então `?companyId=outra` também é `400`. A
empresa sai sempre de `context.scope`.

### Arquivos

| Arquivo                                                           | Papel                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/fleet/application/fleet.port.ts`                             | contratos de veículo e motorista + as duas portas de repo                 |
| `src/fleet/application/fleet-vehicles.use-case.ts`                | create/list/update com o desempate 404 × 409                              |
| `src/fleet/application/fleet-drivers.use-case.ts`                 | idem + guarda de membership no create e no update                         |
| `src/fleet/domain/fleet.error.ts`                                 | 8 erros tipados (404, 409, 422) sobre `ApiError`                          |
| `src/fleet/presentation/fleet-request.schema.ts`                  | Zod das duas entidades + as regras de `tpRod` e `<prop>`                  |
| `src/fleet/presentation/fleet.schema.ts`                          | parse de corpo, de query e do id de caminho                               |
| `src/fleet/presentation/fleet.routes.ts`                          | as seis rotas e a serialização da resposta                                |
| `src/fleet/infrastructure/fleet.mapper.ts`                        | linha ⇄ domínio, bigint como string, `owner` reconstruído                 |
| `src/fleet/infrastructure/drizzle-fleet-vehicle.repository.ts`    | paginação por cursor, trava otimista, placa duplicada → 409               |
| `src/fleet/infrastructure/drizzle-fleet-driver.repository.ts`     | idem + `hasMembership` restrito à empresa e ao ativo                      |
| `src/fleet/infrastructure/fleet-cursor.support.ts`                | cursor `createdAt::id` compartilhado pelos dois repos                     |
| `src/database/postgres-error.support.ts`                          | `findPostgresError` extraído (2ª ocorrência) + `violatedUniqueConstraint` |
| `src/cte-profiles/infrastructure/cte-emission-profile.support.ts` | passa a importar o suporte extraído — sobraram 11 linhas                  |
| `src/shared/api.constant.ts`                                      | `API_FLEET_VEHICLES_PATH` e `API_FLEET_DRIVERS_PATH`                      |
| `src/main.ts`                                                     | repositórios, use cases e as rotas no composition root                    |
| `test/fleet-application/*` + `test/fleet-http/*`                  | 22 testes: aplicação, HTTP e segurança                                    |
| `apps/api-transportada/package.json`                              | os dois entrypoints de teste na lista explícita                           |

### Resultados

```
bun test test/fleet-application.contract.test.ts test/fleet-http.contract.test.ts
                                                  22 pass  0 fail  (75 expects)
bun run --cwd apps/api-transportada test         833 pass  0 fail  1 skip  (53 arquivos — eram 811)
bun run --cwd apps/api-transportada typecheck    sem erro
bun run lint                                     sem aviso
bun run format:check                             sem pendência
```

O vermelho antes do verde ficou registrado: a primeira execução dos dois contratos deu `0 pass /
16 fail` com `Cannot find module '../../src/fleet/presentation/fleet.routes.js'`.

Duas correções durante o caminho. A fixture tipava `bodyType` como `MdfeBodyType | ''`, mas
`fleet_vehicles_body_type_check` exige valor da lista e a coluna é `NOT NULL default '00'` — vazio é
ilegal, então a porta passou a exigir `MdfeBodyType` e a fixture usa `'00'` (não aplicável), que é o
correto para o cavalo mecânico. E o `responseData<TData>` sem sítio de inferência quebrava o
`toEqual` do Bun; ganhou `TData extends object = object`.

## T007 — Frontend: módulo de frota (veículos e motoristas)

Contrato antes da implementação. `test/fleet.contract.test.ts` (entrypoint) importa três suítes —
`client-and-queries`, `permissions-and-states` e `presentation-boundaries` — e o entrypoint já estava
na lista explícita de `apps/frontend-transportada/package.json`. Primeira execução: `0 pass / 11 fail`,
todas com `Cannot find module '../../src/modules/fleet/…'`.

### O que ficou de pé

| Arquivo                                                  | Papel                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `shared/fleet.types.ts`                                  | tipos de veículo, motorista, filtros e os dois `*FormState`                                         |
| `shared/fleet.constant.ts`                               | allowlists de corpo/formulário + `FLEET_FEEDBACK_KEY_BY_ERROR`                                      |
| `shared/fleetGuards.validation.ts`                       | type guards manuais (o front não usa zod)                                                           |
| `shared/fleetResponse.validation.ts`                     | adaptadores estritos: recusam campo de tenant, número em lugar de string e envelope sem `page`      |
| `shared/fleetClient.service.ts`                          | único ponto HTTP do módulo — `fetch` injetado, `Bearer`, `no-store`, query allowlistada             |
| `shared/fleetForm.service.ts`                            | espelha `assertVehicleRules` do backend: `tpRod` só na tração, `<prop>` proibido em veículo próprio |
| `shared/fleetFilters.service.ts`                         | descarta filtro vazio para não viajar como `''`                                                     |
| `shared/fleetViewModel.service.ts`                       | tabela de estados `forbidden → error → loading → empty → ready`                                     |
| `hooks/useFleet.hook.ts`                                 | controller com as duas permissões + TanStack Query (chaves por empresa e filtros)                   |
| `hooks/useVehicleForm.hook.ts` / `useDriverForm.hook.ts` | estado do formulário e tradução do código de erro em chave de feedback                              |
| `components/*.component.tsx`                             | campos, listas, painéis e formulários (owner só aparece quando não é próprio)                       |
| `pages/FleetWorkspace.page.tsx`                          | a página, com filtros, editor e o toggle de situação                                                |
| `locales/fleet.locale.json` + `fleet.en.locale.json`     | PT/EN, sem texto solto no JSX                                                                       |
| `styles/fleet.module.css`                                | tokens de `:root`, tabela zebrada, sem estilo inline                                                |
| `src/modules/shared/i18n/i18n.service.ts`                | namespace `fleet` nos dois idiomas                                                                  |
| `src/main.tsx`                                           | rota `/fleet`, ícone e item "Frota" no grupo Administração                                          |

Leitura exige `fleet.read`; qualquer escrita exige `fleet.manage` — as duas políticas do backend, e o
controller rejeita com `FLEET_FORBIDDEN` sem chegar a tocar na rede. O client não manda
`Idempotency-Key`: os índices únicos de placa e de CPF já transformam POST repetido em 409.

### Resultados

```
bun test test/fleet.contract.test.ts              11 pass  0 fail  (78 expects)
bun run --cwd apps/frontend-transportada test    176 pass  0 fail  (11 arquivos — eram 165)
bun run --cwd apps/frontend-transportada typecheck  sem erro
bun run --cwd apps/frontend-transportada build     ok (PWA gerado)
bun run lint                                       sem aviso
bun run format:check                               sem pendência
```

Uma correção no caminho: o `typecheck` acusou que o tipo local `FleetClient` da suíte tipava os
métodos com `typeof VEHICLE_BODY`, o que congela os literais do veículo próprio e recusa
`AGGREGATE_VEHICLE_BODY`. Passou a usar os contratos da fixture (`FleetVehicleBodyContract`,
`FleetDriverBodyContract`) — nenhuma asserção mudou.

## T008 — Modelo de persistência do MDF-e

### Vermelho antes do verde

```
bun test ./test/mdfe-schema.contract.test.ts
SyntaxError: Export named 'mdfeManifests' not found in module '.../src/database/database.schema.ts'
0 pass  1 fail
```

As quatro suítes (`manifests`, `manifest-children`, `issuance`, `tenant-safety`) e o entrypoint
`test/mdfe-schema.contract.test.ts` foram escritos antes de existir uma linha de `mdfe.schema.ts`, e
o arquivo entrou na lista explícita de testes do `package.json` no mesmo commit — sem isso o teste
não roda.

### As oito tabelas

| Tabela                         | Papel                                                                       |
| ------------------------------ | --------------------------------------------------------------------------- |
| `mdfe_manifests`               | cabeçalho: veículo, UF de início/fim, carga congelada, série/número, versão |
| `mdfe_manifest_drivers`        | condutores do manifesto (1..10), posição única por manifesto                |
| `mdfe_manifest_items`          | CT-es manifestados, com município de descarga e `released_at`               |
| `mdfe_manifest_loading_cities` | municípios de carregamento (1..50)                                          |
| `mdfe_issuance_attempts`       | tentativas de `issue`/`close`/`cancel`, idempotência e reserva de número    |
| `mdfe_fiscal_documents`        | autorização, encerramento (110112) e cancelamento (110111) com XML e sha256 |
| `mdfe_issuance_events`         | trilha de eventos por tentativa                                             |
| `mdfe_issuance_outbox`         | publicação transacional para a trilha do worker                             |

Nenhuma enumeração foi inventada: `tpEmit`, `tpTransp`, `tpCarga`, `cUnid` saíram dos tipos
`MdfeData` do `@adatechnology/fiscal-provider`.

### As três regras que o banco passou a garantir

```
mdfe_manifests_issued_state_check          status autorizado/encerrado/cancelado exige série e número
mdfe_manifest_items_live_document_unique   unique parcial where released_at is null — um CT-e vive em um manifesto só
mdfe_fiscal_documents_closed_never_cancels manifesto encerrado não cancela (a SEFAZ rejeita o 110111 depois do 110112)
```

O unique parcial repete o idioma já usado em `fleet_driver_vehicle_assignments`: cancelar o manifesto
carimba `released_at` e devolve o CT-e para um novo manifesto, sem apagar histórico.
`mdfe_issuance_attempts_reservation_check` completa o par — só a emissão reserva número; encerrar e
cancelar reaproveitam o que já foi autorizado.

### Migration, rollback e o que o teste vivo prova

`drizzle/20260728150234_mdfe_manifests/` — `migration.sql` (8 `CREATE TABLE`, 7 índices, 24 FKs),
`snapshot.json` e `rollback.sql` manual, com drop em ordem reversa de dependência e a guarda de
journal (`deleted_migrations <> 1` levanta exceção) apontando para o sha256
`86455117d06065d17a0a33bded9de01d9d5875aa291ec9dc3fdfb4ce06a11f99` do próprio `migration.sql`.

O `database-migration.integration.ts` filtrava as tabelas observadas por uma allowlist: sem
`MDFE_TABLES` em `support.ts`, a migration aplicava e o rollback rodava sem ninguém olhar. As oito
tabelas entraram na lista e ganharam `mdfe-constraints.assertion.ts` — agora o Postgres descartável
prova, ao vivo, o FK cruzado de veículo entre tenants, o `issued_state_check`, o unique parcial de
série/número (e que `production` e `homologation` podem repetir o mesmo número), as duas unicidades
de condutor, o padrão do código IBGE, a reserva obrigatória só no `issue` e o cascade dos filhos ao
apagar o manifesto.

### Resultados

```
bun test test/mdfe-schema.contract.test.ts           33 pass  0 fail  (143 expects)
make migration-test                                   9 pass  0 fail  (182 expects — eram 154)
bun run --cwd apps/api-transportada test            866 pass  0 fail  (54 arquivos, 4558 expects)
bun run --cwd apps/api-transportada typecheck       sem erro
bun run lint                                        sem aviso
bun run format:check                                sem pendência
```

Uma correção no caminho: `static-migration.contract.ts` fixa a lista ordenada de diretórios de
migration e recusou o diretório novo até ele ser declarado ali — o teste está fazendo exatamente o que
deveria.

## T009 — Elegibilidade do CT-e para manifesto

### Vermelho antes do verde

```
bun test ./test/mdfe-domain.contract.test.ts
error: Cannot find module '.../src/mdfe-manifests/domain/mdfe-manifest-eligibility.policy.js'
0 pass  1 fail
```

`test/mdfe-domain/eligibility.contract.ts` e o entrypoint `test/mdfe-domain.contract.test.ts`
nasceram antes da política e entraram na lista explícita do `package.json` no mesmo passo.

### A decisão

`selectManifestableDocuments` é pura: recebe os ids pedidos, as linhas candidatas que o repositório
devolveu, a empresa do contexto autenticado e o ambiente fiscal do manifesto; devolve
`{ manifestable, blocked }`. Nada de I/O, nada de `Date`, nenhuma exceção — quem decide o status HTTP
é a camada de aplicação.

| Motivo                                 | Quando                                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| `MDFE_DOCUMENT_OTHER_COMPANY`          | a linha veio com outra empresa — defesa contra vazamento de query |
| `MDFE_DOCUMENT_NOT_AUTHORIZED`         | CT-e em qualquer status que não `authorized`                      |
| `MDFE_DOCUMENT_ALREADY_MANIFESTED`     | já está em manifesto não cancelado                                |
| `MDFE_DOCUMENT_ENVIRONMENT_MISMATCH`   | CT-e de produção em manifesto de homologação (e vice-versa)       |
| `MDFE_DOCUMENT_MISSING_DISCHARGE_CITY` | sem código IBGE ou nome do município de descarga                  |
| `MDFE_DOCUMENT_MISSING_TOTALS`         | sem valor ou peso para somar em `vCarga`/`qCarga`                 |
| `MDFE_DOCUMENT_NOT_FOUND`              | id pedido que o repositório não devolveu                          |
| `MDFE_DOCUMENT_DUPLICATED`             | id repetido no mesmo pedido                                       |

Três escolhas que valem registro:

- A verificação de empresa fica na política mesmo o repositório já filtrando por `companyId` — é
  barata e transforma um vazamento de query em bloqueio explícito, não em manifesto de outro tenant.
- O resultado preserva a **ordem pedida**, não a ordem que o Postgres devolveu: a posição do item no
  manifesto é a que o operador escolheu.
- Um pedido vazio devolve `manifestable: []` e `blocked: []` — a política não inventa um bloqueio
  para algo que a validação Zod da borda já recusa.

Nenhuma regra legal foi inventada: os motivos derivam dos contratos do `spec.md` ("um CT-e vive em no
máximo um manifesto não cancelado") e dos campos que o `MdfeData` do pacote fiscal exige.

### Resultados

```
bun test test/mdfe-domain.contract.test.ts    12 pass  0 fail  (24 expects)
bun run --cwd apps/api-transportada typecheck sem erro
bun run --cwd apps/api-transportada lint      sem aviso
bunx prettier --check                         sem pendência
```

## T010 — Estado do manifesto

### Vermelho antes do verde

```
bun test ./test/mdfe-domain.contract.test.ts
error: Cannot find module '.../src/mdfe-manifests/domain/mdfe-manifest-state.policy.js'
0 pass  1 fail
```

### A máquina de estados

`checkManifestTransition` recebe ação, status atual, `authorizedAt` e o `now` de quem chamou —
`Date.now()` nunca é lido de dentro, então o teste é determinístico e a política continua pura.
Devolve união discriminada: `{ allowed: true, nextStatus }` ou `{ allowed: false, reason }`.

| Ação     | De                     | Para        | Bloqueios                                                                                |
| -------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `issue`  | `draft`, `rejected`    | `issuing`   | `issuing` → `IN_FLIGHT`; autorizado/encerrado/cancelado → `NOT_ISSUABLE`                 |
| `close`  | `authorized`           | `closed`    | `closed` → `ALREADY_CLOSED`; `cancelled` → `ALREADY_CANCELLED`; resto → `NOT_AUTHORIZED` |
| `cancel` | `authorized` na janela | `cancelled` | `closed` → `ALREADY_CLOSED`; fora do prazo → `CANCELLATION_WINDOW_EXPIRED`               |

`rejected` volta a `issuing` — a SEFAZ recusou o lote, o operador corrige e retransmite; travar aí
obrigaria a recriar o manifesto inteiro. As duas regras que o ADR-0016 manda replicar antes de gastar
a chamada estão cobertas: **encerrado não cancela** (o 110111 é rejeitado depois do 110112) e
**cancelamento tem prazo**.

O prazo mora em `MDFE_CANCELLATION_WINDOW_HOURS = 24` e é sobrescrevível por
`cancellationWindowHours` — a empresa pode encurtar por política interna, e o número legal fica em um
lugar só, auditável, em vez de espalhado em comparação de data. O limite é inclusivo: autorizado há
exatamente 24h ainda cancela. Manifesto `authorized` sem `authorizedAt` recusa cancelamento em vez de
tratar a ausência como "acabou de autorizar".

`isCancellationJustificationValid` guarda os 15 caracteres que a SEFAZ exige, ignorando espaço em
branco — o mesmo mínimo que o `check` de `mdfe_fiscal_documents` grava no banco.

### Resultados

```
bun test test/mdfe-domain.contract.test.ts    27 pass  0 fail  (50 expects — eram 12/24 só com a elegibilidade)
bun run --cwd apps/api-transportada typecheck sem erro
bun run --cwd apps/api-transportada lint      sem aviso
bunx prettier --check                         sem pendência
```

## T011 — Builder do payload MDF-e

### Vermelho antes do verde

```
bun test ./test/mdfe-domain.contract.test.ts
error: Cannot find module '.../src/mdfe-manifests/domain/mdfe-payload.builder.js'
0 pass  1 fail  1 error
```

### O golden test

`test/mdfe-domain/payload-builder.contract.ts` monta um manifesto completo — 3 CT-es (dois para São
Paulo, um para Belo Horizonte), 2 condutores, 2 municípios de carregamento, PR → MG, veículo próprio
ABC1D23 — e compara o objeto inteiro campo a campo, não só as partes fáceis. Os demais casos cobrem
agrupamento por município, totais congelados, ausência de cada opcional, produto predominante sem
NCM, proprietário CNPJ vs CPF, as seis recusas e a carga própria sem RNTRC.

### Decisões

**Totais congelados mandam.** `buildMdfePayload` não soma os documentos para preencher `totais`: usa
o que o manifesto congelou no cabeçalho e **recusa** (`MDFE_PAYLOAD_TOTALS_MISMATCH`, 422) se a soma
dos CT-es divergir. Item removido depois do congelamento vira erro explícito em vez de XML com valor
que não bate com a carga declarada. A soma roda em `bigint` pela `decimal.service` — valor na escala
2, peso na escala 4 —, nunca em float.

**Agrupamento por primeira aparição.** `municipiosDescarga` sai na ordem em que cada município
aparece na seleção, com as `chavesCte` acumuladas na ordem dos documentos. Ordem determinística
significa XML determinístico, e o teste consegue afirmar a lista inteira.

**`dataInicioViagem` em Brasília, calculado aqui.** O layout exige `AAAA-MM-DDThh:mm:ss-03:00`. O
`formatSefazDateTime` do pacote fiscal mora em `src/sefaz/*`, que este repo não importa, então a
conversão é local e sem dependência de fuso do processo: desloca o instante em 3h e carimba o offset
fixo (Brasília não observa horário de verão desde 2019).

**Contrato de saída é nosso.** O tipo devolvido é `MdfeManifestPayload`, declarado em
`mdfe-payload.types.ts` espelhando o `MdfeData` do layout 3.00 — mesmos nomes, mesmos valores. O
domínio fica sem dependência de vendor, e o gateway (T016) entrega o objeto direto ao provider.
Motivo prático somado ao arquitetural: o `@adatechnology/fiscal-provider` instalado é o `0.3.0-rc.2`
do registry, publicado **antes** do MDF-e — o `SefazMdfeProvider` e os eventos das T001/T002 estão no
pacote local, ainda sem release. **Fica registrado para a T015/T016: a emissão só roda depois de uma
release do pacote com MDF-e** (hoje `0.3.0-rc.1` local, com as mudanças ainda não commitadas).

**Recusas antes da SEFAZ.** Sete erros 422 (`mdfe-payload.error.ts`) barram no domínio o que a SEFAZ
rejeitaria: seleção vazia, sem município de carregamento, sem condutor, tração sem `tpRod`, veículo
não-próprio sem proprietário declarado, `tpEmit=1` sem RNTRC e a divergência de totais. RNTRC só é
exigido do transportador contratado — carga própria (`tpEmit=2`) viaja sem ele.

**Proprietário pelo tamanho do documento.** 14 dígitos → `cnpj`, 11 → `cpf`. `tipoProprietario`,
`rntrc`, `nome` e `uf` vêm do cadastro do veículo, que a T005 já obriga a preencher quando a
propriedade não é `own`.

### Resultados

```
bun test test/mdfe-domain.contract.test.ts       37 pass  0 fail  68 expects
bun test (suíte api completa)                    903 pass  1 skip  0 fail  4626 expects
bun run typecheck (4 apps)                       sem erro
bun run lint (4 apps)                            sem aviso
bun run format:check                             sem pendência
```

## T012 — `POST /mdfe-manifests/preview`

### Vermelho antes do verde

```
bun test ./test/mdfe-application.contract.test.ts ./test/mdfe-http.contract.test.ts
error: Cannot find module '.../src/mdfe-manifests/application/preview-mdfe-manifest.use-case.js'
error: Cannot find module '.../src/mdfe-manifests/presentation/mdfe-manifests.routes.js'
0 pass  2 fail  2 errors
```

Os dois arquivos de teste novos entraram na lista explícita do `package.json` — sem isso o `bun test`
da app simplesmente não os enxerga.

### O que os testes cobrem

`test/mdfe-application/preview.contract.ts` (12 casos) monta a prévia de 3 CT-es — dois descarregando
em São Paulo, um em Belo Horizonte, saindo de Curitiba e Florianópolis — e afirma o objeto inteiro:
municípios de carregamento, municípios de descarga com as chaves acumuladas, totais
(`cargoValue '2200.00'`, `cargoWeight '1000.0000'`, `cteCount 3`), ambiente fiscal e a lista de
bloqueios com motivo, na ordem pedida. `test/mdfe-http/preview.contract.ts` (4 casos) cobre o 200 com
envelope `{ data }`, o 400 de `INVALID_REQUEST` (corpo vazio, lista vazia, id que não é UUID e chave
`companyId` a mais), o 403 sem `mdfe.manage` e o repasse do erro de domínio como 422.

### Decisões

**`companyId` sai do contexto, e o schema recusa quem tentar mandar.** O corpo é `.strict()` com
`documentIds` apenas; uma chave `companyId` no payload vira 400 antes de chegar ao use-case, e o
use-case ignora qualquer coisa que não seja `input.context.companyId`. O teste que prova isso precisa
guardar o payload numa variável antes de passar — objeto literal fresco morre no excess-property
check do TS, e `as never` não compila.

**A elegibilidade cresceu em vez de a prévia remendar.** A T009 devolvia `ManifestableDocument` sem
município de origem, então a prévia não teria como derivar `municipiosCarregamento` nem `UFIni`. Em
vez de re-cruzar os ids aprovados contra a lista de candidatos dentro do use-case, a policy ganhou
`originCityCode`, `originCityName`, `originState` e `dischargeState` mais o motivo
`missingLoadingCity` — CT-e sem município de carregamento **é** inelegível, e partir esse julgamento
em duas camadas seria pior. O custo foi atualizar a fixture da T009, que voltou verde.

**UFFim ambígua fica em branco, UFIni divergente é erro.** Quando os CT-es descarregam em estados
diferentes, `destinationState` volta `''` e `destinationStateOptions` lista os estados distintos na
ordem de aparição — quem escolhe é o operador na criação, não a API por adivinhação. Já origem em
mais de uma UF é 422 (`MDFE_MANIFEST_MULTIPLE_ORIGIN_STATES`): `UFIni` é única por layout, não há o
que arbitrar. Passar de 50 municípios de carregamento também é 422
(`MDFE_MANIFEST_TOO_MANY_LOADING_CITIES`), reusando o `MAX_LOADING_CITIES_PER_MANIFEST` do schema.

**Seleção vazia não consulta o banco.** `documentIds: []` devolve a prévia zerada sem chamar
`listCandidateDocuments` — o teste afirma a contagem de chamadas. Sem configuração fiscal da empresa
é 409 (`MDFE_FISCAL_SETTINGS_MISSING`), porque sem ambiente não dá para julgar
`environmentMismatch`.

**Repositório Drizzle e composition root ficam para a T013.** O texto da task nomeia
`src/mdfe-manifests/{application,presentation}/*`: a rota existe e está sob teste de contrato, mas
ainda não está registrada no `main.ts`. A T013 traz a implementação da `MdfeManifestRepositoryPort`,
cujo `listCandidateDocuments` precisa do join `cte_fiscal_documents → cte_batch_items →
nfe_documents → nfe_participants (role 'emitter'/'recipient') → nfe_addresses` — as tabelas de CT-e
não guardam município, ele vem da NF-e de origem.

### Resultados

```
bun test test/mdfe-application.contract.test.ts + mdfe-http   16 pass  0 fail  44 expects
bun test (suíte api completa)                                920 pass  1 skip  0 fail  4677 expects
bun run typecheck (4 apps)                                   sem erro
bun run lint (4 apps)                                        sem aviso
bun run format:check                                         sem pendência
```

## T013 — `POST /mdfe-manifests` + `GET /mdfe-manifests` + `GET /mdfe-manifests/:id`

### Vermelho antes do verde

Três suítes escritas antes da implementação:

- `test/mdfe-application/manifests.contract.ts` — 10 casos sobre `createMdfeManifestsUseCase` com
  repositório falso: congelamento de totais/municípios/tripulação, `companyId` e RNTRC vindos do
  contexto, veículo e condutores indisponíveis, UFFim ambígua, listagem e leitura.
- `test/mdfe-http/manifests.contract.ts` — rotas 201/200, `.strict()` rejeitando `companyId`,
  `rntrc`, `status` e `fiscalNumber` no corpo, filtros de listagem e `:id` inválido.
- `test/mdfe-infrastructure/manifest-query.contract.ts` — 11 casos compilando cada construtor de
  filtro com `PgDialect().sqlToQuery()` e afirmando `"<tabela>"."company_id" = $` mais os params.

O primeiro `bun test ./test/mdfe-infrastructure.contract.test.ts` falhou com
`Cannot find module '../../src/mdfe-manifests/infrastructure/mdfe-manifest.query.js'` — vermelho
registrado antes de existir infraestrutura. O entrypoint novo foi adicionado à lista explícita de
`apps/api-transportada/package.json`, senão não roda.

### O que os testes cobrem

Tenant-safety por construção: os filtros de listagem, leitura por id, itens, condutores, municípios,
candidatos a CT-e, manifesto vivo, veículo, condutores da frota e perfil fiscal são funções puras
exportadas e cada uma é compilada em SQL no teste. Nenhuma query do módulo monta `where` fora desses
construtores, então uma consulta sem `company_id` quebra o contrato.

### Decisões

**O RNTRC é congelado na criação, não aceito do cliente.** Vem de `company_fiscal_profiles.rntrc`
junto com o ambiente fiscal; o schema `.strict()` não tem a chave, então mandar `rntrc` no corpo é 400. Mesmo tratamento do `companyId`, que sai do contexto autenticado.

**Peso e valor da carga vêm da NF-e, não do CT-e.** As tabelas de CT-e não guardam totais nem
município: `listCandidateDocuments` junta `cte_fiscal_documents → cte_batch_items`, expande os
documentos do item por `cte_batch_item_documents`, soma `nfe_documents.total_value` (escala 2) e
`sum(nfe_volumes.gross_weight)` (escala 4) em `bigint`, e lê origem/descarga de
`nfe_participants` (`emitter`/`recipient`) → `nfe_addresses`. Documento sem totais volta `0`, o que
a política já bloqueia como `missingTotals`.

**Cancelamento em voo conta como cancelado.** Um CT-e com `cancellation_requested_at` preenchido é
devolvido com `status: 'cancelled'` mesmo que a coluna `status` ainda diga `authorized` — senão o
manifesto levaria um documento que está saindo do ar.

**A corrida pelo mesmo CT-e é resolvida no banco.** A escrita é uma transação só (cabeçalho → itens
→ condutores → municípios) e a unique parcial `mdfe_manifest_items_live_document_unique` é o árbitro:
violação vira `MDFE_MANIFEST_DOCUMENTS_BLOCKED` 422, não 500. A releitura do detalhe acontece dentro
da transação — ler pelo `this.database` não enxergaria as linhas ainda não commitadas.

**Helper de cursor virou compartilhado.** `fleet-cursor.support.ts` foi promovido a
`src/shared/keyset-cursor.support.ts` (`decodeKeysetCursor`/`encodeKeysetCursor`) e as duas
repositories de frota passaram a importá-lo — paginação keyset `desc(created_at), desc(id)` com
`limit + 1` é a mesma nos dois módulos e não vale duplicar.

**`previewManifest` depende só do que usa.** A dependência do caso de uso de prévia passou a ser
`Pick<MdfeManifestRepositoryPort, 'findFiscalSettings' | 'listCandidateDocuments'>`, então a fixture
da T012 não precisa fingir sete métodos para exercitar dois.

O `main.ts` passou a montar `DrizzleMdfeManifestRepository` + os dois casos de uso e registrar
`createMdfeManifestRoutes` — as rotas da T012 e da T013 só agora ficam de fato acessíveis.

### Resultados

```
bun test mdfe-application + mdfe-http + mdfe-infrastructure    38 pass  0 fail  115 expects
bun test (suíte api completa)                                 942 pass  1 skip  0 fail  4748 expects
make check (format:check + lint + typecheck + test + build)   verde nas 4 apps
```

## T014 — `POST /:id/issue`, `POST /:id/close`, `POST /:id/cancel`

### Vermelho antes do verde

- `test/mdfe-application/issuance.contract.ts` — 13 casos sobre `createMdfeIssuanceUseCase` com
  repositório falso: reserva de número na emissão, transição bloqueada por estado, janela de
  cancelamento, justificativa curta, replay por `Idempotency-Key`, chave reusada com corpo
  diferente e segunda tentativa de encerrar/cancelar com uma em voo.
- `test/mdfe-http/issuance.contract.ts` — 13 casos: 202 nas três rotas, `Idempotency-Key`
  obrigatório, `.strict()` recusando `companyId`/`fiscalNumber`/`fiscalEnvironment` no corpo,
  formato de município/UF de encerramento, justificativa mínima, 403 por permissão faltando
  (`mdfe.issue`, `mdfe.close`, `mdfe.cancel` são independentes), 404 para `:id` não-UUID e
  propagação de 409/422 do caso de uso.
- `test/mdfe-infrastructure/issuance-query.contract.ts` — 5 casos compilando cada construtor de
  filtro da emissão com `PgDialect().sqlToQuery()`.

O primeiro `bun test ./test/mdfe-http.contract.test.ts` falhou com
`Cannot find module '../../src/mdfe-manifests/presentation/mdfe-issuance.routes.js'`.

### Decisões

**A digital do pedido é função pura do request do cliente.** `createRequestFingerprint` recebe só
`action` + `idempotencyKey` + os campos do corpo — nunca `status` nem `version`. Misturar estado do
servidor faria a repetição de rede calcular uma digital diferente da gravada e devolver
`MDFE_IDEMPOTENCY_KEY_REUSED` num caso que é só retry. Retentar depois de uma rejeição da SEFAZ é o
cliente cunhar uma chave nova, o que também escapa da unique
`(company, manifest, kind, request_fingerprint)`.

**Só `issue` muda o status do manifesto no request.** `draft|rejected → issuing` acontece na mesma
transação da reserva do número. Encerrar e cancelar não mexem em `status`: os eventos 110112/110111
só valem depois do retorno da SEFAZ (ADR-0016 §10), então a rota grava a intenção em
`mdfe_fiscal_documents` (`closure_city_code`/`closure_state`, `cancellation_justification`/
`cancellation_requested_at`) e barra o pedido duplicado com `findPendingAttempt` →
`MDFE_MANIFEST_IN_FLIGHT` 409. O envelope do RabbitMQ carrega só identificadores; sem essa gravação
o worker não saberia para onde encerrar.

**`fiscal_sequences.model` passou a aceitar `mdfe`.** A check constraint era `in ('cte')`.
Migração `20260728162353_mdfe_fiscal_sequence_model` alarga; o rollback **recusa** rodar enquanto
existir sequência MDF-e — número fiscal já entregue à SEFAZ não se descarta em rollback. A primeira
emissão abre a sequência sozinha (`série 1`, `nextNumber 1`, `onConflictDoNothing`) em vez de exigir
parametrização nova em company-settings.

**`reservationId` é a linha do razão, não a da sequência.** `FiscalNumberReservation` expõe
`sequenceId`, mas `mdfe_issuance_attempts.reservation_id` referencia
`fiscal_sequence_reservations.id` — a linha é relida por `(company_id, reservation_key)` depois de
reservar, mesmo caminho da repository de CT-e.

**Filtros extraídos para `mdfe-issuance.query.ts`.** Cinco construtores puros
(`buildIssuanceStateFilters`, `buildAttemptIdempotencyFilters`, `buildOpenAttemptFilters`,
`buildFiscalDocumentFilters`, `buildReservationFilters`); nenhuma query da emissão monta `where`
fora deles, então `company_id` ausente quebra o contrato. Uma `Idempotency-Key` de outra empresa
nunca resolve.

### Resultados

```
bun test mdfe-application + mdfe-http + mdfe-infrastructure    80 pass  0 fail  270 expects
bun test (suíte api completa)                                 984 pass  1 skip  0 fail  4903 expects
bun run typecheck (api)                                       limpo
bun run lint (4 apps)                                         limpo
make migration-test (apply → rollback → reapply)               9 pass  0 fail  182 expects
```

## T015 — Trilho `mdfe-issuance.v1`, envelope e cópia do schema no worker

### Vermelho antes do verde

`test/mdfe-issuance-topology.contract.test.ts` e `test/mdfe-processing-envelope.contract.test.ts`
falharam com `Cannot find module` antes de existir `src/messaging/mdfe-rabbitmq-topology.ts` e
`src/messaging/mdfe-processing-envelope.schema.ts`. Do lado da API,
`test/mdfe-schema/issuance.contract.ts` falhou com
`Export named 'mdfeProcessedMessages' not found` antes da tabela existir.

### Decisões

**O trilho MDF-e é fisicamente separado do de CT-e.** `buildMdfeIssuanceRabbitMqTopology` reusa o
formato `${prefix}.<rota>.v1.{main,retry,dead}.{exchange,queue}` com `delayMs 5000` e
`maxRetries 3` iguais aos do CT-e, e um teste garante que nenhuma fila colide com a do CT-e —
misturar as duas faria uma rejeição de manifesto reprocessar um CT-e.

**O envelope carrega só identificadores.** `mdfeProcessingEnvelopeV1Schema` é `strictObject` em
todos os níveis: `type` restrito aos três `transportada.mdfe.manifest.{issue,close,cancel}.requested`,
`version` literal 1, `actorId`/`companyId`/`manifestId`/`attemptId` como UUID. Campo desconhecido no
payload é rejeitado — o worker reabre a linha do manifesto para montar o `MdfeData`, então mandar
dado fiscal pela fila só criaria uma segunda fonte de verdade.

**`mdfe_processed_messages` nasceu aqui.** A T008 modelou o outbox mas não o ledger de idempotência
do consumidor, e `processed_messages` tem FK para `processing_outbox(company_id, event_id)` — evento
MDF-e não existe lá. A tabela nova espelha `cte_processed_messages`, inclusive o comentário de que
**não** referencia o outbox de origem: foi exatamente essa FK que impediu o consumidor de CT-e de
gravar. Migração `20260728164350_mdfe_processed_messages`; o rollback recusa rodar com o ledger
populado, porque apagá-lo faz o consumidor reprocessar evento que já chegou na SEFAZ.

**A cópia do schema no worker é enxuta e por valor.** `src/database/mdfe-issuance-execution.schema.ts`
traz só as colunas que o trilho lê ou escreve (manifesto, condutores, itens, municípios de
carregamento, tentativas, eventos, documento fiscal e o veículo do payload); outbox e ledger ficam em
`src/database/processing.schema.ts`, ao lado dos do CT-e. `fleet_drivers` ficou de fora — nome e CPF
do condutor já estão desnormalizados em `mdfe_manifest_drivers`, congelados no momento da criação.

### Resultados

```
bun test mdfe-issuance-topology + mdfe-processing-envelope      11 pass  0 fail   12 expects
bun test (suíte worker completa)                               177 pass  0 fail  397 expects
bun test (suíte api completa)                                  986 pass  1 skip  0 fail  4912 expects
bun run typecheck (4 apps)                                     limpo
bun run lint (4 apps)                                          limpo
make migration-test (apply → rollback → reapply)                 9 pass  0 fail  182 expects
```

## T016 — Gateway MDF-e, resolvers de input e consumer do trilho `mdfe-issuance.v1`

### Vermelho antes do verde

`test/mdfe-fiscal-gateway.contract.test.ts` falhou com
`Cannot find module '../src/mdfe-issuance/infrastructure/mdfe-fiscal-gateway.js'`;
`test/mdfe-issuance-execution-input.contract.test.ts` e
`test/mdfe-issuance-worker.contract.test.ts` falharam do mesmo jeito para
`mdfe-issuance-execution-input-resolver.service.js` e `mdfe-issuance-consumer.effect.js`.
Na segunda fase, `test/mdfe-event-input.contract.test.ts` falhou com
`Cannot find module '../src/mdfe-issuance/application/mdfe-cancellation-input-resolver.service.js'`
(0 pass · 1 fail · 1 error) antes dos três resolvers de evento existirem.

### Decisões

**O gateway não importa o pacote fiscal.** `mdfe-fiscal-gateway.ts` declara localmente
`MdfeFiscalConfig`, `MdfeEmitResult` e as assinaturas `emit`/`close`/`cancel`, e recebe
`createProvider` por injeção. Isso mantém a regra de não importar `src/sefaz/*` do
`@adatechnology/fiscal-provider` e deixa o contract test rodar com um provider falso, sem rede,
sem certificado.

**O input de emissão vem da linha congelada, não da fila.** A API grava
`mdfe_issuance_payloads` (`payload` + `provider_config` + `payload_sha256`, migração
`20260728165555_mdfe_issuance_payloads`, único por `(company_id, attempt_id)`) dentro da mesma
transação que cria a tentativa. O worker lê por `(companyId, attemptId)`, faz `safeParse` do
`provider_config`, carrega o certificado ativo e só então decifra via
`secretService.decrypt({ purpose: 'mdfe' })`. Config incompleta vira
`MdfeIssuanceFatalError('persisted MDF-e provider config is incomplete')` — dead-letter, não retry:
reprocessar não conserta dado congelado errado.

**A data de encerramento é derivada de `occurredAt` em Brasília.** A API não persiste data de
encerramento — `recordClosureRequest` guarda só `closureCityCode` e `closureState`. O resolver
converte `envelope.occurredAt` para `America/Sao_Paulo` com
`Intl.DateTimeFormat('en-CA', { timeZone: FISCAL_TIME_ZONE })`. É determinístico entre
redelivery (mesmo envelope → mesma data) e bate com o fuso que a SEFAZ espera; usar o relógio do
worker daria data diferente a cada tentativa e, em container UTC, dia errado depois das 21h.

**Encerramento e cancelamento resolvem o alvo pelo documento autorizado.**
`DrizzleMdfeEventTargetRepository` lê `mdfe_fiscal_documents` por `(companyId, manifestId)`;
sem documento autorizado o resolver devolve `null` e o efeito registra a tentativa como pendente em
vez de chamar a SEFAZ com chave vazia. Cidade/UF ausente e justificativa com menos de 15 caracteres
são fatais na aplicação, antes da rede — o pacote fiscal rejeitaria com `INVALID_JUSTIFICATIVA`
depois de já ter aberto conexão.

**A política de retry reusa as colunas do CT-e.** `company_fiscal_profiles` só tem
`cte_retry_max_attempts` / `cte_retry_backoff_seconds`; MDF-e vai para a mesma SEFAZ na mesma
janela operacional, então `DrizzleMdfeRetryPolicyRepository` lê essas colunas em vez de abrir uma
migração de configuração fora do escopo desta task. Está comentado no código.

**Dead-letter só devolve o manifesto para `rejected` quando a tentativa era de emissão.**
`recordFailed` lê o `attempt_kind` antes de escrever: `issue` volta o manifesto para `rejected`
(estado que `checkIssue` aceita, permitindo nova tentativa manual); `close` e `cancel` deixam o
manifesto `authorized`, porque a falha do evento não desautoriza o que a SEFAZ já autorizou.

**`stored_objects` ganhou o propósito `mdfe_document`.** Migração
`20260728172757_mdfe_document_storage_purpose` só troca o CHECK; o rollback documenta que ele
falha se já houver linha com esse propósito. Storage é create-only: o XML autorizado e os XMLs de
evento entram por `storeAuthorizedXml`/`storeEventXml` e nunca são sobrescritos.

**Sem `createProvider` no `main.ts` — de propósito.** O
`@adatechnology/fiscal-provider` 0.3.0-rc.2 instalado não expõe MDF-e (o `dist/` não tem nenhuma
referência). O trilho está inteiramente montado (topology, publisher, relay, consumer, resolvers,
write-back, storage), mas o efeito é construído sem `createProvider`; nesse caso o guard
`if (executionInput === null || gateway === null)` apenas registra a tentativa como pendente e faz
ack. Nada de emissão inventada — quando o pacote publicar MDF-e, entra só a factory.

### Resultados

```
bun test mdfe-fiscal-gateway + mdfe-issuance-execution-input
       + mdfe-event-input + mdfe-issuance-worker                 32 pass  0 fail   65 expects
bun test (suíte worker completa)                                209 pass  0 fail  462 expects
bun test (suíte api completa)                                   991 pass  1 skip  0 fail
bun run typecheck (4 apps)                                      limpo
bun run lint (4 apps)                                           limpo
bun run format:check                                            limpo
```

## T017 — Página de manifestos MDF-e (frontend)

### Comandos

```bash
bun run --cwd apps/frontend-transportada test   # 195 pass · 0 fail · 1171 expects
bun run --cwd apps/frontend-transportada test test/mdfe-manifest.contract.test.ts
                                                #  19 pass · 0 fail ·  139 expects
bun run --cwd apps/frontend-transportada lint       # limpo
bun run --cwd apps/frontend-transportada typecheck  # limpo
bun run format                                       # limpo
```

### O que entrou

Módulo `apps/frontend-transportada/src/modules/mdfe-manifest/` completo:

- `shared/` — `mdfeManifestClient.service.ts` (um client HTTP do módulo, `fetch` injetado),
  `mdfeManifestResponse.validation.ts` + `mdfeManifestGuards.validation.ts` (type guards manuais,
  sem zod), `mdfeManifestTable.service.ts` e `mdfeManifestAdvancedFilter.service.ts` (ordenação,
  filtros simples e grupos E/OU aninhados), `mdfeManifestActions.service.ts` (gate por status +
  validação de encerramento e justificativa), `mdfeManifestForm.service.ts` (validação do rascunho
  e montagem do body), `mdfeManifestCteSource.service.ts` (fonte de CT-es elegíveis).
- `hooks/` — `useMdfeManifests` (query + 5 mutations), `useMdfeManifestTable` (máquina de estado da
  tabela), `useMdfeManifestCreation` (lote → candidatos → rascunho), `useMdfeManifestActionForm`
  (diálogo de transmitir/encerrar/cancelar).
- `components/` — `MdfeManifestTable`, `MdfeManifestFilters`,
  `MdfeManifestAdvancedFilterBuilder`, `MdfeManifestColumnsMenu`, `MdfeManifestCreationPanel`,
  `MdfeManifestActionsPanel`.
- `pages/MdfeManifestWorkspace.page.tsx` + registro da navegação em `src/main.tsx`
  (rota `/mdfe-manifests`, grupo fiscal, ícone, `sessionStorage`).
- `locales/mdfeManifest.locale.json` e `mdfeManifest.en.locale.json` (PT/EN, sem string solta).

### Decisões

**Os CT-es elegíveis vêm de `/cte-batches`, não de um endpoint novo.** `POST /mdfe-manifests`
recebe `documentIds` que são `cte_fiscal_documents.id`, e o frontend não tinha como enumerá-los —
a listagem de lotes só expunha o id do item. Em vez de criar um endpoint de busca de documentos
fiscais fora do escopo desta feature, `fiscalDocumentId` foi exposto ponta a ponta
(repositório → port → serializer da rota → tipo do frontend → validação) e o painel de criação
lista `GET /cte-batches` → `GET /cte-batches/:id/items` filtrando
`status === 'authorized' && fiscalDocumentId !== null`. A elegibilidade real continua sendo
decidida no servidor: `POST /mdfe-manifests/preview` devolve `blocked[]` e a criação rejeita o que
não puder entrar. O cliente escolhe candidatos; ele não decide.

**Gate de ação = permissão × status.** `canIssue`/`canClose`/`canCancel` por linha combinam a
permissão do `auth/me` (`mdfe.issue`, `mdfe.close`, `mdfe.cancel`) com
`resolveManifestActions(status)`. Sem `mdfe.manage` o painel de criação vira aviso somente-leitura;
sem `mdfe.read` a página inteira responde `forbidden`. As cinco permissões já estavam na allowlist
de `useAuthMe.query.ts`.

**Tabela segue `docs/frontend/data-tables.md`.** Ordenação asc→desc→neutro no cabeçalho, filtros
multi-valor por status, filtro simples e avançado com grupos E/OU aninhados
(`MDFE_MANIFEST_OPERATORS_BY_TYPE`), seleção por linha + selecionar-todos com barra de ações em
massa, "limpar filtros" condicional, contador de resultados, zebra via CSS Module e reordenação /
visibilidade de colunas persistidas em `localStorage` sob chave versionada com leitura SSR-safe.
Toda a máquina de estado vive em `useMdfeManifestTable.hook.ts` — os componentes só renderizam.

**Idempotência no cliente.** Transmitir, encerrar e cancelar geram `crypto.randomUUID()` como
`idempotencyKey` no momento do clique, igual ao que já é feito em `useCteBatchWorkspace` e
`useCteProfiles`. Reenvio do mesmo diálogo não duplica evento.

**Namespaces de i18n separados para diálogo e formulário.** `issue.*` já era o escopo do diálogo de
transmissão; a validação do formulário de criação ganhou o bloco `formIssue.*`, e o mapa
`LOCALE_SCOPE_BY_KIND` traduz `issue|close|cancel` para `issue|closure|cancellation`.

### Testes de contrato

`test/mdfe-manifest/client-and-queries.contract.ts` — o client monta rota, método, corpo e
`Idempotency-Key` de cada uma das seis chamadas, propaga o token, e as validações rejeitam payload
malformado. `test/mdfe-manifest/table-and-actions.contract.ts` — ordenação, filtros simples e
avançados, seleção, preferências de coluna, gate de ação por status e validação de encerramento e
justificativa. Ambos já estão declarados na lista explícita do `package.json` via
`test/mdfe-manifest.contract.test.ts`.

## T018 — Fechamento da feature

### Comandos

```bash
make check            # format:check + lint + typecheck + test + build — verde nas 4 apps
make migration-test   # migration + rollback em Postgres descartável — 9 pass · 0 fail · 182 expects
```

Detalhe do `make check`:

```
api-transportada      991 pass · 1 skip · 0 fail
worker-transportada   209 pass · 0 fail ·  462 expects  (34 arquivos)
cron-transportada      24 pass · 0 fail ·   47 expects
frontend-transportada 195 pass · 0 fail · 1171 expects  (12 arquivos)
format:check / lint / typecheck   limpos nas 4 apps
build                 api 0.75 MB · worker 220.95 KB · cron 22.34 KB · frontend 703.81 KB (gzip 200.65 KB) + PWA
```

O aviso de chunk >500 kB do Vite é pré-existente ao módulo MDF-e — o bundle já passava do limite
antes desta feature e não há code splitting por rota (a navegação é manual em `src/main.tsx`).

### Encerramento da T026 da feature 012

`specs/012-cte-emission-from-selection/tasks.md` T026 foi marcada como concluída apontando para esta
feature. O que estava bloqueado lá — modelagem do manifesto no TMS, vínculo N:1 com os CT-es e os
eventos de encerramento (110112) e cancelamento (110111) — foi entregue aqui sob a ADR-0016.

### O que fica pendente e por quê

**Emissão real na SEFAZ depende da publicação do pacote fiscal.** O trilho está completo de ponta a
ponta (rota → outbox → relay → fila → consumer → gateway → write-back → storage), mas o efeito é
montado sem `createProvider`: o `@adatechnology/fiscal-provider` 0.3.0-rc.2 instalado não expõe MDF-e
no `dist/`. Com o gateway nulo a tentativa é registrada como pendente e a mensagem recebe ack — nada
é inventado e nada vai para a rede. Publicar o pacote é ação externa e precisa de aprovação explícita;
até lá, a única mudança necessária é adicionar a factory no `main.ts` do worker.

**Configuração de retry do MDF-e reusa as colunas do CT-e.** `company_fiscal_profiles` não ganhou
colunas próprias (`mdfe_retry_*`); está comentado no código e é reversível com uma migração aditiva
quando as janelas operacionais divergirem.

**Fora do escopo, já registrado antes desta feature:** `activeCertificate: null` fixo em
`serializeSettings()`, `POST /cte-batches` respondendo `itemCount: 0` e a validação de formato do
RNTRC (8 dígitos).

---

## Homologação SEFAZ do MDF-e — o que foi provado e onde parou

Registrado depois do fechamento da T018, ao verificar por que o MDF-e nunca tinha tocado a SEFAZ.

### Diagnóstico

O MDF-e existia só como código não commitado no `adatechnology-packages` (5 fontes + 2 testes de
contrato, todos `??` no `git status`), e os testes de contrato substituem `globalThis.fetch` — nenhum
deles abre conexão. Não havia script de homologação: o `scripts/test-fiscal.ts` tinha `--cte`, `--nfe`,
`--nfce`, `--nfse`, `--sat`, mas nada de MDF-e. O CT-e foi autorizado de verdade na SEFAZ SP
(commit `d9ec4c1` no repo do pacote); o MDF-e nunca.

### Harness criado

`bun run test:mdfe` no `@adatechnology/fiscal-provider`, cobrindo build → assinatura → rede:

```
── MDF-e 3.00 — build + assinatura (local) ──
  ✓ buildMdfeXml gera XML            ✓ chave 44 dígitos
  ✓ raiz é <MDFe>                    ✓ mod=58 no XML
  ✓ elemento <infMDFe>               ✓ versaoModal presente
  ✓ signMdfeXml assina infMDFe       ✓ referência aponta para a chave

── MDF-e 3.00 — SVRS homologação (autorizador nacional único) ──
  ✗ SVRS MDF-e homologação cStat 107 — SEFAZ MDF-e retornou HTTP 403 …
  ○ emissão MDF-e (pulado: testConnection falhou)
  ○ encerramento MDF-e (pulado: testConnection falhou)

  ✓ 24 passou    ✗ 1 falhou    ○ 15 pulado
```

Está provado até a parede da credencial: o XML é montado, a chave tem 44 dígitos, o `mod=58` e o
`versaoModal` saem corretos, a assinatura XML-DSig é real (referência `URI="#MDFe<chave>"`), o
endpoint da SVRS responde e o envelope SOAP chega. O 403 é o handshake mTLS recusando o certificado
autoassinado de teste — não é defeito do código.

### Defeito real encontrado no caminho

`sendMdfeStatusServico` parseava a resposta sem checar `response.ok`, então o 403 (corpo HTML do IIS)
virava `SEFAZ MDF-e fora do ar []:` — cStat vazio e culpado errado. `sendMdfeAutorizacao` e
`sendMdfeEvento`, no mesmo arquivo, já cortavam em `!response.ok`. Corrigido por consistência.

### Commits no `adatechnology-packages` (branch `fix/preview-silent-auth-failure`)

```
31149ad feat(fiscal-provider): MDF-e 3.00 direto na SVRS
a9b30af feat(fiscal-provider): cancel do CT-e devolve o procEventoCTe
```

Ambos com changeset. `check` limpo e 104 pass / 0 fail / 348 expects nos dois; o intermediário foi
typecheckado isolado em worktree para não quebrar bisect. **Nada publicado no npm.**

### Autorização real na SVRS

O certificado A1 credenciado estava disponível localmente (caso AFR FERNANDES, uma transportadora
real — emitente correto para MDF-e). Com ele o 403 sumiu e a SVRS passou a avaliar o conteúdo.

Antes do manifesto, um **CT-e foi autorizado de verdade** na SEFAZ SP homologação para servir de
documento manifestado: chave `35260761156864000191570010000009011071694979`, protocolo
`135260001963103`.

**MDF-e autorizado**, com encerramento aceito na sequência:

```
── MDF-e 3.00 — SVRS homologação (autorizador nacional único) ──
  ✓ SVRS MDF-e homologação cStat 107 — Servico em Operacao
  ✓ MDF-e autorizado na SVRS
    chave:     35260761156864000191580010000009081070609328
    protocolo: 935260000051874
  ✓ devolve xmlAutorizado (mdfeProc)
  ✓ encerramento (110112) aceito — protocolo 935260000051875

  ✓ 28 passou    ✗ 0 falhou    ○ 13 pulado
```

### Defeitos que só a SVRS revelou

Cada rejeição virou teste de contrato **antes** da correção, e o teste foi visto falhando primeiro:

| cStat | Rejeição            | Causa                                                                                                              |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 215   | Falha no schema     | `consStatServMDFe` não leva `cUF` — a NF-e e o CT-e levam; o MDF-e não, porque a SVRS autoriza para o país inteiro |
| 215   | `TString` inválida  | travessão U+2014 no `infCpl` — o campo só aceita Latin-1 (defeito do harness, não do pacote)                       |
| 745   | `tpTransp` indevido | só entra quando o veículo de tração tem `prop` declarado (defeito do harness)                                      |
| 698   | Seguro ausente      | seguro de carga é obrigatório para `tpEmit='1'` rodoviário                                                         |
| 578   | Contratante ausente | `infContratante` dentro do `infANTT`, depois do `RNTRC` — grupo não existia no builder                             |
| 726   | Lotação ausente     | `infLotacao` dentro do `prodPred`, depois do `NCM` — grupo não existia                                             |
| 302   | Pagamento ausente   | `infPag` fechando o `infANTT` — grupo não existia                                                                  |
| 580   | `infPag` incompleto | `infBanc` é obrigatório mesmo à vista                                                                              |

Quatro deles são defeito do pacote (`cUF`, `infContratante`, `infLotacao`, `infPag`); os outros
eram dados de teste errados.

### Commit da rodada de homologação

```
0fcdacc feat(fiscal-provider): MDF-e autoriza na SVRS com lotação, contratante e pagamento
```

Com changeset. `check` limpo, 111 pass / 0 fail / 356 expects, `build` ok. **Nada publicado no npm** —
publicar `0.3.0-rc.3` é ação externa e precisa de aprovação explícita.

### Consequência para a transportada

O módulo `mdfe-manifest` da API não modela seguro, contratantes, pagamento nem lotação. Sem esses
campos o manifesto não autoriza em carga lotação — é lacuna a fechar antes de ligar o
`createProvider` de MDF-e no worker.

## T019–T022 — Carga lotação, contratante, pagamento e seguro na transportada

Fase aberta pela homologação na SVRS: as rejeições `726`, `578`, `302`, `580` e `698` provaram que o
módulo `mdfe-manifest` não tinha onde guardar seguro, contratante, pagamento nem lotação. Cada task
começou por um teste vermelho — fixture estendida primeiro, falha observada, implementação depois.

### T019 — Persistência

Migration `20260728201709_mdfe_lotacao_contratante_pagamento_seguro`, com `rollback.sql` ao lado.

| tabela                    | colunas novas                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `company_fiscal_profiles` | `mdfe_insurance_responsibility`, `mdfe_insurer_name`, `mdfe_insurer_tax_id`, `mdfe_insurance_policy`, `mdfe_payment_bank_code`, `mdfe_payment_bank_branch`, `mdfe_payment_pix_key` |
| `mdfe_manifests`          | `contractor_tax_id`, `contractor_name`, `freight_value` (`numeric(15,2)`), `loading_postal_code`, `discharge_postal_code`, `insurance_endorsement`                                 |

Check constraints: responsabilidade do seguro só aceita vazio, `'1'` (emitente do MDF-e) ou `'2'`
(contratante do serviço); CNPJ/CPF do contratante e da seguradora só aceitam 11 ou 14 dígitos; CEPs
só aceitam 8 dígitos; `freight_value >= 0`. Tudo com default vazio para não quebrar linha existente,
e o rollback documenta que é destrutivo.

Dinheiro segue `numeric` — o frete nunca passa por float binário em nenhuma camada.

### T020 — Configurações da empresa

`GET`/`PATCH /companies/settings` passaram a carregar o bloco `mdfe`. Trava otimista preservada
(`expectedVersion`), auditoria continua sem gravar dado sensível. O CNPJ/CPF da seguradora e o código
do banco são validados no Zod da borda, não no domínio.

### T021 — Builder do payload

| grupo            | onde entra                                          | rejeição que fecha |
| ---------------- | --------------------------------------------------- | ------------------ |
| `infContratante` | dentro do `infANTT`, depois do `RNTRC`              | 578                |
| `infLotacao`     | dentro do `prodPred`, depois do `NCM`               | 726                |
| `infPag`         | fechando o `infANTT`, pagador ∈ contratantes        | 302                |
| `infBanc`        | dentro do `infPag`, PIX ou banco+agência            | 580                |
| `seg`            | seguro da carga com apólice, seguradora e averbação | 698                |

Cada grupo só é emitido quando está configurado — a lotação exige os dois CEPs, o pagamento exige
contratante e frete > 0, o seguro exige responsável + seguradora + apólice. Isso é deliberado:
o gatilho legal exato de "carga lotação" não está documentado no pacote fiscal e o repositório proíbe
inventar regra legal. Parcelamento (`indPag=1` + `infPrazo`) não é modelado — pagamento é sempre à
vista.

### T022 — Frontend

Dois blocos novos: "Seguro e pagamento do MDF-e" nas configurações da empresa e "Carga lotação" na
criação do manifesto, ambos com i18n PT/EN.

**Defeito real encontrado no caminho:** a allowlist de resposta do `mdfe-manifest`
(`MANIFEST_SUMMARY_KEYS` + `isSummary`) já estava seis campos atrás da API. Com `hasExactKeys`
estrito, toda resposta 200 real seria recusada e a tela mostraria "Indisponível" — a suíte seguia
verde só porque a fixture estava velha. As duas allowlists (`company-settings` e `mdfe-manifest`)
agora estão alinhadas com os serializadores da API.

O valor do frete é normalizado para duas casas por regex sobre string (`toAmount`), nunca por
`Number`, atendendo ao `DECIMAL_AMOUNT` da API sem tocar em float binário.

### Resultados

```
make migration-test                    9 pass  0 fail  (182 expects) — migration + rollback
make check                             format:check · lint · typecheck · test · build — tudo verde
  api-transportada                  1005 pass  0 fail  (58 arquivos)
  worker-transportada                209 pass  0 fail  (34 arquivos)
  cron-transportada                   24 pass  0 fail  (2 arquivos)
  frontend-transportada              196 pass  0 fail  (12 arquivos)
```

### Pendências externas — T023 e T024

O worker ainda **não** fala com a SEFAZ para MDF-e: a `@adatechnology/fiscal-provider@0.3.0-rc.2`
instalada não exporta nenhum símbolo de MDF-e. Publicar a `0.3.0-rc.3` exige `npm login` do usuário,
é ação externa e depende de aprovação explícita. Só depois disso a fábrica
`adatechnology-mdfe-fiscal-provider.factory.ts` e a injeção de `createProvider` em
`createMdfeIssuanceWorkerEffect` fazem sentido.

## T025 — Pendências herdadas fechadas

Três lacunas que eu já tinha listado e estavam abertas fora do escopo original da 013. Todas
seguiram o mesmo rito: teste vermelho primeiro, correção depois.

### `activeCertificate` sempre `null` em `GET /companies/settings`

O campo era serializado fixo em `null` e nunca era preenchido — mentira no contrato. O certificado
ativo já vem de `GET /companies/digital-certificates`, que exige a **mesma** permissão
(`settings.manage`) e que o frontend sempre consulta. O campo saiu da resposta, do tipo e do guard
`isSettingsResponse`; o view-model passou a resolver o certificado só pela lista. Nenhuma tela mudou
de comportamento.

### `POST /cte-batches` respondendo `itemCount: 0`

Defeito real: `createBatch` insere a linha do lote **antes** dos itens, então o repositório devolve
`itemCount = 0` e o 201 anunciava um lote vazio mesmo tendo persistido N itens — a tela só mostrava
o número certo depois de um refetch. O duble de teste escondia isso porque devolvia a contagem final.
Agora o duble espelha o repositório real (`itemCount: 0`) e o serviço devolve
`{ ...batch, itemCount: projections.length }` depois de gravar as projeções.

### RNTRC sem validação de formato

`company_fiscal_profiles.rntrc` aceitava qualquer texto de 1 a 20 caracteres, mas
`mdfe_manifests.rntrc` e `fleet_vehicles.owner_rntrc` já tinham check `^[0-9]{8}$`. Um perfil salvo
com `RNTRC-123` passava no `PATCH` e só estourava depois, com 500, na criação do manifesto que copia
o RNTRC do perfil. O Zod da borda passou a exigir 8 dígitos e o campo do frontend virou numérico com
`maxLength` 8. O padrão não foi inventado — já estava nas duas constraints do próprio repositório.

```
make check     exit 0 — format:check · lint · typecheck · test · build
  api-transportada     1008 pass  0 fail
  worker-transportada   209 pass  0 fail
  cron-transportada      24 pass  0 fail
  frontend-transportada 196 pass  0 fail
```

## T023 — `@adatechnology/fiscal-provider@0.3.0-rc.3` publicado e consumido

O `0.3.0-rc.3` saiu do merge do PR #4 do `adatechnology-packages` (`779934d` em `main`), que consumiu
quatro changesets pendentes: MDF-e 3.00 (emissão/encerramento/cancelamento), grupos exigidos pela SVRS
em carga lotação, `procEventoCTe` no `cancel` de CT-e e escape de texto livre no XML. O workflow
`publish.yml` (run `30407905694`, success) rodou `changeset version` em modo pre/rc e publicou.

```
npm view @adatechnology/fiscal-provider dist-tags
  { latest: '0.2.0', rc: '0.3.0-rc.3' }
```

Dependência subida de `0.3.0-rc.2` para `0.3.0-rc.3` em `apps/api-transportada/package.json` e
`apps/worker-transportada/package.json`, com `bun.lock` regravado pelo `bun install`. Os três
contratos que fixam a versão auditada acompanharam o bump — foram eles que quebraram o `make check` e
denunciaram a divergência, que é exatamente o serviço que prestam:
`apps/api-transportada/test/certificate-validation-gateway.contract.test.ts`,
`apps/worker-transportada/test/environment.contract.test.ts` e
`apps/worker-transportada/test/nfe-distribution/gateway.contract.ts`.

## T024 — `createProvider` de MDF-e ligado no worker

Contrato antes da implementação: dois testes novos em
`apps/worker-transportada/test/mdfe-fiscal-gateway.contract.test.ts` — um exige que a fábrica seja o
único ponto que toca o pacote fiscal, o outro exige a injeção real dentro do
`createMdfeIssuanceWorkerEffect` do `main.ts`. Ambos falharam pelo motivo certo (`ENOENT` na fábrica
inexistente e ausência de `createAdatechnologyMdfeFiscalProvider` no `main.ts`) antes do código
existir.

### Por que a fábrica de MDF-e não espelha a de CT-e

A task pedia espelhar `adatechnology-cte-fiscal-provider.factory.ts`, que usa `createFiscalProvider`.
Isso não compila para MDF-e: `createFiscalProvider` é declarado como `(config: FiscalConfig) =>
FiscalProvider`, e `FiscalProvider` só tem `emit`, `cancel` e `testConnection`. O evento **110112**
(encerramento) existe apenas no tipo da classe `SefazMdfeProvider`, e sem encerramento o MDF-e aberto
trava a emissão do próximo. O `tsc` recusou o cast com `TS2352 — neither type sufficiently overlaps`,
que aqui é diagnóstico correto e não ruído. A fábrica instancia `SefazMdfeProvider` direto; a classe é
export de raiz do pacote, então a regra de não importar `src/sefaz/*` continua respeitada, e o teste
de isolamento passou a fixar `SefazMdfeProvider` em vez de `createFiscalProvider`.

Conferido campo a campo contra o `dist/types.d.ts` do pacote instalado, porque o cast apaga a
checagem: `emit` recebe `mdfeData`/`referenceId`/`items`/`payments`/`totalAmount`/`discountAmount`;
`close` recebe `chaveAcesso`/`protocolo`/`dataEncerramento`/`ufEncerramento`/
`codigoMunicipioEncerramento`; `cancel` recebe `chaveAcesso`/`protocolo`/`justificativa`; o
`FiscalResult` devolve `chaveAcesso`/`protocolo`/`xmlAutorizado`/`xmlEvento`/`errorCode`/
`errorMessage`. Todos batem com o que `mdfe-fiscal-gateway.ts` já enviava e mapeava.
`MdfeProviderConfig` satisfaz `MdfeConfig` — a única diferença é `crt` alargado de `'1'|'2'|'3'` para
`string`, mesmo motivo do cast na fábrica de CT-e.

O comentário do `main.ts` que dizia "o pacote fiscal ainda não expõe MDF-e" saiu junto com o
`createProvider` ausente: a partir daqui o efeito emite de verdade em vez de gravar tentativa
pendente.

```
bun test ./test/mdfe-fiscal-gateway.contract.test.ts     8 pass  0 fail

make check     exit 0 — format:check · lint · typecheck · test · build
  api-transportada     1008 pass  0 fail
  worker-transportada   211 pass  0 fail
  cron-transportada      24 pass  0 fail
  frontend-transportada 196 pass  0 fail
```

⚠️ Nenhuma emissão real de MDF-e na SEFAZ foi executada aqui — o que está provado é o wiring e a
aderência de contrato ao pacote, não a resposta da SVRS.
