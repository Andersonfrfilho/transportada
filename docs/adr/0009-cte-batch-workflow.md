# ADR-0009: Workflow inicial de lotes de CT-e

## Contexto

A solução já possui NF-e normalizado e simulação de frete, com autenticação e
tenant isolados. Falta um fluxo de lote para preparar emissão de CT-e de modo
controlado, rastreável e seguro.

## Decisão

Criar a feature `007-cte-batch` com ciclo completo de lote no backend e frontend,
com as seguintes propriedades de decisão:

- lote por empresa (`tenant`) com máquina de estados finita;
- snapshot de cálculo por item no momento da inclusão;
- submissão idempotente por `Idempotency-Key` + fingerprint do payload;
- eventos de histórico por lote sem sobrescrever estados anteriores;
- anti-enumeração para IDs cross-tenant e IDs inexistentes;
- validações fiscais mínimas com foco na segurança de emissão futura.

## Consequências

- aumenta-se o estado persistido e a superfície de consulta de autorização
  por papel (`cte.manage`, `cte.submit`);
- a próxima etapa pode introduzir gateway real de emissão sem reestruturar lote,
  apenas adaptando o serviço de submit;
- testes de schema, domínio, HTTP e UI tornam-se obrigatórios antes da integração
  final.

## Alternativas consideradas

1. Integrar lote diretamente no fluxo de emissão real sem estado persistente: rejeitada
   para evitar duplicação e perda de trilha.
2. Usar máquina de estado apenas em memória no worker: rejeitada por não permitir
   auditabilidade e consistência em retry/redeploy.

## Validação

Esta ADR deve ser validada nas tasks de gate de integração e revisão de release da
feature 007.
