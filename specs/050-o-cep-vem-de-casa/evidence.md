# Evidência — 050 O CEP vem de casa

## T1.1 — `addresses.read`

Contrato escrito antes da implementação, vermelho primeiro:

```
$ bun test test/authorization.contract.test.ts
(fail) authorization contract > grants the address lookup to the roles that can write an address
(fail) authorization contract > defines the complete conservative permission matrix for every company role
(fail) authorization contract > unions local roles into an immutable permission set without platform access
 13 pass · 3 fail
```

Depois da implementação em `identity/domain/authorization.policy.ts`:

```
$ bun test test/authorization.contract.test.ts
 16 pass · 0 fail · 109 expect() calls
```

A permissão entra na lista servida pelo `/auth/me`, então quatro suítes que enumeram o vocabulário
acompanharam: `tenant-context.contract.test.ts`, `auth-me.contract.test.ts`,
`integration/auth-me.integration.ts` (só o braço do `fiscal` — o do `viewer` não recebe a permissão)
e, no frontend, `frontend-contract.test.ts` com a cópia por valor de `useAuthMe.query.ts`.

Gate:

```
$ bun run --cwd apps/api-transportada test
 2754 pass · 15 skip · 0 fail · 11305 expect() calls

$ bun run --cwd apps/frontend-transportada test
 1622 pass · 0 fail · 10374 expect() calls

$ bun run typecheck   # quatro apps, limpo
$ bun run lint        # quatro apps, limpo
```

Sem mudança em `realm/transportada-local-realm.json`: o realm declara **papéis**, e a expansão para
permissões é código.

## T2.1 — domínio da sugestão

Contrato escrito antes da implementação, vermelho primeiro (o módulo nem existia):

```
$ bun test ./test/addresses-domain.contract.test.ts
error: Cannot find module '../../src/addresses/domain/postal-code.error.js'
 0 pass · 1 fail · 1 error
```

Depois de `postal-code.error.ts` e `postal-code-suggestion.policy.ts`:

```
$ bun test ./test/addresses-domain.contract.test.ts
 8 pass · 0 fail · 22 expect() calls

$ bunx tsc --noEmit      # exit=0
$ bunx eslint src/addresses test/addresses-domain … --max-warnings=0   # exit=0
```

O que o contrato congelou, e por quê:

- `PostalCodeSuggestion` **não tem** `number` nem `complement` — a ausência é do tipo, não do
  mapper, e o teste afirma o conjunto de chaves para que um `select` generoso no repositório não
  reabra o vazamento.
- Desempate em duas etapas dentro de uma origem: linha **com** logradouro vence linha sem, e só
  então a mais recente vence. Sem a primeira metade, uma linha de MDF-e gravada ontem (só UF)
  apagaria a rua que a nota trouxe no mês passado.
- `isCompletePostalCodeSuggestion` é o que impede a parcial de encerrar a escada: só UF responde
  `false`, e a BrasilAPI continua sendo consultada.
- `parsePostalCode` come `.`, `-`, `/` e espaço e recusa `1402021O` — oito **dígitos**, não oito
  caracteres.

`./test/addresses-domain.contract.test.ts` acrescentado à lista explícita do `test` no
`package.json` da api (entre `fuel-catalog` e `fleet-domain`) — suíte fora dessa lista não roda.

## T3.0 — índice por CEP nas quatro origens

Contrato antes da migration, vermelho primeiro (o diretório não existia):

```
$ bun test ./test/database-migration.contract.test.ts
(fail) Drizzle migrations > versions one postal code index per address origin, partial where the
       column admits empty
  expect(received).toBeString()  ·  Received: undefined
 45 pass · 1 fail
```

Depois dos cinco índices no schema Drizzle e da migration gerada
(`20260821212505_addresses_postal_code_index`):

