# Feature 012 — Emissão de CT-e a partir da seleção de notas

## Problema e resultado

Hoje o operador importa NF-e e vê a tabela "Notas", mas não existe caminho da nota até o
CT-e autorizado. A tela de lote é um harness com `documentId` sintético fixo, o lote nasce
sempre com **um** item (`cte-batch.use-case.ts:97` usa `documentIds[0]` e descarta o resto),
o payload do CT-e nunca é montado, o provider fiscal nunca é chamado
(`cte-issuance-execution-input-resolver.service.ts:42` retorna `null` sempre) e
`cte_fiscal_documents` nunca é escrita — o que também deixa o módulo `billing` lendo tabela
vazia.

Além disso, os parâmetros que uma transportadora precisa por cliente (percentual sobre o
valor da nota, tomador, CFOP, natureza da operação, rótulo do componente de prestação,
observações) não existem em lugar nenhum: os únicos parâmetros fiscais configuráveis são
ambiente, série e próximo número — e mesmo esses são ignorados na emissão, que tem
`homologation` e série `1` hardcoded.

**Resultado esperado:** o operador seleciona N notas na tabela "Notas", clica em _Gerar
CT-es_, confere uma prévia com o valor de cada CT-e calculado pelo perfil do cliente, e
confirma. Os CT-es entram num lote com todos os parâmetros congelados. Na página de CT-es
ele transmite e acompanha até `autorizado`, com chave de acesso, protocolo e XML
armazenado.

Referência viva: `example/exportacao_20_07_2026_13_17_59/CTe-3526…8240.xml` (CT-e real
autorizado) e `example/35260705868574001090550020008526741408978623.xml` (a NF-e que ele
referencia).

## Fora do escopo

- Modais que não sejam rodoviário (`01`).
- CT-e de complemento, anulação e substituição (`tpCTe` ≠ `0`).
- Cancelamento e carta de correção de CT-e.
- MDF-e.
- Emissão em contingência (`tpEmis` ≠ `1`).
- Tomador fora do quarteto rem/exped/receb/dest (`toma4`).
- DACTE em PDF — nesta feature entregamos o XML autorizado; o PDF fica para feature própria.
- Regras de frete por peso, distância ou tabela — o único tipo suportado permanece
  `percentage_of_invoice_total`.

## Histórias priorizadas

### P1 — Configurar o perfil de emissão de um cliente

**Given** sou administrador com `settings.manage`
**When** acesso _Configurações → Perfis de emissão CT-e_ e cadastro o perfil "Spani" com
percentual 4,5%, tomador = remetente, CFOP interno 5353 / interestadual 6353, rótulo do
componente "Frete Spani 4,5" e vínculo com o CNPJ 05868574001090
**Then** o perfil é salvo como `draft`, posso ativá-lo, e ele passa a ser resolvido
automaticamente para toda NF-e cujo emitente seja aquele CNPJ.

### P1 — Gerar CT-es a partir das notas selecionadas

**Given** selecionei 10 notas autorizadas na tabela "Notas"
**When** clico em _Gerar CT-es_
**Then** vejo uma prévia com o perfil resolvido por nota, o modo de agrupamento escolhido,
o valor de cada CT-e (4,5% do `vNF`) e o total; notas inelegíveis aparecem separadas com o
motivo; ao confirmar, um lote é criado com um item por CT-e projetado e sou levado à página
de CT-es.

### P1 — Transmitir e acompanhar

**Given** um lote criado com 10 CT-es
**When** clico em _Transmitir_ na página de CT-es
**Then** cada item vai para `requested`, o worker monta o XML 4.00, assina com o
certificado A1 da empresa, transmite à SEFAZ do estado do emitente e o item chega a
`authorized` com chave de acesso, protocolo e XML armazenado — ou a `rejected` com o cStat
e a orientação em pt-BR devolvidos pelo provider.

### P2 — Agrupar notas no mesmo CT-e

**Given** o perfil está configurado com agrupamento `sender_recipient`
**When** seleciono 10 notas do mesmo remetente para 3 destinatários distintos
**Then** a prévia projeta 3 CT-es, cada um com várias chaves em `infDoc`, `vCarga` igual à
soma dos `vNF` do grupo, peso e volumes somados, e produto predominante do item de maior
valor do grupo.

### P2 — Escolher o perfil manualmente

