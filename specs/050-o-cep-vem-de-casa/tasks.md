# Tasks — 050 O CEP vem de casa

Uma task por vez, contrato antes da implementação, evidência em `evidence.md` antes de fechar.

## Fase 1 — Permissão e fronteira

> 🤖 Modelo: `sonnet`

- [x] **T1.1** `addresses.read` em `TRANSPORTADA_PERMISSIONS` e em `COMPANY_ROLE_PERMISSIONS`
      (`company-admin`, `fiscal`, `operator`).
      Teste antes: caso novo em `test/authorization.contract.test.ts` — presente nos três papéis,
      ausente em `finance`, `viewer`, `driver` e `aggregate`.
      Verificação: `bun run --cwd apps/api-transportada test` · `bun run typecheck`.

## Fase 2 — Domínio da sugestão

> 🤖 Modelo: `sonnet`

- [x] **T2.1** `addresses/domain/postal-code-suggestion.policy.ts` + `postal-code.error.ts`.
      Teste antes: `test/addresses-domain/postal-code-suggestion.contract.ts` — oito dígitos com e
      sem máscara, CEP inválido recusado na fronteira, desempate dentro de uma origem (`street`
      preenchido ganha; empate vai para a linha mais recente), a distinção **completa** × **parcial**
      (só UF é parcial), e a sugestão **sem** `number` e sem `complement`.
      Registrar o arquivo em `test/addresses-domain.contract.test.ts` e no `package.json`.
      Verificação: `bun run --cwd apps/api-transportada test`.

## Fase 3 — Fonte local

> 🤖 Modelo: `sonnet` (T3.2 é 🧠 — a corrida atravessa quatro agregados)

- [x] **T3.0** Migration aditiva: índice `(company_id, postal_code)` em `nfe_addresses`,
      `fleet_drivers`, `company_fiscal_profiles` e `mdfe_manifests` (duas colunas), parcial onde a
      coluna admite vazio. `rollback.sql` ao lado.
      Verificação: `make migration-test` · `bun run --cwd apps/api-transportada db:check`.
- [x] **T3.2** 🧠 `addresses/infrastructure/drizzle-postal-code.repository.ts` — **cinco consultas em
      corrida**, `company_id` no `where` de **cada** uma, vencendo a primeira sugestão completa e
      coletando as parciais à parte. `Promise.race` cru é o erro a evitar: ele resolve com o primeiro
      a terminar, que costuma ser a origem que não achou nada.
      Teste antes: `test/addresses-schema/tenant-safety.contract.ts` — o mesmo CEP gravado em duas
      empresas responde só para a dona; **um caso por origem**, inclusive as duas do MDF-e; e a
      corrida devolvendo a completa quando uma parcial responde primeiro.
      Verificação: `bun run --cwd apps/api-transportada test`.

## Fase 4 — Provedores externos

> 🤖 Modelo: `sonnet`

- [x] **T4.1** `addresses/infrastructure/postal-code.gateway.ts` — BrasilAPI e ViaCEP em sequência,
      `AbortSignal` e timeout; ViaCEP `200 {"erro":true}` conta como vazio.
      Teste antes: `test/addresses-infrastructure/postal-code-gateway.contract.ts` com `fetch` falso.
- [x] **T4.2** `addresses/application/lookup-postal-code.use-case.ts` — a escada.
      Teste antes: `test/addresses-application/lookup.contract.ts` — acerto local **completo** não
      chama provedor nenhum; acerto **parcial** ainda chama a BrasilAPI e só volta se ela e o ViaCEP
      falharem; miss local chama a BrasilAPI; falha dela chama o ViaCEP; falha das duas devolve vazio.

## Fase 5 — Rota

> 🤖 Modelo: `sonnet`

- [x] **T5.1** `addresses/presentation/postal-code.{routes,schema}.ts`, registrada no `main.ts` com
      `policy: { permission: 'addresses.read', scope: 'company' }`.
      Teste antes: `test/addresses-http/routes.contract.ts` — `200` com a sugestão, `404` no miss
      total, `400` em CEP malformado, `403` para papel sem a permissão.
      Verificação: `bun run --cwd apps/api-transportada test` · `bun run lint` · `bun run typecheck`.

## Fase 6 — Frontend

> 🤖 Modelo: `sonnet`

- [x] **T6.1** `shared/postalCodeClient.service.ts` + `shared/usePostalCodeLookup.hook.ts`.
      Teste antes: `test/shared/postal-code-lookup.contract.ts` — chama a nossa rota, sugestão
      parcial não apaga campo preenchido, pedido antigo não vence o novo, e **`404` deixa os campos
      digitáveis** (não desabilita, não limpa, não bloqueia envio).
- [x] **T6.2** `useDriverAddressLookup` delega o CEP ao hook novo; `driverAddress.service.ts` perde
      `lookupPostalCode`, `fromBrasilApi` e `fromViaCep` (a busca textual pelo Photon fica).
- [x] **T6.3** Os campos de CEP de **Empresa** (`CompanyProfileFields`) e da **lotação do MDF-e**
      (`MdfeManifestLotacaoFields`) passam a buscar, com o mesmo hook e o mesmo texto de status.
      Rótulos novos nos `*.locale.json` dos módulos de destino, acentuados.