```
$ bun run db:generate --name addresses_postal_code_index
{"status":"ok","migration_path":"drizzle/20260821212505_addresses_postal_code_index/migration.sql"}

$ bun test ./test/database-migration.contract.test.ts
 46 pass · 4 skip · 0 fail · 590 expect() calls

$ bun run db:check          # Everything's fine
$ make migration-test       # 78 pass · 0 fail (exit 0)
$ bun run --cwd apps/api-transportada test
 2775 pass · 15 skip · 0 fail · 11396 expect() calls
$ bunx tsc --noEmit         # exit=0
$ bunx eslint src test      # exit=0
```

Cinco índices, um por coluna de CEP, e o `where` de cada um sai da coluna, não de gosto:

| Índice                                             | Recorte                                                 |
| -------------------------------------------------- | ------------------------------------------------------- |
| `nfe_addresses_company_postal_code_idx`            | `where "postal_code" is not null` — a coluna é nullable |
| `fleet_drivers_company_postal_code_idx`            | `where length(...) > 0` — notNull com default `''`      |
| `company_fiscal_profiles_company_postal_code_idx`  | sem `where` — notNull sem vazio possível                |
| `mdfe_manifests_company_loading_postal_code_idx`   | `where length(...) > 0`                                 |
| `mdfe_manifests_company_discharge_postal_code_idx` | `where length(...) > 0`                                 |

A migration é aditiva (o contrato recusa `drop`, `delete` e `truncate` nela) e o `rollback.sql`
derruba os cinco por nome, sem `CASCADE`, com a exclusão guardada do registro no journal. Índice é
derivado da tabela: o rollback não perde dado nenhum — devolve a varredura completa.

⚠️ A asserção nasceu esperando `USING btree (...)` e a coluna qualificada pela tabela no `where`; o
gerador desta versão do Drizzle Kit emite `("company_id","postal_code")` e `"postal_code" is not
null`. Quem manda é a saída do gerador — a asserção foi corrigida para ela, não o contrário.

## T3.2 — cinco origens em corrida, cada uma com o `company_id` no `where`

Contrato antes da implementação (`test/addresses-schema/tenant-safety.contract.ts` +
`test/addresses-schema.contract.test.ts`, registrado na lista explícita do `package.json`):

```
$ bun test ./test/addresses-schema.contract.test.ts
error: Cannot find module '../../src/addresses/infrastructure/drizzle-postal-code.repository.js'
 0 pass · 1 fail · 1 error
```

Depois de `src/addresses/application/postal-code.port.ts` e
`src/addresses/infrastructure/drizzle-postal-code.repository.ts`:

```
$ bun test ./test/addresses-schema.contract.test.ts
 11 pass · 0 fail · 37 expect() calls
$ bun run --cwd apps/api-transportada test
 2786 pass · 15 skip · 0 fail · 11433 expect() calls   # 2775 antes desta task
$ bunx tsc --noEmit           # exit=0
$ bunx eslint src test        # exit=0
$ bun run format:check        # All matched files use Prettier code style!
```

O isolamento é afirmado sem banco, pelo mesmo arreio dos outros contratos de tenant
(`new PgDialect().sqlToQuery(and(...filters)!)`, como em
`test/cte-issuance-schema/retry-query-tenant-safety.contract.ts`): a repository publica
`POSTAL_CODE_ORIGINS`, e cada origem publica o seu `buildFilters`. Um caso por origem — as duas
colunas do MDF-e contam separado — mais o caso cruzado que roda **todas**: o mesmo CEP em duas
empresas gera SQL idêntico e parâmetros diferentes.

| Origem                 | Coluna de CEP           | O que ela sabe responder                       |
| ---------------------- | ----------------------- | ---------------------------------------------- |
| `nfeAddress`           | `postal_code`           | tudo, com `coalesce` — as colunas são nullable |
| `companyFiscalProfile` | `postal_code`           | tudo, `notNull`                                |
| `fleetDriver`          | `postal_code`           | tudo, `notNull` com default `''`               |
| `mdfeLoading`          | `loading_postal_code`   | **só a UF** (`origin_state`)                   |
| `mdfeDischarge`        | `discharge_postal_code` | **só a UF** (`destination_state`)              |