**Given** uma nota cujo emitente não tem perfil vinculado, ou um caso pontual
**When** abro o diálogo de geração
**Then** posso escolher o perfil manualmente e aplicá-lo à seleção inteira, sobrescrevendo
a resolução automática.

## Requisitos funcionais

### Perfil de emissão

- **RF01** Um perfil pertence a uma empresa e tem `name` único por empresa, `status`
  (`draft|active|inactive`) e `priority` (desempate quando mais de um perfil casa).
- **RF02** `matchMode` ∈ `sender_tax_id | manual`. Em `sender_tax_id`, o perfil declara uma
  ou mais raízes/CNPJs completos vinculados ao **emitente da NF-e** (que vira o `rem` do
  CT-e). Match por CNPJ completo (14 dígitos) tem precedência sobre raiz (8 dígitos).
- **RF03** `groupingMode` ∈ `per_invoice | sender_recipient`, com override no diálogo de
  geração.
- **RF04** Parâmetros de cobrança do **componente principal (frete)**: o perfil aponta para
  uma regra de frete (`freight_rules`) do tipo `percentage_of_invoice_total`, com
  `percentage`, `minimumAmount` (frete mínimo por CT-e), `maximumAmount` e vigência. A
  página de perfis cria e versiona essa regra na mesma transação — o operador vê um
  formulário só.
- **RF04a** **Componentes adicionais livres.** O perfil tem uma lista ordenada de
  componentes, cada um com `label`, `calculationType` ∈ `percentage_of_cargo |
percentage_of_freight | fixed_amount`, `value` e vigência própria. Cada componente vira
  um `<Comp>` no `vPrest` e soma no `vTPrest`. A UI oferece presets — **GRIS**,
  **Ad Valorem/seguro** (percentuais sobre a carga), **Pedágio**, **Despacho**, **TDA** —
  que apenas pré-preenchem um componente livre; não há tipo especial no código.
- **RF04b** **Exceções por UF de destino.** O percentual do frete pode variar conforme a UF
  de destino (ex.: 4,5% dentro de SP, 6% interestadual). Modelado como regra de frete
  adicional com `priority` maior e `freight_rule_versions.filters` contendo
  `{ senderTaxIds, destinationStates }` — o campo jsonb já existe e hoje é sempre `{}`.
  `findApplicableRule` passa a considerar esses filtros.
- **RF04c** **Vigência e reajuste programado.** Toda regra e todo componente têm
  `validFrom`/`validUntil`. Um reajuste futuro é cadastrado como nova versão com
  `validFrom` à frente; o CT-e usa o que estava vigente na **data de emissão da NF-e**.
  Versões futuras aparecem na UI como "reajuste programado".
- **RF04d** O detalhamento da cobrança é persistido por item em `cte_batch_item_charges`
  (`ordinal`, `label`, `calculationType`, `rate`, `baseAmount`, `amount`), que é a fonte
  tanto do `<Comp>` do XML quanto do detalhamento da fatura no módulo `billing`.
- **RF05** Parâmetros fiscais do CT-e, todos configuráveis no perfil:
  `taker` (`toma`: 0 remetente · 1 expedidor · 2 recebedor · 3 destinatário),
  `serviceType` (`tpServ`), `modal` (fixo `01` nesta feature),
  `cfopInternal` / `cfopInterstate` (selecionado pela comparação UF origem × UF destino),
  `operationNature` (`natOp`, ≤ 60 caracteres),
  `receiverIeIndicator` (`indIEToma`: `1|2|9`),
  `pickupIndicator` (`retira`: `0|1`),
  `predominantProductMode` (`highest_value | highest_weight | fixed`) + valor fixo opcional,
  `deliveryDays` (`dPrev` = data de emissão + N dias corridos),
  `chargeComponentLabel` (rótulo do `<Comp><xNome>`, com placeholders `{cliente}` e
  `{percentual}`),
  `observations` (`xObs`),
  `cargoInsuranceDeclared` (emitir `vCargaAverb` = `vCarga`).
- **RF06** O grupo de ICMS é derivado do `taxRegime` do perfil fiscal da empresa: CRT `1`/`2`
  → `ICMSSN` CST `90` com `indSN 1`; CRT `3` → CST configurável (`00|20|40|41|51|60|90`)
  com alíquota e redução de base quando aplicável.
