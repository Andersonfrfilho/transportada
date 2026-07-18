# Índice da especificação

| Documento | Finalidade |
| --- | --- |
| [constitution.md](constitution.md) | princípios imutáveis e gates |
| [architecture.md](architecture.md) | arquitetura, tecnologias e fluxos |
| [domain-model.md](domain-model.md) | agregados, estados e integridade |
| [delivery-plan.md](delivery-plan.md) | fases, backlog e Definition of Done |
| [agent-strategy.md](agent-strategy.md) | agentes e economia de tokens |
| [railway.md](railway.md) | staging, production e promoção |
| [fiscal-integration.md](fiscal-integration.md) | inventário e limites do pacote Ada |

## Ciclo de uma feature

Cada pasta `specs/NNN-nome/` contém:

- `spec.md`: problema, histórias e critérios de aceite;
- `plan.md`: desenho técnico e contratos;
- `tasks.md`: unidades pequenas, ordenadas e verificáveis.

Uma feature só entra em desenvolvimento quando:

1. não há dúvida bloqueante;
2. critérios são testáveis;
3. dados, APIs, segurança e observabilidade estão definidos;
4. dependências e estratégia de rollback estão documentadas.
