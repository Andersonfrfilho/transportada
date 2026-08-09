# Constituição do TransportAdA

Versão 1.0.0 — 2026-07-18

## Princípios

1. **Isolamento multiempresa é invariável.** Toda entidade de negócio contém
   `companyId`; o backend deriva o tenant da identidade autenticada; testes
   negativos entre empresas são obrigatórios. Vale mesmo com a distribuição
   sendo um deploy por transportadora (ADR-0021): uma instalação hospeda os
   vários CNPJs do mesmo cliente, e o isolamento é defesa em profundidade que
   não se afrouxa por o ambiente ser dedicado.
2. **Fiscal por contrato.** Toda operação fiscal passa por gateway interno que
   adapta a versão instalada de `@adatechnology/fiscal-provider`.
3. **Consistência antes de velocidade.** Numeração, idempotência, snapshots e
   faturamento usam transações e constraints de banco.
4. **Assíncrono e recuperável.** HTTP agenda trabalho; workers processam itens
   isoladamente com retry classificado, backoff e dead-letter.
5. **Histórico imutável.** XML original, snapshots de regra, tentativas,
   respostas fiscais e auditoria não são sobrescritos.
6. **Segurança por padrão.** Certificados e senhas são criptografados; arquivos
   usam URLs temporárias; logs são estruturados e mascarados.
7. **Escopo do MVP protegido.** Importar NF-e → frete → CT-e → fatura antes dos
   módulos logísticos futuros.
8. **Evidência de qualidade.** Nenhuma entrega sem testes proporcionais,
   observabilidade e documentação atualizada.

## Gates

- Spec gate: histórias independentes e critérios Given/When/Then.
- Design gate: ADR para decisão cara ou difícil de reverter.
- Data gate: migration revisada, índices, constraints e rollback.
- Fiscal gate: contrato do pacote verificado e teste com mock/homologação.
- Security gate: autorização, tenant e vazamento de segredos revisados.
- Release gate: CI verde, health checks e migration compatível.

Alterações nesta constituição exigem PR dedicado, justificativa e incremento de
versão.
