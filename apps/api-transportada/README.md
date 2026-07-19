# API TransportAdA

Aplicação HTTP independente, executada por Bun 1.3.14 com `Bun.serve`.

## Configuração

- `DATABASE_URL`: URL PostgreSQL obrigatória;
- `APP_PORT`: porta HTTP, padrão `53001`;
- `APP_ENV`: ambiente, padrão `local`;
- `LOG_LEVEL`: `debug`, `info`, `warn` ou `error`.

O startup não executa migrations.

As migrations usam o journal fixo `drizzle.__drizzle_migrations`. Gere e
valide pelo Makefile da raiz:

```bash
bun run db:generate --name nome_da_migration
bun run db:check
make migration-test
```

`make migration-test` sobe somente o PostgreSQL do projeto
`transportada-local`, cria um banco descartável e valida apply, constraints,
rollback, journal e reaplicação. Rollbacks são manuais e versionados ao lado da
migration; nunca são chamados pelo startup.

## Contratos HTTP

Todas as respostas tratadas pela aplicação retornam `x-correlation-id`.
Valores recebidos são aceitos somente com 1–128 caracteres alfanuméricos ou
`._:-`; valores ausentes ou inválidos são substituídos por UUID.

O contrato limita corpos a 1 MiB e retorna erro `413` estruturado. O servidor
mantém ainda um hard limit nativo de 2 MiB para rejeitar tráfego abusivo antes
do handler.

Method e pathname são validados por schema Zod antes do roteamento. As rotas
health não leem body; o servidor rejeita corpos acima de 1 MiB com `413`.

| Método | Rota              | Resposta                                  |
| ------ | ----------------- | ----------------------------------------- |
| GET    | `/health/live`    | `200`, sem consultar dependências         |
| GET    | `/health/ready`   | `200` com PostgreSQL up ou `503` degraded |
| outro  | rota conhecida    | `405` e erro estruturado                  |
| outro  | rota desconhecida | `404` e erro estruturado                  |

Erros possuem `{ error: { code, message, correlationId } }` e não expõem
stack, query string, headers, body ou detalhes da infraestrutura.
