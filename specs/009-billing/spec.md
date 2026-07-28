# Feature 009 — Faturamento

## Problema e resultado

O TransportAdA ja consegue importar NF-e, calcular frete, criar lotes,
homologar emissao CT-e e acompanhar autorizacoes, rejeicoes e retries. A lacuna
atual do MVP e transformar CT-e autorizados em cobranca rastreavel: selecionar
documentos elegiveis, gerar faturas tenant-scoped, consolidar totais com
precisao decimal, disponibilizar PDF/exportacao e permitir cancelamento seguro
sem alterar historico fiscal.

O resultado desta feature e permitir que uma empresa:

1. filtre e selecione CT-e autorizados ainda nao faturados;
2. gere uma fatura imutavel com itens, totais, vencimento e snapshot financeiro;
3. consulte faturas e itens sem expor XML fiscal ou dados de outro tenant;
4. exporte PDF e arquivo operacional seguro;
5. cancele fatura sem apagar CT-e, eventos ou documentos fiscais;
6. acompanhe status e erros de faturamento no frontend.

## Premissas

- Somente CT-e autorizados e pertencentes ao `companyId` autenticado sao
  faturaveis.
- O valor faturado vem do snapshot fiscal/comercial ja persistido no fluxo de
  frete e CT-e, sem recalculo flutuante no momento da fatura.
- Dinheiro usa `numeric`/decimal canonico, nunca ponto flutuante binario.
- PDF e exportacoes nao incluem XML fiscal, certificados, storage keys internos
  ou payloads SEFAZ.
- Fatura cancelada preserva historico, itens, totais e eventos; CT-e voltam a
  ficar elegiveis somente quando regra explicita permitir.
- Envio por e-mail e integracao financeira externa ficam preparados, mas fora do
  escopo executavel inicial.

## Fora do escopo

- Emissao fiscal de NFS-e ou boleto.
- Contas a receber completo, baixa financeira, conciliacao bancaria e remessa
  CNAB.
- Envio automatico de e-mail para cliente.
- Portal externo do cliente.
- Regras tributarias de faturamento por municipio ou regime especial.
- Cancelamento fiscal do CT-e; esta feature cancela apenas a fatura operacional.

## Historias priorizadas

### P1 — Selecionar CT-e autorizados para faturar

**Historia:** Como operador financeiro, quero listar CT-e autorizados e ainda
nao faturados para montar uma fatura sem risco de duplicidade.

1. **WHEN** usuario consulta documentos faturaveis **THEN** a API retorna apenas
   CT-e autorizados do `companyId` autenticado e sem fatura ativa.
2. **WHEN** usuario informa filtros **THEN** status, cliente/tomador, periodo,
   lote, numero CT-e, valor e vencimento sao validados no backend.
3. **WHEN** CT-e ja estiver em fatura ativa **THEN** ele nao aparece como
   elegivel e nao pode ser selecionado novamente.
4. **WHEN** usuario de outro tenant tentar consultar ou selecionar documento
   **THEN** recebe ausencia segura indistinguivel.

### P1 — Gerar fatura imutavel

**Historia:** Como operador financeiro, quero gerar uma fatura a partir dos CT-e
selecionados para cobrar o cliente com total auditavel.

1. **WHEN** fatura e criada **THEN** todos os itens, valores, tomador, datas e
   snapshots sao persistidos na mesma transacao.
2. **WHEN** ha duplicidade de idempotency key com mesmo fingerprint **THEN** a
   API retorna replay seguro sem criar nova fatura.
3. **WHEN** idempotency key diverge em payload **THEN** a API retorna conflito
   seguro sem detalhes sensiveis.
4. **WHEN** um item deixa de ser elegivel durante a transacao **THEN** a criacao
   falha sem fatura parcial.

### P1 — Consultar faturas e exportar documentos seguros

**Historia:** Como financeiro, quero consultar faturas geradas e baixar PDF ou
exportacao operacional sem expor XML fiscal.

1. **WHEN** usuario lista faturas **THEN** a API retorna resumo paginado com
   status, total, quantidade de itens e datas.
2. **WHEN** usuario abre detalhe **THEN** recebe itens e metadados de CT-e
   necessarios para conferencia, sem XML, storage key ou payload fiscal bruto.
3. **WHEN** usuario solicita PDF **THEN** o sistema gera ou retorna documento com
   URL temporaria e hash verificavel.
4. **WHEN** exportacao operacional for solicitada **THEN** o arquivo contem dados
   financeiros e fiscais permitidos, sem segredos nem XML completo.

