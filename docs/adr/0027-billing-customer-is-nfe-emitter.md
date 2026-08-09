# ADR 0027 — Cliente da fatura é o emitente da NF-e, não o destinatário

- Status: aceito
- Data: 2026-08-09
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

O botão "Gerar fatura" aparecia travado com o aviso "A seleção mistura 2 clientes"
ao selecionar dois CT-e autorizados do mesmo embarcador. O aviso estava correto
para a regra implementada e errado para o negócio.

As consultas de faturamento derivavam o cliente do participante `recipient` da
NF-e — o destinatário da carga. Num embarque típico de distribuição, um único
embarcador emite dezenas de notas para dezenas de pontos de entrega. Pela regra
antiga, cada ponto de entrega virava um "cliente" diferente, e a listagem
elegível ficava impossível de agrupar: qualquer seleção com mais de uma entrega
desabilitava a geração da fatura.

Quem paga o frete nessa operação é o embarcador, que é o emitente das notas. É
também o tomador do CT-e (`toma3/toma = 0`, remetente), coerente com
`cte-receiver-ie.policy.ts`, que já resolve o pagador a partir do `taker` do
perfil de emissão.

O tomador efetivo, porém, **não é persistido**: nem `cte_batch_items` nem
`cte_fiscal_documents` carregam `profileId` ou `taker`. O perfil é resolvido no
momento da emissão e descartado. Faturar "pelo tomador de verdade" exigiria uma
migration e reprocessamento do histórico.

## Decisão

1. O cliente da fatura é o participante `emitter` da NF-e vinculada ao item do
   lote de CT-e.
2. O papel vive numa constante exportada única,
   `BILLING_CUSTOMER_PARTICIPANT_ROLE` em
   `billing/infrastructure/eligible-cte.query.ts`, e o join sai de
   `buildBillingCustomerJoin()`. Os dois consumidores —
   `findBillingPreviewByIds` e `queryEligibleCtes` — usam o mesmo seam; nenhum
   repositório repete o literal.
3. O join carrega `company_id` além de `document_id`, como o join da nota: o
   papel sozinho cruzaria tenants.
4. O relatório da fatura (`invoice-report.query.ts`) **continua** lendo
   `recipient`. Ali o destinatário é o dado certo: é a coluna por linha de CT-e,
   que mostra para onde cada carga foi. O cliente do cabeçalho vem de
   `billing_invoices.customer_name` / `customer_document`, gravados na criação.
5. `emitter` é o vocabulário persistido na importação
   (`nfe-participant-role.constant.ts`, no worker). `sender` pertence a outro
   namespace — os matchers de perfil de emissão
   (`CTE_EMISSION_MATCH_ROLES = ['sender', 'recipient']`) — e não existe em
   `nfe_participants`.

## Alternativas rejeitadas

- **Persistir o `taker` do perfil no CT-e emitido e faturar por ele.** É a
  solução correta a longo prazo e permanece como follow-up. Rejeitada agora
  porque exige migration, backfill de histórico sem fonte confiável (o perfil
  usado na emissão não foi registrado) e não destrava o usuário hoje.
- **Configuração por empresa escolhendo o participante do faturamento.** Mais
  uma chave de configuração para um dado que já existe no perfil de emissão —
  duas fontes da verdade para a mesma pergunta, com risco de divergirem.

## Consequências

- Seleções do mesmo embarcador com muitas entregas passam a ser um cliente só, e
  a fatura é gerada.
- **Fica errado numa instalação cujo perfil use `taker = '3'` (destinatário paga
  o frete).** O produto suporta esse cenário na emissão do CT-e, mas o
  faturamento passa a assumir o remetente incondicionalmente. Limitação aceita
  explicitamente; o follow-up do `taker` persistido é o que a remove.
- **Faturas já criadas não são corrigidas retroativamente.** Elas guardam o
  destinatário em `customer_name` / `customer_document` e continuam assim. Só
  o que for faturado a partir daqui usa o emitente.
- Trocar o papel é uma linha, num lugar só, coberta por contrato.

## Segurança e rollback

O join preserva o recorte de tenant (`nfe_participants.company_id =
cte_batch_items.company_id`); nenhuma consulta passou a alcançar dado de outra
empresa. `companyId` continua vindo do contexto autenticado.

Contratos que guardam a decisão:

- `test/billing-schema/eligible-query-tenant-safety.contract.ts` — o join compila
  com o papel `emitter`, nunca `recipient`, e carrega `company_id`.
- `test/integration/billing-repository.integration.ts` — a fixture semeia os dois
  participantes na mesma nota, para o agrupamento provar que vem do emitente.

Rollback é reverter o commit: o valor da constante volta a `recipient` e as duas
consultas seguem o seam. Não há migration nem dado gravado por esta mudança.
