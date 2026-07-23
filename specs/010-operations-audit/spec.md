# Feature 010 — Painel operacional e auditoria

## Problema e resultado

O TransportAdA ja cobre o fluxo operacional do MVP: NF-e, frete, lote CT-e,
homologacao CT-e e faturamento. A lacuna agora e dar visibilidade transversal
para operadores e gestores acompanharem processamento, falhas, retries,
documentos, faturas e eventos auditaveis sem precisar consultar cada modulo
isoladamente.

O resultado desta feature e permitir que uma empresa:

1. visualize um painel autenticado com status operacional por modulo;
2. acompanhe jobs, retries, dead letters e ultimos erros sanitizados;
3. consulte uma timeline ponta a ponta por NF-e, lote CT-e, CT-e e fatura;
4. veja trilha de auditoria tenant-scoped para acoes criticas;
5. receba indicadores de saude operacional sem exposicao de XML, tokens,
   certificados, storage keys ou payload fiscal bruto;
6. use polling controlado no MVP, mantendo extensao futura para SSE.

## Premissas

- Toda consulta deriva `companyId` do contexto autenticado.
- Auditoria e processamento sao leitura operacional; esta feature nao altera
  regras fiscais, financeiras ou de elegibilidade.
- Logs, respostas e eventos publicos sao sanitizados.
- Polling controlado atende o MVP; SSE fica preparado quando a infraestrutura
  de eventos estiver madura.
- Dados agregados devem ser paginados, limitados e seguros para tenants com
  volume maior.

## Fora do escopo

- Observabilidade externa completa com Grafana, OpenTelemetry gerenciado ou
  alertas pagos.
- Deploy Railway, promocao para production ou criacao de recursos cloud.
- Cancelamento fiscal, reprocessamento financeiro novo ou liberacao de CT-e para
  refaturamento.
- Portal publico do cliente, aplicativo de motorista e rastreamento em tempo
  real.
- Edicao manual de eventos de auditoria ou correcao direta de banco pela UI.

## Historias priorizadas

### P1 — Painel operacional por empresa

**Historia:** Como gestor operacional, quero ver um resumo dos fluxos do tenant
para identificar rapidamente pendencias e falhas.

1. **WHEN** usuario autorizado abre o painel **THEN** ve contadores por status
   de importacao NF-e, frete, lote CT-e, emissao CT-e e faturamento.
2. **WHEN** existem erros recentes **THEN** o painel exibe mensagem sanitizada,
   codigo, modulo, data e correlation id, sem detalhes sensiveis.
3. **WHEN** usuario troca filtros de periodo/modulo/status **THEN** a API valida
   filtros no backend e retorna apenas dados do tenant autenticado.

### P1 — Timeline ponta a ponta

**Historia:** Como operador, quero consultar a jornada de um documento ou fatura
para entender onde esta parado.

1. **WHEN** usuario consulta por identificador permitido **THEN** recebe eventos
   ordenados por tempo e agrupados por entidade relacionada.
2. **WHEN** entidade pertence a outro tenant **THEN** a resposta e ausencia
   segura, sem confirmar existencia.
3. **WHEN** evento contem payload fiscal, XML, certificado, token ou storage key
   **THEN** a resposta exposta omite esses campos e retorna apenas metadados
   seguros.

### P1 — Auditoria de acoes criticas

**Historia:** Como administrador, quero auditar quem executou acoes sensiveis
para investigar mudancas e cumprir rastreabilidade.

1. **WHEN** usuario consulta auditoria **THEN** recebe eventos append-only com
   ator, permissao, acao, alvo, data, correlation id e resultado.
2. **WHEN** usuario sem `audit.read` tenta consultar auditoria **THEN** a API
   nega antes de processar filtros complexos.
3. **WHEN** auditoria contem motivo ou erro informado por usuario **THEN** o
   texto e sanitizado e limitado.

### P2 — Status de jobs e retries

**Historia:** Como operador tecnico, quero ver jobs pendentes, em retry e dead
letter para priorizar reprocessamentos seguros.

1. **WHEN** job esta em retry **THEN** a UI mostra proxima tentativa, quantidade
   de tentativas e codigo de erro seguro.
2. **WHEN** job esta em dead letter **THEN** a UI destaca acao manual necessaria
   sem executar reprocessamento automaticamente.
3. **WHEN** usuario sem permissao operacional acessa jobs **THEN** ve boundary
   fechado e nenhum dado sensivel.

## Requisitos funcionais

| ID      | Requisito                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------- |
| OPA-001 | Painel deve agregar status tenant-scoped de NF-e, frete, lote CT-e, emissao CT-e e faturamento.   |
| OPA-002 | API deve fornecer filtros validados por periodo, modulo, status, entidade e correlation id.       |
| OPA-003 | Timeline deve retornar eventos ordenados e relacionados sem expor XML, storage key ou segredos.   |
| OPA-004 | Auditoria deve ser append-only, paginada e consultavel apenas com permissao `audit.read`.         |
| OPA-005 | Status de jobs deve expor tentativa, proxima execucao, erro seguro e estado sem payload sensivel. |
| OPA-006 | Frontend deve oferecer painel, filtros, timeline, auditoria e boundaries responsivos.             |
| OPA-007 | Respostas autenticadas devem usar `Cache-Control: no-store`.                                      |
| OPA-008 | Consultas cross-tenant devem retornar ausencia segura e nunca misturar dados entre empresas.      |
| OPA-009 | Polling deve ser controlado, cancelavel e sem sobrecarregar API local ou production futura.       |
| OPA-010 | Evidencia deve provar typecheck, lint, tests, smoke, diffcheck e revisao de vazamento sensivel.   |

## Requisitos nao funcionais

- Consultas devem ser paginadas por cursor e limitadas por teto seguro.
- Agregacoes devem usar indices por `companyId`, status e data.
- Erros de integrações externas devem ser normalizados antes de chegar a API.
- UI deve ser operacional, densa, responsiva e consistente com o frontend atual.
- Nenhum modulo deve importar codigo-fonte de outra aplicacao.
- A feature deve ser compatível com polling agora e SSE depois, sem reescrever
  os contratos principais.

## Casos extremos e falhas

- Job em retry com backoff expirado e worker parado.
- Entidade removida logicamente, mas com eventos historicos preservados.
- Usuario consulta correlation id valido de outro tenant.
- Evento legado sem todos os metadados novos.
- Auditoria com texto de erro contendo XML ou token.
- Pagina com milhares de eventos em curto periodo.
- Frontend perde permissao durante polling.

## Criterios de aceite

- Given usuario autorizado, when abre painel, then ve resumo tenant-scoped dos
  modulos do MVP com status e erros seguros.
- Given documento ou fatura existente, when consulta timeline, then recebe
  eventos ordenados e sem payload sensivel.
- Given usuario sem `audit.read`, when consulta auditoria, then autorizacao nega
  antes de parsear filtros complexos.
- Given dois tenants com eventos parecidos, when consultam dashboard e timeline,
  then cada um ve apenas dados da propria empresa.
- Given job em retry/dead letter, when painel operacional carrega, then mostra
  estado, tentativa e proxima acao sem executar efeito externo.
- Given smoke responsivo, when roda em 375, 768 e 1280 px, then painel,
  timeline e boundaries nao possuem overflow horizontal.

## Duvidas

Nenhuma duvida bloqueante para iniciar contracts. A decisao entre polling e SSE
fica como design extensivel: a primeira entrega usa polling controlado e deixa
SSE para uma subfeature ou hardening posterior.