Três decisões que ficam escritas para não serem redescobertas:

- **`Promise.race` cru é o erro a evitar**, e é por isso que a corrida é um resolver explícito
  (`raceCompleteSuggestion`): `race` entrega o primeiro a **terminar**, e a origem mais rápida
  costuma ser justamente a que não achou nada. Aqui vence a primeira sugestão **completa**; as
  parciais ficam de lado e só respondem quando nenhuma origem soube o endereço inteiro — o
  manifesto, que só tem UF, nunca ganha de uma nota com logradouro.
- **Consulta que falha rejeita**, não devolve `null`. `Promise.any` deixaria banco quebrado e CEP
  desconhecido indistinguíveis, e o segundo caso é o que manda o operador digitar.
- **A projeção é a fronteira de PII**: só `city · district · state · street` (+ `recordedAt` para o
  desempate). `number` e `complement` não são selecionados em origem nenhuma — o número da casa do
  motorista ou do emitente não sai por uma consulta de CEP.

⚠️ **Colisão com a ADR-0039, para a T7.1 resolver.** A origem `fleetDriver` é o **primeiro leitor**
dos campos de endereço de `fleet_drivers` — e a ADR-0039 já decidiu criptografá-los (envelope
A256GCM, AAD `transportada:fleet-driver:v1:${companyId}:${driverId}`), justamente **porque** não
havia leitor. Com envelope, `eq(postal_code, …)` deixa de existir: a busca por igualdade exige
índice cego (HMAC), como a ADR já prevê para a CNH. A diretiva do usuário — "vc precisa identificar
tudo que for tabela de endereço que conseguir trazer informações de cep deve retornar" — mantém a
origem; o que a ADR desta spec tem de decidir é a ordem: índice cego antes da criptografia, ou a
origem sai do registro enquanto o envelope for aplicado.

## T4.1 — Provedores externos atrás de um gateway

Contrato antes da implementação, vermelho pelo motivo certo:

```
$ bun test ./test/addresses-infrastructure.contract.test.ts
error: Cannot find module '../../src/addresses/infrastructure/postal-code.gateway.js' from
'.../test/addresses-infrastructure/postal-code-gateway.contract.ts'
 0 pass · 1 fail · 1 error
```

Verde depois, e a suíte inteira da app:

```
$ bun test ./test/addresses-infrastructure.contract.test.ts ./test/addresses-domain.contract.test.ts \
          ./test/addresses-schema.contract.test.ts
 30 pass · 0 fail · 77 expect() calls

$ bun run test
 2797 pass · 15 skip · 0 fail · 11451 expect() calls   (115 arquivos; eram 2786 em 114)

$ bunx tsc --noEmit          → 0
$ bunx eslint src test --max-warnings=0 → 0
$ bunx prettier --check <arquivos da task> → All matched files use Prettier code style!
```

Onze casos, e o que cada um fixa:

| Caso                                | O que ele impede                                              |
| ----------------------------------- | ------------------------------------------------------------- |
| BrasilAPI responde, ViaCEP intocado | consultar dois terceiros quando um bastou                     |
| `accept` + `AbortSignal`            | pedido sem teto de tempo pendurando a nossa rota              |
| status ruim → ViaCEP                | 404 do primeiro provedor virando "CEP não existe"             |
| conexão perdida → ViaCEP            | falha de rede virando resposta vazia sem segunda tentativa    |
| `200 {"erro":true}` → vazio         | o único caso em que o status **não** acusa nada               |
| os dois falham → `null`             | provedor fora do ar impedindo o operador de digitar           |
| corpo que não é o objeto esperado   | HTML de página de erro e array entrando como endereço         |
| resposta parcial vence e para       | descartar a cidade que o provedor soube por faltar logradouro |
| UF que veio como nome inteiro       | `SÃO PAULO` num campo de duas letras                          |
| provedor não configurado            | pedir a URL que o ambiente não declarou                       |
| nenhum provedor configurado         | instalação só-local tocando a rede                            |

