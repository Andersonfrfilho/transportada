# Feature 022 — Faturamento, exportação e transmissão a partir da tela de CT-es

## Problema e resultado

A tela **CT-es da empresa** já lista todos os CT-es da transportadora com filtros, ordenação, colunas
configuráveis e seleção em massa com soma decimal. Mas ela é só leitura: dali não se transmite, não se
fatura e não se exporta nada. Quem quer agir precisa voltar para a aba **Lotes**, abrir o lote certo e
trabalhar item a item — o que só faz sentido enquanto o lote é a unidade de trabalho, e ele não é: a
unidade de trabalho do operador é o CT-e.

Do lado do faturamento, o módulo `billing` já sabe criar fatura a partir de uma seleção de CT-es
autorizados, com tomador único, numeração sequencial por empresa, itens, eventos e cancelamento. O que
falta é tudo que vem **depois** de criar: não há como listar as faturas já geradas (só buscar uma por
id) e não há **nenhum** código que produza documento — as tabelas `billing_invoice_documents`
(`pdf`/`csv`/`json`) e os eventos `document_generated`/`document_failed` existem vazios, e não há
biblioteca de PDF em nenhuma app.

Por fim, XML de CT-e autorizado só sai um a um, pelo painel do lote. Não há como pegar "todos os CT-es
que este filtro mostra" de uma vez, que é o formato em que o contador pede.

**Resultado esperado:** a tela de CT-es vira o lugar onde o operador acha o CT-e (por número, por nota),
transmite, fatura e exporta; e a fatura gerada tem listagem própria e um PDF com o layout que a
transportadora já usa hoje.

## Fora de escopo

- Mudar a regra fiscal de emissão, o cálculo de frete ou o conteúdo do XML do CT-e.
- Mudar a regra de tomador único por fatura, a numeração sequencial ou o cancelamento — já existem e
  continuam como estão.
- Emitir fatura fiscal eletrônica (NFS-e) ou qualquer documento com valor fiscal próprio. O PDF desta
  feature é **relatório de cobrança**, não documento fiscal.
- Boleto, remessa/retorno bancário, baixa de pagamento e régua de inadimplência.
- Exportar XML de NF-e (só CT-e) e exportar DACTE em PDF.
- Transmitir CT-e de lote que ainda está em `draft` — submeter continua sendo passo à parte.

## Decisões tomadas

| Questão                              | Decisão                                                                                                                                 | Consequência                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Buscar CT-e/nota por número          | Um campo por entidade aceitando valor exato, lista (`14093,14095`) e faixa (`14093-14150`); a API ganha `cteNumberIn`/`invoiceNumberIn` | Os campos `…From`/`…To` atuais saem da UI; a query continua aceitando `Gte`/`Lte`, que é o que a faixa gera. Nada quebra na API existente. |
| Transmitir a partir da tela de CT-es | Agrupa a seleção por `batchId` e chama `POST /cte-batches/:id/issue` uma vez por lote envolvido                                         | Zero rota nova. A ação só habilita se **todos** os lotes envolvidos estiverem transmissíveis, e o rótulo diz quantos lotes serão afetados. |
| Listagem de faturas                  | `GET /billing/invoices` com cursor, espelhando o padrão de `eligible-ctes`                                                              | A tela de faturamento ganha abas: "Gerar fatura" (atual) e "Faturas geradas".                                                              |
| Quem gera o PDF                      | A própria API, com `pdfkit`, sob demanda em `POST /billing/invoices/:id/documents`                                                      | Encaixa nas tabelas e eventos que já existem; o `GET …/documents` atual passa a devolver URL assinada de verdade. Nova dependência.        |
| Onde o PDF é arquivado               | MinIO pelo mesmo gateway de storage, com `sha256` e registro em `billing_invoice_documents`                                             | O PDF é reproduzível e auditável depois; o download reusa `createDownloadUrl`, que já existe.                                              |
| De onde vêm os dados do cabeçalho    | `company_fiscal_profiles` (razão social, fantasia, CNPJ, IE, endereço, telefone, e-mail)                                                | Nada de dado de transportadora hard-coded. Empresa sem perfil fiscal não gera PDF — erro de domínio explícito.                             |
| De onde vêm peso e destinatário      | Consulta no momento de gerar, juntando `nfe_participants`, `nfe_addresses` e `nfe_volumes`                                              | Dado fiscal autorizado é imutável, então não precisa de snapshot novo. Nota sem `<vol>` sai com peso zero, não quebra a geração.           |
| Densidade da tabela do PDF           | Uma linha por CT-e, com número/série da NF-e na mesma linha                                                                             | O modelo atual gasta duas linhas por CT-e e estoura para 3 páginas com ~90 CT-es; em uma linha cabem ~45 por página.                       |
| Quando o PDF passa de uma página     | Quebra automática repetindo cabeçalho da transportadora, bloco da fatura e cabeçalho da tabela, com `Página X de Y`                     | Atende "tentar deixar tudo em uma página, se não separar em mais" sem inventar limite artificial de itens por fatura.                      |
| Observações da fatura                | Campo `observations` opcional no `POST /billing/invoices`, com sugestão montada do período dos CT-es + dados bancários do perfil fiscal | O texto de dados bancários/PIX/referência não fica preso no código; o operador edita antes de gerar.                                       |
| Exportação de XML                    | `POST /cte-batches/items/export` recebendo os mesmos filtros da listagem e devolvendo um ZIP em stream                                  | Um clique exporta exatamente o que o filtro mostra. Só entram itens autorizados com chave de acesso.                                       |
| Limite da exportação                 | Teto duro de itens por exportação; acima disso a API responde 422 pedindo filtro mais estreito                                          | Evita segurar o event loop com um ZIP gigante sem precisar criar trilha de mensageria nova só para isso.                                   |
| Valor por extenso                    | Função pura em `billing/domain/`, sobre inteiro escalado                                                                                | Dinheiro nunca vira float binário, nem para escrever por extenso.                                                                          |

