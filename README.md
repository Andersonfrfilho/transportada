# TransportAdA

TMS multiempresa para importar NF-e, calcular frete, emitir CT-e em lote e
gerar faturas. O projeto está em fase de especificação dirigida por contrato.

Repositório privado: `https://github.com/Andersonfrfilho/transportada`

## Comece aqui

1. Leia [`PROJECT.MD`](PROJECT.MD), fonte original dos requisitos.
2. Leia [`AGENTS.md`](AGENTS.md), regras obrigatórias para humanos e agentes.
3. Leia [`docs/spec/README.md`](docs/spec/README.md), índice da especificação.
4. Escolha a próxima feature em `specs/` e execute apenas uma tarefa por vez.

## Fluxo spec-driven

```text
PROJECT.MD → constitution → spec → plan → tasks → implementação → validação
```

Nenhuma implementação fiscal começa sem confirmação dos contratos publicados
por `@adatechnology/fiscal-provider`.

## Desenvolvimento local

Requisitos: Bun 1.3.14, Make e Docker.

```bash
make bootstrap
make up
make dev
```

O Makefile deriva `PROJECT_NAME` e `APP_ENV` do `.env` e isola os recursos do
Docker Compose como `<projeto>-<ambiente>`, por exemplo
`transportada-local`.

Serviços:

- frontend Vite/PWA: `http://localhost:53000`;
- API live/ready: `http://localhost:53001/health/live` e `/health/ready`;
- worker live/ready: `http://localhost:53002/health/live` e `/health/ready`;
- PostgreSQL: `localhost:55432`;
- RabbitMQ: `localhost:55672` (AMQP) e `localhost:55673` (management);
- MinIO: `http://localhost:59001`;
- Mailpit: `http://localhost:58025`.

Gates completos:

```bash
make check
make smoke
```

### Troubleshooting

- Readiness `503`: confirme `make ps` e as URLs do `.env`.
- Porta ocupada: altere as portas locais e as variáveis correspondentes.
- Lockfile incompatível: use Bun 1.3.14 e execute `make bootstrap`; não apague
  o lockfile.
- O ambiente local e staging sempre usam fiscal `homologation` e emissão real
  desabilitada.

## Ambientes

- local: Docker Compose;
- staging: Railway, integração contínua da branch `develop`;
- production: Railway, promoção controlada da branch `main`.

Consulte [`docs/spec/railway.md`](docs/spec/railway.md).