Três decisões desta task:

- **Sequência, não corrida.** Nas nossas tabelas a corrida é ganho puro — o banco é nosso e as cinco
  consultas custam o mesmo round-trip. Com terceiros a conta inverte: a chamada ao segundo provedor
  só se justifica quando o primeiro não soube. É a assimetria que a diretiva do usuário descreve
  ("um promise.race com nossas tabelas e se nao houve buscar no exterior").
- **O gateway devolve `null` para falha _e_ para ausência**, ao contrário do repositório, que
  rejeita. Banco nosso quebrado é defeito nosso; provedor público fora do ar não é, e a resposta ao
  operador é a mesma — ele digita. Foi essa a fronteira escolhida para a escada da T4.2 conversar
  com **um** port de provedor, com a ordem BrasilAPI→ViaCEP asseverada aqui, onde vive o `fetch` falso.
- **Resposta parcial encerra a escada.** Cidade e bairro sem logradouro é CEP de cidade inteira, não
  provedor incompleto: perguntar ao segundo devolveria a mesma coisa. Quem decide se a parcial basta
  é a T4.2, comparando-a com a parcial local.

`toPostalCodeSuggestion` saiu do `selectPostalCodeSuggestion` para o topo da policy: apara espaço,
sobe a UF e devolve `null` quando não sobrou campo nenhum. Sem isso o gateway reimplementaria as
três regras, e "só UF é parcial" passaria a ter duas definições. A guarda de **duas letras** para a
UF fica só no gateway — coluna do nosso banco tem CHECK, corpo de terceiro não tem nada.

## T4.2 — A escada num caso de uso

Vermelho primeiro, pelo motivo certo:

```
bun test ./test/addresses-application.contract.test.ts
error: Cannot find module '../../src/addresses/application/lookup-postal-code.use-case.js'
 0 pass · 1 fail · 1 error
```

Verde depois de `src/addresses/application/lookup-postal-code.use-case.ts`:

```
bun test ./test/addresses-application.contract.test.ts        →  9 pass · 0 fail · 17 expect()
bun test ./test/addresses-{domain,schema,infrastructure,application}.contract.test.ts
                                                             → 39 pass · 0 fail · 94 expect()
bun run --cwd apps/api-transportada test                     → 2808 pass · 15 skip · 0 fail
                                                               11476 expect() · 116 arquivos
bunx tsc --noEmit                                            → 0
bunx eslint src test --max-warnings=0                        → 0
bunx prettier --check <arquivos da task>                      → ok
```

(Antes desta task: 2797 pass em 115 arquivos.)

Os nove casos, e o que cada um impede de voltar:

| Caso                                  | O que ele impede                                                   |
| ------------------------------------- | ------------------------------------------------------------------ |
| acerto local completo, provedor mudo  | gastar chamada externa tendo o endereço inteiro em casa            |
| parcial local ainda sobe a escada     | parar na UF e deixar o logradouro em branco tendo quem soubesse    |
| provedor mudo → volta a parcial local | descartar a UF certa e responder vazio                             |
| miss local → provedor                 | instalação nova (fonte local fria) não achar CEP nenhum            |
| ninguém soube → vazio                 | travar o cadastro porque um CEP não foi achado                     |
| CEP mascarado canonicalizado          | `14020-210` não casar com a coluna nem com o caminho do provedor   |
| provedor recebe só `postalCode`       | a empresa do token atravessar para terceiro                        |
| CEP malformado recusado na fronteira  | consulta ao banco e à rede por lixo digitado                       |
| banco quebrado sobe para a fronteira  | defeito nosso virando "CEP não encontrado" com o endereço no banco |

Duas decisões desta task:

