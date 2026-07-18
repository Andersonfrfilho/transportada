# Worker TransportAdA

Worker independente executado por Bun 1.3.14. PostgreSQL, RabbitMQ e o health
HTTP são inicializados no composition root da própria aplicação.

## Configuração

- `DATABASE_URL`: conexão PostgreSQL obrigatória;
- `RABBITMQ_URL`: conexão AMQP/AMQPS obrigatória;
- `QUEUE_PREFIX`: prefixo isolado por projeto e ambiente;
- `WORKER_PORT`: porta do health interno, padrão `53002`;
- `WORKER_PREFETCH`: prefetch do consumidor, padrão `1`;
- `APP_ENV`: ambiente, padrão `local`;
- `LOG_LEVEL`: `debug`, `info`, `warn` ou `error`;
- `FOUNDATION_SYNTHETIC_CONSUMER_ENABLED`: habilita explicitamente o consumidor
  sintético não produtivo;
- `FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS`: atraso artificial usado somente pelo
  teste de drain.

O consumidor sintético existe apenas para os contratos da fundação e é
proibido quando `APP_ENV=production`. Nenhum consumidor ou efeito fiscal é
criado nesta etapa.

## Health interno

- `GET /health/live`: liveness sem consultar dependências;
- `GET /health/ready`: readiness de PostgreSQL e RabbitMQ.

O startup não executa migrations. O shutdown cancela o consumidor, aguarda
mensagens em voo e então fecha RabbitMQ, PostgreSQL e o servidor de health.
