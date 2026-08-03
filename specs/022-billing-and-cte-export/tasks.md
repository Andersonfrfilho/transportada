# Tasks

Feature 022 — Faturamento, exportação e transmissão a partir da tela de CT-es.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato/aceite **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); **teste de isolamento de tenant obrigatório
sempre que a task mexer em query**; task só fecha com evidência em `evidence.md` (comando, saída, o que
prova). Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em teste,
fixture, log ou evidência — fixture nova é derivação anonimizada.

Verificação padrão de toda task de API: `bun run --cwd apps/api-transportada test` + `bun run lint` +
`bun run typecheck` na raiz. De toda task de frontend: `bun run --cwd apps/frontend-transportada test` +
`lint` + `typecheck` + `build`.

## Fase A — Achar, transmitir e agir na tela de CT-es

> 🤖 Modelo: `sonnet`

- [x] T001 Contrato **falhando** do filtro por lista de números na API: `parseCteItemListQuery` aceita
      `cteNumberIn` e `invoiceNumberIn` com lista de inteiros positivos, rejeita lista vazia, valor não
      numérico e lista acima do teto; combinar `In` com `Gte`/`Lte` é erro de validação. Dependências:
      nenhuma. Sucesso: teste vermelho por parâmetro desconhecido.

- [x] T002 Implementar `cteNumberIn`/`invoiceNumberIn` no schema e no
      `drizzle-cte-batch-item.repository.ts` (`inArray`), preservando o filtro por faixa. **Mexe em
      query → estender `test/*-schema/tenant-safety.contract.ts` provando que a lista continua presa ao
      `companyId` do contexto.** Dependências: T001. Sucesso: T001 verde + tenant safety verde.

- [x] T003 Contrato **falhando** do campo de busca por número no frontend: `parseNumberQuery` traduz
      `14093` em valor exato, `14093,14095` em lista, `14093-14150` em faixa, ignora espaços, rejeita
      texto; `serializeCteItemQuery` emite `cteNumberIn` para lista/exato e `cteNumberGte`/`Lte` para
      faixa; `countActiveCteItemFilters` conta cada campo como um. Dependências: T002.

- [x] T004 Trocar os quatro campos `…From`/`…To` por dois campos de busca em `CteItemFilters`, com o
      parser em `cteBatchItemTable.service.ts` e os rótulos nos locales pt/en. Dependências: T003.
      Sucesso: T003 verde + gates de frontend.

- [x] T005 Contrato **falhando** da transmissão a partir da seleção: `groupSelectionByBatch` agrupa os
      CT-es selecionados por `batchId`; a ação só habilita quando **todos** os lotes envolvidos estão em
      status transmissível e o usuário tem `cte.submit`; o rótulo informa a contagem de lotes; a barra de
      seleção renderiza a ação. Dependências: T004.

- [x] T006 Ligar a ação na `CteItemSelectionBar` chamando `POST /cte-batches/:id/issue` uma vez por lote
      envolvido, invalidando a listagem ao fim. Sem rota nova. Dependências: T005. Sucesso: T005 verde +
      gates + verificação no navegador real.

## Fase B — Faturas geradas

> 🤖 Modelo: `sonnet`

- [x] T007 Contrato **falhando** de `GET /billing/invoices`: cursor, filtro por status, período de
      emissão, período de vencimento, tomador e número da fatura; ordenação estável; policy
      `billing.read`. Dependências: nenhuma.

- [x] T008 Implementar a rota, o `list` no use-case e no `drizzle-billing.repository.ts`. **Mexe em
      query → teste de isolamento de tenant obrigatório.** Dependências: T007.

- [x] T009 Contrato **falhando** da tela: o workspace de faturamento tem duas abas usando o `Tabs` do
      design system; a tabela de faturas segue `docs/frontend/data-tables.md` (ordenação, filtros,
      colunas persistidas, seleção); os locales pt/en expõem as chaves novas. Dependências: T008.

