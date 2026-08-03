# Feature 016 — Alinhamento do CT-e gerado com CT-es reais

## Problema e resultado

`research.md` comparou, campo a campo, 166 CT-es reais autorizados com o payload que o nosso próprio
código gera para as mesmas NF-es. **17 dos 19 campos batem em 166/166** — inclusive `vTPrest`,
`vCarga`, `Comp`, `CFOP`, `natOp`, `toma`, `indIEToma`, municípios e chaves. Sobraram três frentes:

1. **`proPred` erra em 51 dos 166.** O único modo comparável hoje (`highest_value`, maior `vProd`)
   acerta 115/166. A regra do emitente real é **maior `qCom`, desempate maior `vProd`, desempate
   menor `nItem`** — 165/166. O modo não existe no produto, e não pode existir como regra fixa: cada
   transportadora escolhe o seu critério.
2. **`sender_recipient` nunca foi exercitado ponta a ponta.** O modo existe em
   `CTE_EMISSION_GROUPING_MODES` e o agrupamento tem contrato no caso de uso do lote
   (`test/cte-batch-application/create-grouping.contract.ts`), mas a leitura que monta o payload de
   um item com **várias notas** (`findCteIssuancePayloadSource`) não tem nenhum teste, e o lote real
   de 166 é 100% `per_invoice` — não há amostra para conferir contra a SEFAZ.
3. **`highest_weight` está quebrado desde sempre.** `cte-issuance-payload.query.ts:loadProducts`
   grava `grossWeight: null` em todo produto — e não tem de onde tirar outra coisa, porque a NF-e
   declara peso por **volume**, não por item. Qualquer perfil configurado nesse modo lança
   `CtePayloadUnresolvedPredominantProductError` em toda emissão real. O modo está no formulário e
   não funciona.
4. **O `taxRegime` da empresa local nunca foi conferido.** `CteXmlBuilder.buildIcms(icms, crt)` do
   `@adatechnology/fiscal-provider` emite `<ICMS><ICMSSN><CST>90</CST><indSN>1</indSN></ICMSSN>`
   sempre que `crt ∈ {'1','2'}`, ignorando o grupo que passamos. O emitente real tem `CRT = 1`; a
   nossa empresa local pode estar com outro valor e sair com o grupo ICMS errado no XML.

**Resultado esperado:** um perfil de emissão pode escolher `highest_quantity` pela tela, sem nenhuma
regra de transportadora no código; `highest_weight` passa a funcionar com o peso que a NF-e de fato
declara; o agrupamento por remetente+destinatário tem contrato que prova uma NF-e por `infNFe` e a
carga somada; e o regime tributário da empresa local está conferido e registrado com evidência.

## Fora do escopo

- Reproduzir a escolha manual do emitente no CT-e 14139 (1/166). A regra vencedora escolhe
  `COCO RAL SOCOCO 100G TRAD` onde o real traz `LA ACO BOMBRIL 45G C/6`; a NF-e não expõe por item
  nenhum dado que justifique a troca. **Não se inventa regra legal por uma amostra.**
- Alterar o grupo ICMS emitido pelo pacote fiscal. `indSN` é decisão do `CteXmlBuilder` a partir do
  `crt`; nosso payload continua devolvendo `{cst:'90'}` e isso está correto.
- Trocar a fonte do peso declarado da carga. `infQ`/`pesoB` continua saindo do peso bruto do volume,
  nunca da soma dos itens — o volume é o que a NF-e declara como peso legal e já inclui a embalagem.
- Commitar as amostras de `samples/`. São NF-es e CT-es reais de terceiros, com CNPJ, IE e chave de
  acesso; ficam na árvore de trabalho e **não entram no histórico**. Os fixtures de teste são
  derivados anonimizados: só a forma numérica que caracteriza cada desempate.
- T009 da feature 014 (valor de frete manual) continua bloqueada por `[NEEDS CLARIFICATION]`.

## Histórias priorizadas

### P1 — Escolher o critério de produto predominante do meu CNPJ

**Given** um perfil de emissão de CT-e da minha empresa
**When** eu abro o formulário do perfil e escolho "Item de maior quantidade" em _Produto
predominante_
**Then** o perfil grava `highest_quantity`, e todo CT-e emitido por esse perfil leva em `proPred` o
item de maior `qCom` da nota — sem que nenhuma outra empresa ou perfil mude de comportamento.

### P2 — Desempatar de forma previsível

**Given** uma NF-e em que dois itens têm a mesma `qCom`
**When** o CT-e é montado com `highest_quantity`
**Then** vence o item de maior `vProd`; persistindo o empate, vence o de menor `nItem` — a escolha é
determinística e não depende da ordem em que os produtos vieram do banco.

### P3 — Emitir um CT-e para várias notas do mesmo par remetente/destinatário

