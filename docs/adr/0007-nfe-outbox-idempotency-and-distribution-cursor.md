# ADR 0007 — Outbox, idempotência e cursor NF-e persistentes

- Status: aceito
- Data: 2026-07-20
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

Importação e distribuição são efeitos críticos, demorados e sujeitos a falhas
de storage, broker e SEFAZ. Publicar em RabbitMQ depois do commit pode perder o
job; publicar antes pode executar um estado que o banco não confirmou. O broker
entrega pelo menos uma vez, então redelivery também pode duplicar documento,
contador ou evento.

`NfeDistribuicaoProvider` pagina até 50 itens, exige `ultNSU` persistido e
protege uma consulta vazia por uma hora apenas em memória. Esse estado não é
suficiente com restart ou múltiplas instâncias.

## Decisão

1. API grava agregado e `processing_outbox` na mesma transação.
2. Um relay no worker reivindica outbox com lease e
   `FOR UPDATE SKIP LOCKED`, publica em confirm channel e marca `published_at`.
3. Falha antes do confirm mantém/reagenda o outbox; confirmação repetida é
   absorvida pelo consumer.
4. Envelopes v1 contêm apenas IDs, tenant, ator, correlação e tipo/versão.
   Tenant e ator recebidos são claims não autoritativos: o consumer deriva
   ambos do outbox/agregado persistido por `eventId` + agregado e exige
   igualdade antes de qualquer efeito.
5. Importação e distribuição possuem exchanges/queues main, retry/DLX e DLQ
   independentes e versionadas.
6. Consumers validam envelope estrito e usam `processed_messages` persistente
   com unique `(companyId,consumer,eventId)`, uniques de negócio e
   version/lease; nenhum `Set` em memória decide efeito real.
7. Ack ocorre somente depois do commit do efeito e do registro processado.
8. Erro transitório usa backoff limitado; erro fatal segue para DLQ; o envelope
   nunca carrega XML, certificado ou resposta SEFAZ.
9. Cada item possui tentativas append-only. Reprocessar cria nova tentativa e
   outbox, sem reescrever o histórico.
10. `nfe_distribution_cursors` é único por `(companyId,environment)` e guarda
    `ultNSU`, `maxNSU`, lease, versão e `nextAllowedAt`.
11. Cursor inicia em `000000000000000`, nunca regride e é confirmado junto dos
    efeitos de cada página.
12. Apenas um lease ativo consulta o provider por empresa/ambiente.
13. Todo item distribuído persiste NSU e ambiente com unique parcial
    `(companyId,environment,sourceNsu)`; página repetida/sobreposta é absorvida
    antes de efeitos, com uniques de evento e chave NF-e como segunda barreira.
14. Ausência de documentos/bloqueio equivalente ao `cStat 656` atualiza
    `nextAllowedAt`, sobrevivendo a restart e escala.
15. Certificado A1 é carregado/decriptado apenas em memória pelo consumer de
    distribuição e nunca integra idempotency key, fila, log ou auditoria.

## Fluxo do outbox

```text
API transaction
  ├── grava nfe_imports/items
  └── grava processing_outbox
          ↓ commit
relay claim → RabbitMQ publisher confirm → published_at
          ↓
consumer claim → efeito → DB commit + processed_messages → ack
```

Se o processo cair:

- antes do commit da API: não existe job;
- depois do commit e antes do publish: relay recupera;
- depois do publish e antes de `published_at`: pode republicar; consumer dedupe;
- depois do efeito e antes do ack: mensagem redeliver; uniques/processed
  messages retornam o mesmo resultado;
- durante um lease: outra instância espera ou recupera após expiração.

## Concorrência da distribuição

Cada página usa o cursor atualmente confirmado. O worker não mantém uma
transação PostgreSQL aberta durante a chamada SEFAZ; ele:

1. adquire/renova lease curto com versão;
2. lê cursor e chama o gateway;
3. confirma itens e avanço de cursor somente se ainda possui lease/versão;
4. repete quando `temMais=true`;
5. libera lease ou deixa expirar em crash.

Se perder o lease, descarta o resultado não confirmado. Uma repetição segura
pode consultar novamente o mesmo NSU; idempotência absorve a página.

## Consequências

- não existe exactly-once distribuído, mas os efeitos observáveis são
  idempotentes sob entrega pelo menos uma vez;
- outbox e processed messages crescem e exigirão retenção operacional depois
  de prazo seguro;
- o worker passa a depender de PostgreSQL, RabbitMQ e storage para readiness;
- DLQ exige runbook e reprocessamento explícito;
- o curso da distribuição permanece correto entre instâncias e restart;
- chamada SEFAZ continua sujeita ao contrato real do provider, encapsulado pelo
  gateway.

## Segurança e testes

- dois relays e dois consumers não duplicam efeito;
- confirm perdido e redelivery pós-commit são exercitados;
- retry/DLX, DLQ e shutdown drenam mensagens;
- 51 itens confirmam paginação e cursor monotônico;
- duas distribuições do mesmo tenant/ambiente não chamam o gateway em paralelo;
- tenants e ambientes possuem cursores independentes;
- mensagens/logs/auditoria não contêm XML, CNPJ, PFX, senha ou resposta SEFAZ;
- gateway fake cobre rede; homologação real permanece gate manual separado.

## Rollback

Antes de dados reais, parar consumers/relay, drenar ou apagar topologias locais,
reverter código e remover tabelas na ordem documentada pela migration. Depois de
processamentos reais, não apagar outbox, mensagens processadas ou cursores:
desabilitar produtores/consumers e corrigir por roll-forward.