- **A parcial de casa é guardada, não devolvida.** A escada da spec ("resposta parcial não vence a
  corrida") vale entre degraus também: o `?? local` no fim é o que faz a parcial responder só quando
  o provedor calou. Devolvê-la antes de perguntar transformaria a UF do MDF-e em resposta final, e a
  BrasilAPI nunca seria consultada para aquele CEP.
- **Resposta do provedor vence a parcial local, mesmo sendo parcial também.** `{city:'Guaíra',
state:'SP'}` é mais do que `{state:'SP'}`, e comparar riqueza campo a campo seria regra nova para
  ganhar caso que não existe: origem local que responde parcial é o MDF-e, e ele só sabe a UF.

O caso do banco quebrado é o par do `reject` da T3.2: se o caso de uso engolisse a falha do
repositório para tentar o provedor, banco fora do ar responderia CEP pela BrasilAPI e a instalação
pareceria sadia enquanto nenhuma tela salvava nada.

## T5.1 — a rota e o fio até o `main.ts`

`GET /postal-codes/{cep}` publicada por `addresses/presentation/postal-code.routes.ts` com
`policy: { permission: 'addresses.read', scope: 'company' }`, e composta no `main.ts`:

```ts
const lookupPostalCode = createLookupPostalCodeUseCase({
  directory: new DrizzlePostalCodeRepository(database),
  provider: createPostalCodeGateway({
    configuration: postalCodeProviders,
    fetch: (target, init) => fetch(target, init),
  }),
})
```

Verificação (raiz e app, 21/08/2026):

| Comando                                    | Resultado                                                    |
| ------------------------------------------ | ------------------------------------------------------------ |
| `bunx tsc --noEmit` (api)                  | limpo                                                        |
| `bun run --cwd apps/api-transportada test` | 2814 pass · 15 skip · 0 fail · 11490 expect() · 117 arquivos |
| `bun run lint` (raiz, 4 apps)              | limpo                                                        |
| `bun run format:check` (raiz)              | 5 avisos, todos já commitados em `HEAD` e alheios à spec     |

Os cinco avisos de formatação são dívida anterior desta branch — `drizzle/…_fleet_driver_personal_details/snapshot.json`
(artefato gerado pelo drizzle-kit) e quatro arquivos de `frontend-transportada/src/modules/identity`.
`git diff --quiet HEAD --` passa nos cinco: nenhum foi tocado por esta feature, e formatá-los aqui
misturaria dois assuntos no mesmo commit.

Três decisões desta task:

- **`pathParameterFormat: 'raw'` é obrigatório.** O padrão do `defineRoute` é `'canonicalUuid'`, e um
  CEP não é UUID: sem declarar `'raw'` o router não casa a rota e o preflight responde 403 — falha que
  parece de permissão e é de roteamento.
- **Os dois provedores entram por ambiente, e vazio é desligado.** `POSTAL_CODE_BRASIL_API_URL` e
  `POSTAL_CODE_VIA_CEP_URL` seguem o precedente do `FLEET_VEHICLE_CATALOG_URL` (`isTrustedLookupUrl`,
  `.optional()`), e chegam ao gateway como um objeto só (`postalCodeProviders`), a mesma forma que
  `createPostalCodeGateway` já pedia — nada é rederivado no composition root. Os dois ausentes fazem a
  escada terminar em casa, e o operador digita: nenhum boot cai por causa disso.
- **No `.env.example` as duas linhas nascem preenchidas**, ao contrário do catálogo FIPE. São as
  mesmas URLs que o navegador já chama hoje (`driverAddress.service.ts`), públicas e sem token: deixar
  vazio moveria a busca para o servidor e a desligaria no mesmo commit.

## T6.1 — um hook de CEP para os três formulários

`shared/postalCodeClient.service.ts` fala com a nossa rota (`POSTAL_CODES_PATH = '/postal-codes'`,
Bearer do `KeycloakAuthProvider`, `no-store`) e traduz o `404` em vazio: o próximo passo de "ninguém
soube" é o mesmo de "CEP não existe", que é o operador digitar.

`shared/usePostalCodeLookup.hook.ts` é o que as telas consomem. Duas formas fazem o trabalho:

```ts
export type PostalCodeFieldNames<TState> = Readonly<{
  city?: keyof TState & string
  district?: keyof TState & string
  state?: keyof TState & string
  street?: keyof TState & string
}>
```

**Nenhum campo é obrigatório**, e é isso que deixa o mesmo hook servir a lotação do MDF-e, que só tem
UF de destino, e o CEP de carregamento, que não tem onde escrever — consultar ainda vale, porque o
status diz se o CEP existe. `toPostalCodeFieldPatch` pula alvo `undefined` e valor vazio, então
**sugestão parcial não apaga campo preenchido**. O desempate de pedido é o `useGuardedRequest`, que já
existia: resposta antiga não vence a nova. Estados: `idle · pending · found · missing`, e `missing`
não desabilita, não limpa e não bloqueia envio.

Teste antes: `test/shared/postal-code-lookup.contract.ts`.

## T6.2 — o CEP sai de `driverAddress.service.ts`

`useDriverAddressLookup` delega o CEP ao hook novo. `lookupPostalCode`, `fromBrasilApi` e `fromViaCep`
saíram do serviço; sobrou a busca textual pelo Photon, com o `Promise.allSettled` sobre uma lista de
um que a ADR-0037 deixou.

Sobrou também a única leitura de origem externa do módulo `fleet`, e ela é a verificação da task:

```
$ command grep -rn "https://" apps/frontend-transportada/src/modules/fleet
…/shared/driverAddress.service.ts:27:const PHOTON_URL = 'https://photon.komoot.io/api'
…/shared/ibgeMesh.service.ts:10:const IBGE_MESH_URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados'
…/shared/companyLookup.service.ts:4:const BRASIL_API_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1'
…/shared/municipality.service.ts:10:const IBGE_MUNICIPALITY_URL = 'https://brasilapi.com.br/api/ibge/municipios/v1'
```

Quatro destinos, e **nenhum é de CEP**.

## T6.3 — Empresa e lotação do MDF-e passam a buscar

`company-settings/hooks/useProfilePostalCodeLookup.hook.ts` e
`mdfe-manifest/hooks/useLotacaoPostalCodeLookup.hook.ts`, com `CompanyProfileFields` e
`MdfeManifestLotacaoFields` recebendo o mesmo `statusKey` — um prop só, porque quatro estados com
quatro props booleanos deixariam a tela dizer duas coisas ao mesmo tempo. Rótulos nos
`*.locale.json` dos módulos de destino, acentuados.

Um defeito real apareceu aqui, e não era do CEP: `CompanySettingsForm` aplicava
`setState({ ...captured, campo })` em sequência no mesmo handler, e **só a última escrita
sobrevivia** — o patch de quatro campos do CEP entrava com um. A correção é a forma de atualização
(`setState((current) => …)`), que é o único jeito de várias escritas no mesmo tick se somarem.

Testes antes: `test/company-settings/postal-code-lookup.contract.ts` e
`test/mdfe-manifest/postal-code-lookup.contract.ts`.

## T6.4 — a CSP perde um destino, e o contrato ganha a direção que faltava

`viacep.com.br` saiu de `EXTERNAL_CONNECT_ORIGIN`. `brasilapi.com.br` **ficou**, ao contrário do que a
task pedia: o domínio ainda serve o cadastro por CNPJ e a lista de municípios, ambos buscados do
navegador (ver a varredura da T6.2). Só o ViaCEP ficou órfão.

O contrato não sustentava a verificação que a task supõe. Ele cobrava um lado — origem que o bundle
nomeia tem de estar na diretiva — e nunca o outro. Caso novo:

```ts
test('carries no origin the bundle stopped fetching', async () => {
  const namedOrigins = await collectSourceOrigins({ skipsDeclaration: true })

  for (const origin of EXTERNAL_CONNECT_ORIGIN) {
    const isNamed = namedOrigins.some((named) => named === origin)
    expect(`${origin}:${isNamed}`).toBe(`${origin}:true`)
  }
})
```

`skipsDeclaration` pula `modules/shared/contentSecurityPolicy.service.ts`: com ele na varredura o
teste se auto-provaria, porque o arquivo que declara a diretiva nomeia toda origem dela.

**Provado que morde**: com `'https://viacep.com.br'` reposto na constante, a suíte devolveu uma falha
só, e foi esta —

```
error: expect(received).toBe(expected)
Expected: "https://viacep.com.br:true"
Received: "https://viacep.com.br:false"
```

— e a linha voltou a sair.

## Fase 7 — documentação

- **T7.1** `docs/adr/0040-o-cep-vem-de-casa.md`, que substitui o item 3 e a parte do item 5 da
  ADR-0037 que trata do CEP. O enquadramento é o cuidado da ADR: a 0037 rejeitou o proxy **como
  remédio de privacidade** e continuava certa nisso, então a 0040 o traz de volta por outro motivo —
  ler as nossas tabelas, o que o navegador não pode fazer. Item 5 declara o preço (rota externa sem
  limitador) e item 6 registra que a **ADR-0039** ficou mais caro de executar, com três saídas
  nomeadas e nenhuma escolhida, porque a 0039 não foi executada.
- **T7.2** `docs/SECURITY.md`: o achado de 2026-08-20 ganhou o bloco **Executado (spec 050)** — a
  primeira redução dele que é medida em vez de declarada — e um achado novo de **2026-08-21** entrou
  no topo (o arquivo ordena do mais recente para o mais antigo): a rota de CEP chama provedor externo
  e esta API não tem limitador nenhum. O achado novo nomeia esse limitador como **o mesmo** dos dois
  abaixo: não são três problemas, é um cobrado em três lugares.
- **T7.3** `CLAUDE.md`: o parágrafo dos "quatro provedores públicos consultados do navegador" virou
  dois — o CEP pela nossa rota e a busca textual, que é o que ainda sai do navegador. Saíram o
  `Promise.any`, o Nominatim e o `iframe` do OpenStreetMap, que já não existiam no código; e entraram
  três correções que o texto arrastava: `addresses` na lista de módulos da API, o crédito da lista de
  municípios à BrasilAPI (não ao IBGE direto) e os ordinais de "destino externo", que contavam os
  provedores de CEP e o Nominatim.

## Gate final

Verificação (raiz, 21/08/2026):

| Comando                                         | Resultado                                                    |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `bun run --cwd apps/api-transportada test`      | 2814 pass · 15 skip · 0 fail · 11490 expect() · 117 arquivos |
| `bun run --cwd apps/worker-transportada test`   | 490 pass · 0 fail · 59 arquivos                              |
| `bun run --cwd apps/cron-transportada test`     | 196 pass · 0 fail · 8 arquivos                               |
| `bun run --cwd apps/frontend-transportada test` | 1703 pass · **5 fail** · 18 arquivos                         |
| `bun run typecheck` (4 apps)                    | limpo                                                        |
| `bun run lint` (4 apps)                         | limpo                                                        |
| `bun run format:check` (raiz)                   | 1 aviso, já commitado em `HEAD` e alheio à spec              |

As **cinco falhas do frontend são de outra sessão**, em curso nesta mesma árvore de trabalho: são os
campos novos da ficha do motorista (`nationality` e vizinhos), e aparecem em
`test/fleet/{client,driver-profile,presentation-boundaries}.contract.ts`. Nenhuma toca CEP, hook,
rota ou CSP, e não foram mexidas aqui — arrumar teste de outra feature no commit desta esconderia o
estado real das duas.

O aviso de formatação é `drizzle/20260821214357_fleet_driver_personal_details/snapshot.json`, artefato
gerado pelo drizzle-kit e também da outra sessão. Os quatro arquivos de `modules/identity` que
apareciam na T5.1 já foram formatados no meio do caminho.

`test/addresses-schema/tenant-safety.contract.ts` está entre os contratos de isolamento, e todo
arquivo de teste novo entrou na lista explícita do `package.json` da app — sem isso ele não roda, e
teste que não roda é o pior desfecho possível.