- [x] T010 Implementar as abas, a tabela e o client/validation de listagem. Dependências: T009. Sucesso:
      T009 verde + gates + navegador real.

## Fase C — PDF da fatura

> 🤖 Modelo: `sonnet` (T011, T017 e T018 são 🧠 — rodar com `opus`)

- [x] T011 🧠 **Spike** de `pdfkit` sob Bun 1.3.14: gerar um PDF de uma página com texto, tabela e
      quebra, conferir bytes e cabeçalho `%PDF`. Se falhar duas vezes, trocar por `pdf-lib` e registrar
      a troca aqui. Dependências: nenhuma. Sucesso: PDF válido gerado em teste, decisão registrada.

- [x] T012 Contrato **falhando** do valor por extenso: centavos, singular/plural, zero, milhar, milhão,
      valor com centavos zerados; entrada é inteiro escalado, nunca float. Dependências: nenhuma.

- [x] T013 Implementar `invoice-amount-in-words.service.ts` em `billing/domain/`. Dependências: T012.

- [x] T014 Contrato **falhando** da consulta do relatório: para cada item da fatura devolve emissão,
      número e série do CT-e, CNPJ e nome do destinatário, número/série da NF-e, peso bruto, peso líquido
      e valor; nota sem `<vol>` devolve peso zero em vez de quebrar. Dependências: nenhuma.

- [x] T015 Implementar `invoice-report.query.ts` juntando `nfe_participants`, `nfe_addresses` e
      `nfe_volumes`. **Mexe em query → teste de isolamento de tenant obrigatório.** Dependências: T014.

- [x] T016 Contrato **falhando** do layout: fatura curta gera uma página; fatura longa quebra repetindo
      cabeçalho da transportadora, bloco da fatura e cabeçalho da tabela, com `Página X de Y`; a soma das
      linhas bate com o total; empresa sem perfil fiscal falha com erro de domínio nomeado.
      Dependências: T011, T013, T015.

- [x] T017 🧠 Implementar `invoice-pdf.gateway.ts` e `invoice-layout.policy.ts` — uma linha por CT-e,
      cabeçalho do `company_fiscal_profiles`, blocos de fatura/tomador/observações e rodapé com data de
      impressão. Dependências: T016.

- [x] T018 🧠 Contrato **falhando** + implementação de `POST /billing/invoices/:id/documents`: arquiva no
      storage com `sha256`, registra em `billing_invoice_documents`, emite `document_generated`, falha
      emite `document_failed`, repetir a chamada devolve o documento já arquivado sem duplicar, e
      `GET …/documents` passa a devolver URL assinada real. Dependências: T017.

- [x] T019 Contrato **falhando** + implementação da ação de gerar/baixar o PDF na listagem de faturas,
      com estado de carregamento e tratamento de erro por código. Dependências: T018, T010. Sucesso:
      gates + PDF real aberto no navegador.

## Fase D — Exportar XML por filtro

> 🤖 Modelo: `sonnet` (T021 é 🧠 — rodar com `opus`)

- [x] T020 Contrato **falhando** de `POST /cte-batches/items/export`: aceita os mesmos filtros da
      listagem; só entra item `authorized` com chave de acesso; acima do teto responde 422 com código
      estável; filtro sem nenhum item autorizado responde 422; nome de cada entrada do ZIP é a chave de
      acesso. **Mexe em query → teste de isolamento de tenant obrigatório.** Dependências: nenhuma.

- [x] T021 🧠 Implementar o use-case e o `cte-archive.gateway.ts` montando o ZIP com `fflate` sobre os
      objetos do storage, em stream, sem carregar a coleção inteira de uma vez. Dependências: T020.

- [x] T022 Contrato **falhando** + implementação das ações no frontend: exportar a seleção na barra e
      exportar tudo que o filtro alcança no painel de filtros, com contagem no rótulo e erro tratado por
      código. Dependências: T021, T004. Sucesso: gates + download real no navegador.
