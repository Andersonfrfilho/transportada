# Tasks

Feature 016 — Alinhamento do CT-e gerado com CT-es reais.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); teste de isolamento de tenant sempre que a
task mexer em query; task só fecha com evidência em `evidence.md` (comando, saída, o que prova).

`[P]` = pode rodar em paralelo com a anterior sem tocar nos mesmos arquivos.

## Fase A — Produto predominante por quantidade

> 🤖 Modelo: `sonnet` (T002 e T003 são 🧠 — regra fiscal e migration, validar com `opus`)

- [x] T001 Teste de contrato da regra `highest_quantity` **falhando** antes de qualquer
      implementação: cinco casos derivados e anonimizados das amostras — (a) maior `qCom` único
      vencendo item de `vProd` maior [14093]; (b) maior `qCom` único onde a expansão por embalagem
      empataria [14094]; (c) empate de `qCom` decidido por maior `vProd` [14108]; (d) empate de
      `qCom` e `vProd` decidido por menor `nItem` [14123]; (e) empate de `qCom` decidido por `vProd`
      no caso em que o CT-e real diverge — comentário de uma linha registrando que é a falha
      conhecida de 1/166 [14139] — mais grupo de N notas (escolha entre itens de todas) e erro
      quando toda `quantity` é zero —
      `apps/api-transportada/test/cte-issuance-domain/predominant-product.contract.ts` (novo) +
      `import` em `apps/api-transportada/test/cte-issuance-domain.contract.test.ts` —
      evidência: saída do `bun test` com o arquivo novo listado e falhando pelo motivo certo.
      **Sem CNPJ, chave de acesso, nome de produto ou razão social reais no fixture.**

- [x] T002 🧠 Implementar o modo no domínio: `CTE_PREDOMINANT_PRODUCT_MODES` ganha
      `'highest_quantity'`; `CtePayloadProduct` ganha `ordinal` e `quantity`; a escolha vira
      comparação explícita `quantity` desc → `totalValue` desc → `ordinal` asc, em inteiro escalado
      (`parseScaledDecimal`, escala 4), nunca `Number` —
      `apps/api-transportada/src/database/cte-emission-profile.schema.ts`,
      `apps/api-transportada/src/cte-issuance/domain/cte-payload.types.ts`,
      `apps/api-transportada/src/cte-issuance/domain/cte-cargo.service.ts`,
      `apps/api-transportada/test/cte-issuance-domain/support.ts` (fixture golden ganha os campos
      novos) — evidência: T001 verde + `bun run typecheck`

- [x] T003 🧠 Migration ampliando o `CHECK` de `predominant_product_mode` e rollback manual ao lado,
      no formato do repo (licença, aviso de rollback manual, `BEGIN/COMMIT`, remoção da linha do
      journal com `GET DIAGNOSTICS` exigindo exatamente 1, e o aviso de que perfis já gravados no
      modo novo fazem o `ALTER` falhar de propósito) —
      `bun run --cwd apps/api-transportada db:generate --name cte_predominant_product_highest_quantity`,
      `apps/api-transportada/drizzle/<ts>_cte_predominant_product_highest_quantity/{migration.sql,rollback.sql,snapshot.json}`,
      teste do `CHECK` em `apps/api-transportada/test/cte-profiles-schema/profiles.contract.ts` antes
      — evidência: `bun run --cwd apps/api-transportada db:check` + `make migration-test`

- [x] T004 Projetar `quantity` e `ordinal` na leitura da fonte de payload e extrair os filtros de
      cada leitura em funções exportadas, para que o isolamento seja verificável sem banco —
      `apps/api-transportada/src/cte-issuance/infrastructure/cte-issuance-payload.query.ts` —
      **mexe em query: teste de isolamento de tenant obrigatório** provando `company_id = $` em
      `cte_batch_items`, `cte_batch_item_documents`, `nfe_documents`, `nfe_participants`,
      `nfe_addresses`, `nfe_products` e `nfe_volumes` —
      `apps/api-transportada/test/cte-issuance-infrastructure/payload-source.contract.ts` (novo) +
      `import` em `apps/api-transportada/test/cte-issuance-infrastructure.contract.test.ts` —
      evidência: teste novo na saída do `bun test`, verde, com os filtros por empresa