**Given** um item de lote agrupado por `sender_recipient` com três NF-es do mesmo par
**When** o payload de emissão é montado
**Then** o CT-e traz uma `infNFe` por nota na ordem da posição do item, `vCarga` igual à soma dos
`vNF`, `infQ` somando os volumes de todas as notas, e um `proPred` escolhido entre os itens de todas
elas — e a leitura nunca alcança nota de outra empresa.

### P4 — Escolher o produto predominante pelo peso e continuar declarando o peso legal

**Given** um perfil configurado em "Item de maior peso" e notas cujos itens não trazem peso próprio
**When** o CT-e é montado
**Then** a escolha usa o peso bruto do volume da nota — o mesmo peso que a NF-e declara — em vez de
falhar; e `infQ`/`pesoB` do CT-e continua sendo o peso bruto do volume, nunca uma soma de itens.

### P5 — Ter o grupo de ICMS certo no XML

**Given** a empresa local configurada nas configurações fiscais
**When** eu confiro o `taxRegime` gravado
**Then** o valor está registrado com evidência, coerente com o CRT do CNPJ emitente, e o
`providerConfig.crt` enviado ao pacote fiscal é exatamente esse valor.

## Requisitos funcionais

**RF1 — Novo modo `highest_quantity`.** `CTE_PREDOMINANT_PRODUCT_MODES` passa a
`['highest_value','highest_weight','highest_quantity','fixed']`, com migration alterando o
`CHECK cte_emission_profiles_predominant_product_mode_check` e rollback manual ao lado.

**RF2 — Regra de escolha.** No modo `highest_quantity`, entre todos os produtos de todas as notas do
CT-e: maior `quantity` (`qCom`, escala 4) → maior `totalValue` (`vProd`) → menor `ordinal` (`nItem`).
A comparação é item a item, sem somar por descrição — igual a `highest_value` e `highest_weight`. Se
nenhum produto tem `quantity` maior que zero, vale o mesmo erro dos demais modos
(`CtePayloadUnresolvedPredominantProductError`).

**RF3 — Dados do item.** `CtePayloadProduct` ganha `quantity` e `ordinal`; a leitura de
`cte-issuance-payload.query.ts` passa a projetar `nfe_products.quantity` e `nfe_products.ordinal`,
mantendo o filtro por `companyId`.

**RF4 — Borda HTTP.** `POST`/`PUT` de perfis aceitam `predominantProductMode: 'highest_quantity'`; a
resposta devolve o valor gravado. A regra de `predominantProductName` continua valendo só para
`fixed`.

**RF5 — Formulário.** A opção aparece no seletor _Produto predominante_ de
`CteProfileFiscalFields`, com rótulo em pt-BR e en, e o type guard de resposta
(`cteProfilesGuards.validation.ts`) passa a aceitar o novo valor.

**RF6 — Contrato de `sender_recipient`.** Contrato provando, para um item com N notas do mesmo par:
uma `infNFe` por nota na ordem de `cte_batch_item_documents.position`, `vCarga` somado, `infQ`
somado, partes tomadas da primeira nota e recusa quando remetente ou destinatário divergem.

**RF7 — Isolamento de tenant.** A leitura da fonte de payload é filtrada por `companyId` em toda
tabela que toca (`cte_batch_items`, `cte_batch_item_documents`, `nfe_documents`, `nfe_participants`,
`nfe_addresses`, `nfe_products`, `nfe_volumes`, `cte_emission_profiles`, `company_fiscal_profiles`)
e isso é provado por teste.

**RF8 — Peso do produto predominante.** No modo `highest_weight`, o peso comparado por item é:
`product.grossWeight` quando **todos** os produtos da seleção o declaram; caso contrário, o peso
bruto do volume da nota a que o item pertence, aplicado igualmente a todos os itens daquela nota. Os
desempates são os mesmos da regra nova: maior `totalValue` → menor `ordinal` → menor posição da nota
no item do lote. Sem peso de item **e** sem peso de volume em nenhuma nota, permanece
`CtePayloadUnresolvedPredominantProductError`.

**RF9 — Peso legal da carga é o do volume.** `infQ`/`pesoB` continua vindo exclusivamente de
`composeCargoQuantities`, somando os volumes. Peso por item, quando um dia existir na base, serve
**apenas** para escolher o produto predominante — nunca para declarar carga, porque o volume inclui a
embalagem e é o valor legal. Isso é amarrado por contrato: com peso por item presente e diferente da
soma dos volumes, o `pesoB` do payload segue o volume.

**RF10 — `taxRegime` conferido.** O valor gravado para a empresa local está registrado em
`evidence.md` (consulta de leitura, sem expor segredo), e há contrato amarrando
`providerConfig.crt === companyFiscalProfiles.taxRegime`.

## Requisitos não funcionais