### P2 — Cancelar fatura operacionalmente

**Historia:** Como gerente financeiro, quero cancelar uma fatura criada por erro
para preservar historico e liberar correcao controlada.

1. **WHEN** fatura aberta for cancelada **THEN** status muda para `cancelled`,
   evento append-only e motivo sanitizado sao registrados.
2. **WHEN** fatura ja cancelada for cancelada novamente **THEN** a API retorna
   replay idempotente.
3. **WHEN** fatura estiver em estado futuro bloqueante **THEN** cancelamento
   retorna conflito seguro.
4. **WHEN** usuario sem permissao financeira tentar cancelar **THEN** autorizacao
   nega antes do parse do payload.

## Requisitos funcionais

| ID      | Requisito                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------- |
| BIL-001 | Listagem de elegibilidade deve incluir somente CT-e autorizados, tenant-scoped e sem fatura ativa. |
| BIL-002 | Criacao de fatura deve ser transacional, idempotente e sem fatura parcial.                         |
| BIL-003 | Valores monetarios devem usar decimal canonico e snapshots imutaveis.                              |
| BIL-004 | Fatura deve possuir numero tenant-scoped, status, vencimento, tomador e totais persistidos.        |
| BIL-005 | Itens de fatura devem referenciar CT-e/documentos autorizados por FK tenant-scoped.                |
| BIL-006 | Uma fatura ativa impede refaturamento do mesmo CT-e.                                               |
| BIL-007 | Cancelamento deve preservar historico e registrar evento append-only.                              |
| BIL-008 | APIs devem aplicar RBAC antes do parse de payload e manter anti-enumeracao cross-tenant.           |
| BIL-009 | PDF/exportacao usam URLs temporarias e nunca expõem XML, storage key, certificado ou token.        |
| BIL-010 | Frontend deve permitir selecionar, revisar, gerar, consultar e cancelar faturas com no-store.      |
| BIL-011 | Logs e erros devem ser sanitizados e correlacionaveis por fatura, CT-e, usuario e companyId.       |
| BIL-012 | Evidencia da feature deve provar typecheck, lint, testes, migration-test, smoke e isolamento.      |

## Requisitos nao funcionais

- Consultas devem ser paginadas com cursor estavel e limites validados.
- Conflitos de concorrencia devem ser resolvidos por constraints e transacoes,
  nao por estado em memoria.
- Migrations sao aditivas, reversiveis por rollback manual e compatíveis com
  banco vazio/baseline.
- API deve usar `Cache-Control: no-store` em rotas autenticadas de faturamento.
- Testes negativos multiempresa sao obrigatorios em schema, aplicacao e HTTP.
- PDF/exportacao devem ser reprodutiveis ou rastreados por hash e versao.

## Casos extremos e falhas

- Dois usuarios tentando faturar o mesmo CT-e simultaneamente.
- CT-e autorizado fica indisponivel ou e cancelado fiscalmente em feature futura.
- Payload de criacao mistura CT-e de tomadores diferentes quando regra exigir
  uma fatura por tomador.
- Vencimento invalido, anterior a emissao ou fora de politica configurada.
- Valor total divergente da soma dos itens.
- Storage indisponivel durante geracao de PDF.
- Usuario perde permissao entre listagem e criacao.
- Cursor adulterado em listagens.

## Criterios de aceite

- Given CT-e autorizados nao faturados, when usuario financeiro lista elegiveis,
  then recebe apenas documentos do tenant autenticado e com filtros validados.
- Given dois usuarios selecionam o mesmo CT-e, when ambos tentam criar fatura,
  then apenas uma fatura ativa e persistida e a outra operacao falha com
  conflito seguro.
- Given idempotency key repetida com payload igual, when cria fatura novamente,
  then recebe a fatura original sem duplicar numero, itens ou eventos.
- Given fatura criada, when usuario consulta detalhe, then ve itens, totais e
  metadados seguros sem XML fiscal.
- Given fatura aberta, when gerente cancela com motivo valido, then status,
  evento e auditoria sao registrados sem apagar itens.
- Given usuario de outro tenant, when consulta fatura, item ou exportacao, then
  recebe ausencia segura.

## Duvidas

Nenhuma duvida bloqueante para iniciar contracts e schema. Politicas comerciais
mais especificas, como uma fatura por tomador, vencimento padrao por cliente,
forma de pagamento e envio por e-mail, ficam parametrizadas ou adiadas para
subfeatures futuras.