- [x] T005 [P] Frontend antes da borda da API, para que um perfil válido nunca derrube a tela:
      `'highest_quantity'` em `CTE_PROFILE_PREDOMINANT_PRODUCT_MODE` e em `PROFILE_ENUMS`, rótulo
      pt-BR "Item de maior quantidade" e en "Highest quantity item" —
      `apps/frontend-transportada/src/modules/cte-profiles/shared/cteProfiles.types.ts`,
      `.../shared/cteProfilesGuards.validation.ts`,
      `.../locales/cteProfiles.locale.json`, `.../locales/cteProfiles.en.locale.json` —
      teste de contrato antes em `apps/frontend-transportada/test/cte-profiles/api-payload.contract.ts`
      (+ tipo do fixture em `test/cte-profiles/cte-profiles.fixture.ts`): a resposta com o modo novo
      passa no guard e o seletor lista a opção traduzida — evidência:
      `bun run --cwd apps/frontend-transportada test`

- [x] T006 Provar na borda HTTP que o perfil grava e devolve o modo novo, e que
      `predominantProductName` continua exigido só em `fixed` —
      `apps/api-transportada/test/cte-profiles-http/create.contract.ts` (ampliar) — evidência:
      201/200 com `predominantProductMode: 'highest_quantity'` e 400 para `fixed` sem nome

## Fase B — Agrupamento `sender_recipient` sob contrato

> 🤖 Modelo: `sonnet`

- [x] T007 Contrato da fonte de payload para um item com três notas do mesmo par
      remetente/destinatário: uma entrada por nota na ordem de
      `cte_batch_item_documents.position`, partes tomadas da primeira, produtos e volumes de todas —
      `apps/api-transportada/test/cte-issuance-infrastructure/payload-source.contract.ts` (o arquivo
      criado em T004) — evidência: teste verde e a ordem provada explicitamente

- [x] T008 Ampliar o contrato do builder para o CT-e agrupado: `vCarga` = Σ `vNF`, uma `infNFe` por
      nota, `infQ` somando os volumes das N notas, `proPred` escolhido entre os itens de todas elas
      nos três modos calculados, e recusa (`CtePayloadInconsistentPartiesError`) quando remetente ou
      destinatário divergem —
      `apps/api-transportada/test/cte-issuance-domain/cte-payload-builder.contract.ts` — evidência:
      `bun run --cwd apps/api-transportada test`

- [x] T009 Contrato da emissão de um item multi-nota no caso de uso: a montagem do payload preserva a
      seleção agrupada de ponta a ponta e o `payloadSha256` é estável para a mesma tentativa —
      `apps/api-transportada/test/cte-issuance-application/payload.contract.ts`,
      `.../cte-issuance-application/support.ts` — evidência: teste verde + hash idêntico em duas
      montagens da mesma tentativa

## Fase C — Regime tributário da empresa e grupo ICMSSN

> 🤖 Modelo: `opus` (fiscal)

- [x] T010 Conferir o `taxRegime` gravado para a empresa local — consulta **de leitura** ao Postgres
      local (`select company_id, tax_regime from company_fiscal_profiles`), comparada com o CRT do
      CNPJ emitente e com o `CRT = 1` dos CT-es reais de `research.md`. Se divergir, corrigir pela
      tela de configurações fiscais (`PUT` de company settings) e reconferir. Nenhuma senha,
      certificado ou XML na evidência — evidência: valor antes, ação tomada, valor depois

