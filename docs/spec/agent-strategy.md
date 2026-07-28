# Estratégia de agentes e tokens

IDs abaixo foram confirmados pelo `opencode models` local em 2026-07-18.

| Agente        | Modelo                            | Uso                          | Limite    |
| ------------- | --------------------------------- | ---------------------------- | --------- |
| `explorer`    | `opencode/deepseek-v4-flash-free` | busca, inventário, resumo    | 8 passos  |
| `spec-writer` | `opencode/deepseek-v4-flash-free` | primeira versão de spec/task | 10 passos |
| `test-writer` | `opencode/north-mini-code-free`   | testes bem delimitados       | 12 passos |
| `reviewer`    | `opencode/nemotron-3-ultra-free`  | revisão somente leitura      | 8 passos  |
| Haiku         | `haiku`                           | mecânico/repetitivo          | baixo     |
| Sonnet        | `sonnet`                          | implementação padrão         | médio     |
| Opus          | `opus`                            | fiscal/segurança/arquitetura | alto      |

## Roteamento econômico

1. Explorer reúne evidência sem editar.
2. Spec-writer propõe artefatos pequenos.
3. Sonnet implementa e integra.
4. Test-writer amplia casos previsíveis.
5. Reviewer faz leitura independente.
6. Opus é gate para fiscal, concorrência, auth, criptografia e produção.

Use contexto mínimo: informe task, arquivos relevantes e critérios; não envie
todo o `PROJECT.MD` repetidamente. Uma task deve caber em uma sessão. Após duas
falhas equivalentes, escale o modelo ou divida a task.

Os modelos gratuitos são úteis, mas não são autoridade fiscal. Toda conclusão
deve ser validada por testes e revisão de maior capacidade.

Os agentes em `.opencode/agents` são subagentes e não devem ser passados
diretamente a `opencode run --agent`. Para delegação econômica via CLI, fixe
explicitamente um modelo `opencode/*-free` no agente primário e forneça uma
tarefa limitada; caso contrário, o fallback pode selecionar um modelo pago.

Para a migração Bun: Opus decide arquitetura, Drizzle crítico, RabbitMQ, fiscal
e segurança; Sonnet implementa API, worker, frontend e tooling; Haiku remove
legado após paridade e faz inventário, primeiros testes previsíveis e revisão
somente leitura.
