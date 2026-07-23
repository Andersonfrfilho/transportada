# ADR-0010: Homologação CT-e via worker e gateway fiscal

## Contexto

A feature `007-cte-batch` entrega lote, itens, submissão idempotente e consulta
de status, mas ainda não executa emissão fiscal real. A fase 6 do plano de
entrega exige homologação CT-e com pacote Ada, classificação de rejeição/retry e
preservação de XML/protocolo.

Operações fiscais possuem efeitos externos, usam certificado A1, reservam
numeração e podem retornar timeout, rejeição SEFAZ ou status desconhecido. Por
isso, elas precisam de processamento recuperável, idempotente e auditável.

## Decisão

Criar a feature `008-cte-homologation` com emissão CT-e assíncrona via worker e
gateway interno, com as seguintes decisões:

- HTTP agenda emissão/reprocessamento e consulta status, mas não chama SEFAZ
  diretamente;
- worker processa item a item com ack pós-commit, retry persistido e DLQ;
- gateway fiscal adapta somente exports públicos de
  `@adatechnology/fiscal-provider`;
- produção fica bloqueada por gate manual futuro; esta feature habilita apenas
  homologação controlada;
- XML assinado/autorizado, protocolo e hashes ficam em storage create-only;
- eventos, attempts e documentos fiscais são append-only e tenant-scoped;
- reentrega de mensagens e retries usam idempotência persistente para não emitir
  duplicidade fiscal.

## Consequências

- aumenta a quantidade de estado persistido para attempts, documentos e eventos
  fiscais;
- o worker passa a depender diretamente do gateway fiscal CT-e e de storage para
  concluir item autorizado;
- timeout após chamada fiscal exige estado de reconciliação ou retry
  conservador antes de nova emissão;
- as tarefas críticas de fiscal, certificado, numeração, storage e concorrência
  devem ser executadas ou revisadas por modelo Sol.

## Alternativas consideradas

1. Emitir CT-e diretamente no endpoint HTTP: rejeitada porque request HTTP não
   oferece recuperação adequada para timeout, retry e ack pós-commit.
2. Registrar apenas status final no lote: rejeitada porque perderia tentativas,
   protocolo, resposta fiscal e auditoria exigidos pela constituição.
3. Habilitar produção junto da homologação: rejeitada porque produção exige gate
   humano, certificado/UF validados e revisão de release fiscal dedicada.

## Validação

Esta ADR será validada pelas tasks de gateway fiscal, schema, aplicação, worker,
HTTP, frontend, smoke e revisão final da feature 008.
