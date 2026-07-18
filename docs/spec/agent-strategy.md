# Estratégia de agentes e tokens

IDs abaixo foram confirmados pelo `opencode models` local em 2026-07-18.

| Agente | Modelo | Uso | Limite |
| --- | --- | --- | --- |
| `explorer` | `opencode/deepseek-v4-flash-free` | busca, inventário, resumo | 8 passos |
| `spec-writer` | `opencode/deepseek-v4-flash-free` | primeira versão de spec/task | 10 passos |
| `test-writer` | `opencode/north-mini-code-free` | testes bem delimitados | 12 passos |
| `reviewer` | `opencode/nemotron-3-ultra-free` | revisão somente leitura | 8 passos |
| Codex Luna | `openai/gpt-5.6-luna` | mecânico/repetitivo | low |
| Codex Terra | `openai/gpt-5.6-terra` | implementação padrão | medium |
| Codex Sol | `openai/gpt-5.6-sol` | fiscal/segurança/arquitetura | high |

## Roteamento econômico

1. Explorer reúne evidência sem editar.
2. Spec-writer propõe artefatos pequenos.
3. Terra implementa e integra.
4. Test-writer amplia casos previsíveis.
5. Reviewer faz leitura independente.
6. Sol é gate para fiscal, concorrência, auth, criptografia e produção.

Use contexto mínimo: informe task, arquivos relevantes e critérios; não envie
todo o `PROJECT.MD` repetidamente. Uma task deve caber em uma sessão. Após duas
falhas equivalentes, escale o modelo ou divida a task.

Os modelos gratuitos são úteis, mas não são autoridade fiscal. Toda conclusão
deve ser validada por testes e revisão de maior capacidade.