## Critérios de aceite

**Tela de CT-es da empresa**

- O painel de filtros tem um campo de número de CT-e e um de número de nota que aceitam valor exato,
  lista separada por vírgula e faixa com hífen; o contador de filtros ativos conta cada um como um.
- Com CT-es selecionados de lotes transmissíveis, a barra de seleção mostra a ação de transmitir,
  dizendo quantos lotes serão afetados; se algum lote da seleção não puder ser transmitido, a ação fica
  desabilitada com o motivo.
- A barra de seleção oferece exportar XML da seleção e o painel de filtros oferece exportar tudo que o
  filtro alcança.

**Faturas**

- `GET /billing/invoices` lista faturas da empresa autenticada, com cursor, filtro por status, período
  de emissão, período de vencimento, tomador e número da fatura, e nunca devolve fatura de outra
  empresa.
- A tela de faturamento tem duas abas; "Faturas geradas" lista número, tomador, emissão, vencimento,
  quantidade de CT-es, total e situação, com ordenação e filtros.
- A partir da listagem dá para gerar/baixar o PDF e cancelar uma fatura emitida.

**PDF**

- `POST /billing/invoices/:id/documents` produz o PDF, arquiva no storage com `sha256`, registra em
  `billing_invoice_documents` e emite o evento `document_generated`; falha registra `document_failed`.
- Repetir a chamada não duplica documento — a mesma fatura devolve o documento já arquivado.
- O PDF traz: cabeçalho da transportadora vindo do perfil fiscal, bloco da fatura (número, emissão,
  vencimento, total e valor por extenso), bloco do tomador, observações, tabela de CT-es com emissão,
  número, série, CNPJ e nome do destinatário, número/série da NF-e, peso bruto, peso líquido e valor, e
  rodapé com identificação e data de impressão.
- Fatura que caiba em uma página gera uma página; acima disso quebra repetindo cabeçalhos, e a soma dos
  valores das linhas bate com o total da fatura.

**Exportação de XML**

- A exportação devolve um ZIP com um XML por CT-e autorizado alcançado pelo filtro, nomeado pela chave
  de acesso, e nenhum item de outra empresa.
- Acima do teto, a resposta é 422 com código estável, sem gerar arquivo.
- Filtro que não alcança nenhum CT-e autorizado responde 422, não um ZIP vazio.

**Transversais**

- Todo repositório novo recebe `companyId` do contexto autenticado e tem teste de isolamento de tenant.
- Nenhum CNPJ, IE, chave de acesso, razão social real ou XML fiscal em teste, fixture, log ou evidência.
- Dinheiro em `Decimal`/`numeric` do começo ao fim, inclusive na soma do PDF e no valor por extenso.