- [x] T011 Amarrar por contrato o caminho do CRT e o grupo ICMS que **nós** produzimos:
      `providerConfig.crt === companyFiscalProfiles.taxRegime`, emissor incompleto falha cedo, e o
      perfil Simples (CST 90, alíquota 0) devolve `{cst:'90'}` — com uma linha registrando que
      `<ICMSSN><indSN>1</indSN>` é decisão do `CteXmlBuilder` do pacote quando `crt ∈ {'1','2'}` e
      não deve ser replicada no nosso payload —
      `apps/api-transportada/test/cte-issuance-application/payload.contract.ts` — evidência: teste
      verde

- [x] T012 [P] ADR-0019 registrando as decisões fiscais desta feature: modo de produto predominante é
      parâmetro por perfil/empresa (nunca regra fixa de transportadora), com a tabela de acerto de
      `research.md` como fundamento; e o grupo ICMSSN/`indSN` é responsabilidade do pacote fiscal a
      partir do CRT — `docs/adr/0019-cte-predominant-product-and-icmssn.md` — evidência: ADR
      referenciada por `spec.md` e pelas tasks fechadas. A decisão de peso entra em T016.

## Fase D — Peso do produto predominante e peso legal da carga

> 🤖 Modelo: `opus` (fiscal — decide de onde sai peso em documento fiscal)
>
> Depende de T002: toca `cte-cargo.service.ts` e a suíte criada em T001.

- [x] T013 Teste de contrato **falhando** da fonte de peso em `highest_weight`: (a) nota sem peso por
      item usa o peso bruto do volume e não lança erro; (b) grupo de N notas sem peso de item — vence
      a nota de maior peso bruto, e dentro dela `vProd` depois `nItem`; (c) todos os itens com peso
      próprio — vence o item de maior peso; (d) parte dos itens com peso e parte sem — a fonte por
      item é descartada inteira e vale o volume; (e) sem peso em item e sem peso em volume —
      `CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT` —
      `apps/api-transportada/test/cte-issuance-domain/predominant-product.contract.ts` — evidência:
      saída do `bun test` com os casos novos falhando pelo motivo certo

- [x] T014 Implementar a resolução de fonte de peso no domínio, reaproveitando a soma de volumes que
      `composeCargoQuantities` já faz, mantendo `CtePayloadProduct.grossWeight` como ponto de
      extensão para quando a importação passar a extrair peso por item; comparação em inteiro
      escalado, nunca `Number` —
      `apps/api-transportada/src/cte-issuance/domain/cte-cargo.service.ts` — evidência: T013 verde +
      `bun run typecheck`

- [x] T015 Amarrar por contrato que peso de item **nunca** vira declaração de carga: com produtos
      trazendo peso próprio cuja soma diverge do peso bruto dos volumes, `infQ`/`pesoB` do payload
      continua sendo o do volume; `PESO BRUTO`, `PESO LIQUIDO` e `UN` seguem saindo de
      `nfe_volumes` —
      `apps/api-transportada/test/cte-issuance-domain/cte-payload-builder.contract.ts` — evidência:
      teste verde mostrando os dois números diferentes e o payload seguindo o volume

- [x] T016 Estender a ADR-0019 (T012) com a decisão de peso: volume é a declaração legal da carga
      porque inclui a embalagem; peso por item, quando existir, serve só para escolher o produto
      predominante, sob regra de tudo-ou-nada —
      `docs/adr/0019-cte-predominant-product-and-icmssn.md` — evidência: seção citada por `spec.md`

## Bloqueada — não implementar

- T009 da **feature 014** (valor de frete manual) segue `[NEEDS CLARIFICATION]`. Esta feature não a
  desbloqueia e não deve tocá-la.

## Verificação

`bun run lint` · `bun run typecheck` · `bun run --cwd apps/api-transportada test` ·
`bun run --cwd apps/frontend-transportada test` · `make migration-test` · `make check` antes de
fechar a feature.

⚠️ `specs/016-cte-real-alignment/samples/` contém NF-e e CT-e reais de terceiros (CNPJ, IE, chave de
acesso). **Não commitar.** Fixtures são derivados anonimizados.