- **RF07** Perfis têm `version` para trava otimista, e alteração de perfil **não** afeta
  CT-es já criados — o item do lote congela o snapshot do perfil aplicado.

### Prévia e criação do lote

- **RF08** `POST /cte-batches/preview` recebe `{documentIds[], emissionProfileId?,
groupingMode?}` e devolve a projeção **sem persistir nada**: por CT-e projetado, as notas
  incluídas, `baseAmount`, `percentage`, `calculatedAmount`, perfil aplicado e origem da
  resolução (`auto` ou `manual`); e a lista de notas bloqueadas com o motivo.
- **RF09** Nota é elegível quando `status='authorized'`, `variant='complete'`,
  `total_value` presente, tem emitente e destinatário com CNPJ e município IBGE, tem ao
  menos um volume com peso, e ainda não está em outro CT-e não cancelado. A duplicidade é
  **bloqueio rígido**, não aviso: a nota some da projeção e aparece na lista de bloqueadas
  com link para o CT-e que já a referencia.
- **RF10** `POST /cte-batches` aceita **até 100 documentos** e cria **um item por CT-e
  projetado** — o comportamento atual de usar só `documentIds[0]` é um defeito e será
  corrigido. O fingerprint de idempotência passa a cobrir a lista inteira, ordenada.
- **RF11** A criação do lote garante o `freight_calculations` de cada nota (reaproveita o
  existente `snapshotted`, ou dispara o cálculo com a regra do perfil), de forma idempotente.
- **RF12** No modo agrupado, o frete continua sendo calculado **por nota** (preserva a
  rastreabilidade nota ↔ valor que o `billing` exige) e o CT-e soma os valores calculados.
  Piso e teto do grupo, quando configurados, entram como ajuste registrado no
  `calculation_snapshot` do item.

### Emissão

- **RF13** No `issue`, a API monta o `CteData` de cada item a partir da NF-e
  (`nfe_documents`, `nfe_participants`, `nfe_addresses`, `nfe_volumes`, `nfe_products`), do
  perfil fiscal da empresa, do perfil de emissão e do cálculo de frete; persiste o payload
  em `cte_issuance_payloads` com hash; e só então enfileira. O worker não recalcula nada.
- **RF14** Mapeamento NF-e → CT-e, conforme o XML de referência:
  | CT-e | Origem |
  |---|---|
  | `emit` | perfil fiscal da empresa (transportadora) |
  | `rem` | `emit` da NF-e |
  | `dest` | `dest` da NF-e |
  | `cMunIni/xMunIni/UFIni` | município do emitente da NF-e |
  | `cMunFim/xMunFim/UFFim` | município do destinatário da NF-e |
  | `infCarga.vCarga` | `total_value` (ou soma, se agrupado) |
  | `infQ` `03/UN` | `nfe_volumes.quantity` somado |
  | `infQ` `01/PESO BRUTO` e `01/PESO LIQUIDO` | `gross_weight` / `net_weight` somados |
  | `proPred` | item de maior `vProd` (ou maior peso / texto fixo, conforme perfil) |
  | `infDoc.infNFe.chave` | `access_key` de cada nota do item |
  | `vPrest.vTPrest` = `vRec` | soma de `cte_batch_item_charges.amount` |
  | `Comp[]` | um por linha de `cte_batch_item_charges`, na ordem do `ordinal` |
- **RF15** Série, próximo número e ambiente vêm de `fiscal_sequences` / perfil fiscal da
  empresa — o `homologation` e a série `1` hardcoded serão removidos.
- **RF16** O worker chama `createFiscalProvider({model:'cte', …}).emit({referenceId, config,
cteData, items: [], payments: [], totalAmount, discountAmount: 0})` e faz write-back:
  `cte_issuance_attempts.status`, `cte_issuance_events`, `cte_fiscal_documents` (chave,
  protocolo, ambiente, série, número, XML no MinIO com sha256) e transição do lote
  (`in_flight → done|error`), que hoje nunca acontece.
- **RF17** Rejeição da SEFAZ grava `cStat` em `last_error_code` e a `errorHint` em pt-BR do
  provider em `last_error_cause`, e o item fica `rejected` com botão de reprocessar.