- [x] **T6.4** `EXTERNAL_CONNECT_ORIGIN` sem `viacep.com.br`. **`brasilapi.com.br` fica** — a task
      pedia as duas fora, mas o domínio serve mais que o CEP no navegador:
      `fleet/shared/companyLookup.service.ts` busca o cadastro por CNPJ e
      `fleet/shared/municipality.service.ts` a lista de municípios do IBGE. Só o ViaCEP ficou órfão.
      O contrato não fechava a direção que a verificação supõe: ele cobrava origem do bundle
      declarada na diretiva, nunca origem da diretiva que o bundle deixou de buscar. Caso novo
      `carries no origin the bundle stopped fetching`, varrendo `src/**` **sem** o arquivo que
      declara a diretiva — com ele a varredura se auto-provaria.
      Verificação: `bun run --cwd apps/frontend-transportada test` (1700 pass · 5 fail, os cinco da
      frota, de outra sessão) · `bun run lint` · `bun run typecheck`.

## Fase 7 — Documentação e fechamento

> 🤖 Modelo: `haiku`

- [x] **T7.1** `docs/adr/0040-o-cep-vem-de-casa.md`. Ela **substitui o item 3 e a parte do item 5 da
      ADR-0037 que trata do CEP** — e o enquadramento importa: a ADR-0037 rejeitou o proxy como
      remédio de privacidade e continuava certa nisso, então a 0040 o traz de volta como consequência
      de precisar ler as nossas tabelas, o que o navegador não pode fazer. Seis itens: a rota, os
      quatro campos (nunca `number` nem `complement`), a corrida com completa vencendo parcial, o que
      **continua** saindo do navegador (Photon com o termo digitado, IBGE com a sigla da UF, BrasilAPI
      com CNPJ e lista de municípios — **não** o CEP), a rota sem limitador como preço declarado, e a
      colisão com a **ADR-0039** com três saídas nomeadas e nenhuma escolhida, porque a 0039 não foi
      executada.
      Verificação: `bunx prettier --check docs/adr/0040-o-cep-vem-de-casa.md`.
- [x] **T7.2** `docs/SECURITY.md`: o achado de 2026-08-20 do endereço do motorista ganhou o bloco
      **Executado (spec 050, T6.1–T6.4)** — é a primeira redução dele que é **medida** em vez de
      declarada — e o "O que falta" passou a nomear só o que sobrou (termo ao Photon, CEP aos
      provedores **quando a base não souber**). Achado novo de **2026-08-21** no topo, que é onde a
      ordem do arquivo o põe: a rota de CEP chama provedor externo e esta API não tem limitador
      nenhum. Ele nomeia o limitador ausente como **o mesmo** dos dois achados abaixo — não são três
      problemas, é um cobrado em três lugares.
      Verificação: `bunx prettier --check docs/SECURITY.md`.
- [x] **T7.3** `CLAUDE.md`. O parágrafo dos "quatro provedores públicos consultados do navegador"
      virou dois: o CEP pela nossa rota (banco → BrasilAPI → ViaCEP, com o `404` deixando o operador
      digitar) e a busca textual, que é o que **ainda** sai do navegador. Saíram o `Promise.any` do
      CEP, o Nominatim e o `iframe` do OpenStreetMap — os três já não existiam no código.
      Três correções que o texto arrastava e a task não pedia, porque deixá-las erradas contradiria o
      parágrafo novo: `addresses` faltava na lista de módulos da API; a lista de municípios era
      creditada ao IBGE quando quem a serve é a BrasilAPI; e os ordinais "quinto destino externo do
      formulário" e "sexto destino externo do módulo" contavam os dois provedores de CEP e o
      Nominatim, que saíram — a malha do IBGE é o **quarto e último**, ao lado do Photon e das duas
      rotas da BrasilAPI. O contraste "ao contrário do endereço do motorista, aqui não há `iframe`"
      também caiu: desde a ADR-0037 não há moldura em lugar nenhum, e a CSP nega as duas diretivas de
      moldura.
      Verificação: `bunx prettier --check CLAUDE.md` · `command grep -rn "https://"` no módulo
      `fleet`, que devolve exatamente os quatro destinos citados.
- [x] **T7.4** `evidence.md` com a saída dos comandos de cada fase. As seções de `T6.1` a `T6.4`, a da
      fase 7 e a do gate final foram acrescentadas depois da `T5.1` que já existia. Entram ali a
      forma do `PostalCodeFieldNames<TState>` com os quatro membros opcionais (é o que deixa um hook
      só servir motorista, empresa e lotação do MDF-e, cujo CEP de carregamento não tem onde
      escrever), a varredura de `https://` no módulo `fleet` com os quatro destinos e nenhum de CEP, o
      defeito de `setState` do `CompanySettingsForm` (duas escritas consecutivas com o objeto
      capturado guardam só a última — a forma de atualizador é obrigatória quando o patch mexe em
      vários campos) e a saída que prova o caso novo da CSP morder quando a origem órfã volta.
      Verificação: `bunx prettier --check specs/050-o-cep-vem-de-casa/evidence.md`.

## Gate final

`test/addresses-schema/tenant-safety.contract.ts` está entre os contratos de isolamento e todo
arquivo de teste novo entrou na lista explícita do `test` no `package.json` da app — suíte fora dessa
lista não roda, e passaria por verde sem nunca ter sido executada.

Medido, com a saída em `evidence.md`: api **2814 pass · 15 skip · 0 fail**, worker **490 pass · 0
fail**, cron **196 pass · 0 fail**, `bun run typecheck` e `bun run lint` limpos nas quatro apps.

A exceção é uma e é honesta: o frontend fecha em **1703 pass · 5 fail**, e as **cinco falhas são de
outra sessão**, em curso nesta mesma árvore de trabalho — os campos de dado pessoal do motorista
(`nationality`), em `test/fleet/{client,driver-profile,presentation-boundaries}.contract.ts`. Nenhuma
toca CEP, hook, rota ou CSP, e não foram mexidas aqui: arrumar teste de outra feature no commit desta
esconderia o estado real das duas. O mesmo vale para o único aviso de `format:check`, o
`snapshot.json` que o drizzle-kit daquela sessão gerou.
