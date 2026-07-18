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

## Comandos previstos

O código da aplicação será criado na primeira feature (`001-foundation`).
Até lá, este repositório contém somente especificação, decisões e automações de
agentes.

## Ambientes

- local: Docker Compose;
- staging: Railway, integração contínua da branch `develop`;
- production: Railway, promoção controlada da branch `main`.

Consulte [`docs/spec/railway.md`](docs/spec/railway.md).