- Nenhum CNPJ, nome de transportadora, rótulo de componente ou percentual de amostra entra em código
  de produção. Tudo continua por perfil, por empresa.
- Fixtures derivados das amostras são anonimizados: descrições genéricas, CNPJ/chave sintéticos.
  `samples/` não é commitado.
- Dinheiro e quantidade seguem `numeric`/escala inteira do `decimal.service` — nunca `Number` no
  caminho de decisão.
- Nenhum XML, certificado ou senha em log ou em mensagem de erro.
- Teste de contrato antes da implementação em toda task; arquivo de teste novo registrado na cadeia
  explícita (entrypoint no `package.json` da app, suíte no import do entrypoint).

## Casos extremos e falhas

| Situação                                                                       | Comportamento esperado                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Todos os itens com `quantity = 0`                                              | `CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT` — mesma falha dos outros modos                               |
| Empate de `qCom` e `vProd` entre notas diferentes do mesmo grupo               | vence o menor `ordinal`; havendo empate também de `ordinal`, vence a nota de menor `position`             |
| Perfil antigo com `highest_value`                                              | segue idêntico; a migration só amplia o `CHECK`                                                           |
| Rollback aplicado com perfis já em `highest_quantity`                          | o `ALTER` falha de propósito; o rollback documenta que esses perfis precisam ser decididos antes          |
| Item de lote `sender_recipient` cujas notas divergem de remetente/destinatário | `CtePayloadInconsistentPartiesError` (já implementado), coberto por contrato                              |
| `highest_weight` com uma nota só e sem peso de item                            | todos os itens empatam no peso do volume; decide `vProd`, depois `nItem`                                  |
| `highest_weight` em grupo de N notas sem peso de item                          | a nota de maior peso bruto vence; dentro dela, `vProd` e `nItem`                                          |
| Parte dos itens com peso próprio e parte sem                                   | fonte por item é descartada; vale o peso do volume para todos — não se mistura peso de origens diferentes |
| Soma dos pesos dos itens maior que o peso bruto do volume                      | esperado (o volume pesa a embalagem); não altera nada: `pesoB` continua sendo o do volume                 |
| Nenhuma nota declara peso, nem por item nem por volume                         | `CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT`                                                              |
| `taxRegime` da empresa local diferente do CRT do CNPJ                          | corrigir pela tela de configurações fiscais e reconferir; a divergência vai para `evidence.md`            |

## Critérios de aceite

1. `bun run --cwd apps/api-transportada test` verde, incluindo os contratos novos de produto
   predominante, de fonte de payload agrupada e de isolamento de tenant.
2. `bun run --cwd apps/frontend-transportada test` verde com o contrato do novo valor no formulário
   e no type guard.
3. `make migration-test` verde: migration e rollback aplicáveis em Postgres descartável.
4. Um perfil salvo pela tela com "Item de maior quantidade" volta da API com
   `predominantProductMode: 'highest_quantity'`.
5. Os cinco casos derivados das amostras produzem o `proPred` previsto pela regra — quatro iguais ao
   CT-e real, e o quinto (14139) documentado no teste como a divergência conhecida de 1/166.
6. Um perfil em `highest_weight` emite CT-e sem erro com notas que só declaram peso de volume, e o
   `pesoB` do payload é o do volume mesmo quando os itens trazem peso próprio somando outro valor.
7. `evidence.md` registra, por task: comando, saída e o que ela prova.
8. `make check` verde antes de fechar a feature.

## Decisões registradas

- [ADR-0019](../../docs/adr/0019-cte-predominant-product-and-icmssn.md) — o modo de produto
  predominante é parâmetro do perfil (e portanto da empresa), nunca regra fixa de transportadora; e o
  grupo `ICMSSN`/`indSN` é responsabilidade do `CteXmlBuilder` do pacote fiscal a partir do CRT.
- [ADR-0019](../../docs/adr/0019-cte-predominant-product-and-icmssn.md) — o peso do volume é a
  declaração legal da carga, porque inclui a embalagem; peso por item, quando existir, serve só para
  escolher o produto predominante, sob regra de tudo-ou-nada.

## Dúvidas

Nenhuma bloqueante. Duas decisões tomadas e registradas aqui, para não virarem regra invisível:

- **Comparação item a item, sem somar `qCom` por descrição de produto.** Manter coerência com
  `highest_value`/`highest_weight`; o lote real não tem grupo `sender_recipient` para arbitrar.
- **A divergência do CT-e 14139 não é corrigida.** Vira teste documentado, não regra.
- **Peso: volume manda (decisão do usuário, 2026-07-29).** Falta peso por item? usa-se o peso bruto
  do volume. Um dia vier peso por item? ele passa a valer para _escolher_ o produto predominante, e a
  soma dos itens é conferida contra o volume — mas o peso declarado da carga continua sendo o do
  volume, porque é ele que pesa a embalagem e é o que a nota declara como legal.