- **RF18** `GET /cte-batches/:id/items` lista os itens com status, valor, notas vinculadas,
  chave e protocolo. `GET /items/:itemId/documents` passa a funcionar (a dependência
  `listDocuments` não está injetada em `main.ts:275`) e `:itemId` deixa de ser ignorado
  (`drizzle-cte-issuance.repository.ts:72` faz `.limit(1)` sem filtrar por item).

### Ajustes no pacote fiscal (repositório `adatechnology-packages`)

- **RF19** `CteXmlBuilder` precisa parametrizar `retira` e `indIEToma` (hoje hardcoded `0` e
  `9`; o CT-e real de referência usa `1` e `1`) e passar a emitir `vCargaAverb` e o `dPrev`
  dentro de `infDoc/infNFe`. Sem isso o XML não reproduz o documento de referência.

## Requisitos não funcionais

- Dinheiro em `numeric(19,4)` e aritmética inteira; a conversão para `number` acontece
  **apenas** na fronteira do provider (que exige `number`), com arredondamento explícito
  half-up para 2 casas.
- `companyId` sempre do contexto autenticado; todo repositório novo filtra por ele e ganha
  teste em `test/*-schema/tenant-safety.contract.ts`.
- Certificado, senha e XML sensível nunca são logados; o payload persistido não guarda o
  certificado.
- Nenhuma regra ou CNPJ de transportadora específica no código — "Spani" é dado cadastrado,
  não constante.
- Idempotência em toda rota de escrita, com `Idempotency-Key`.
- Emissão só em `homologation` até haver aprovação humana explícita para produção.

## Casos extremos e falhas

- Nota sem perfil resolvido e sem escolha manual → bloqueada na prévia, com motivo.
- Dois perfis casando o mesmo CNPJ → vence a maior `priority`; empate é erro de validação
  no cadastro.
- Nota já vinculada a um CT-e não cancelado → bloqueada (evita duplicidade fiscal).
- NF-e sem volumes ou sem peso → bloqueada (`infCarga` exige `infQ`).
- Emitente ou destinatário sem `cityIbgeCode` → bloqueada.
- Percentual resultando em valor abaixo do piso ou acima do teto → ajuste registrado e
  visível na prévia.
- Certificado A1 vencido ou ausente → `issue` recusado antes de enfileirar.
- Número fiscal reservado e emissão falhando → a reserva não é devolvida; o número fica
  como pulado e é auditável (comportamento já existente em `fiscal_sequence_reservations`).
- SEFAZ fora do ar / timeout → retry com backoff já existente (`cte_retry_schedules`,
  hoje fixo em 3 tentativas / 10s — passa a ser configurável).
- Lote parcialmente autorizado → lote termina em `error` com detalhamento por item; itens
  autorizados permanecem autorizados.

## Critérios de aceite

1. Cadastrar o perfil "Spani" (4,5%, CNPJ 05868574001090, tomador remetente, rótulo
   "Frete Spani 4,5") pela UI e vê-lo resolvido automaticamente ao selecionar uma nota
   daquele emitente.
2. Selecionar a NF-e de referência (`vNF` 958,48) e ver na prévia exatamente
   **R$ 43,13** — o mesmo valor do CT-e autorizado real.
3. O payload montado para essa nota reproduz campo a campo o `infCte` do XML de referência
   (teste golden), exceto os campos que dependem de numeração, data e assinatura.
4. Gerar o lote, transmitir em homologação e ver o item chegar a `authorized` com chave de
   acesso e protocolo, e o XML recuperável por download.
5. Selecionar 10 notas de 3 destinatários com agrupamento `sender_recipient` e obter 3
   CT-es com `vCarga` igual à soma correta.
6. `make check` verde e `evidence.md` com a saída dos testes de cada task.

## Dúvidas

- `[NEEDS CLARIFICATION: o CNPJ 05868574001090 deve casar por CNPJ completo (só essa
filial) ou por raiz 05868574 (todas as filiais Zaragoza/Spani)?]` — assumido: cadastro
  aceita ambos, e o operador escolhe ao vincular.
- `[NEEDS CLARIFICATION: a empresa já tem credenciamento e certificado A1 válido para CT-e
em homologação na SEFAZ-SP?]` — necessário para o critério de aceite 4.
- `[NEEDS CLARIFICATION: piso/teto de frete devem ser aplicados por nota ou por CT-e
agrupado?]` — assumido: por CT-e agrupado, conforme RF12.
