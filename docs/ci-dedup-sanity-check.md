# Verificação: gate não deve pular em PR de branch de feature

PR de teste, descartável, criada só para confirmar que a condição de dedup do job `gate`
em `.github/workflows/deploy.yml` não afeta PRs normais (branch de feature, sem `push`
correspondente) — `gate / quality` e `gate / integration` devem rodar normalmente aqui.

Fechar/apagar esta PR depois de confirmado.
