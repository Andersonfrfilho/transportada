# Evidência — 245

## T1.1 — fonte do pacote × tarball 0.7.0

- Repositório de pacotes: `origin/main` = `15e0a029c5aba85346ab5c6225bbe6a9081886ae`. O checkout principal
  (branch `feat/whatsapp-preview-de-link`, árvore suja de outra sessão) **não foi usado**; a Fase 1 roda
  em `git worktree add` a partir de `origin/main`.
- Resultado: fonte do módulo em `origin/main` == tarball `0.7.0` — 37/37 arquivos do sourcemap, 11/11
  migrations, 73/73 exports. Sem divergência.
- Desvio fora do módulo (não bloqueia): o #125 (`15e0a02`) mudou
  `meta-whatsapp-contracts/src/providers.ts` (`SendTextOptions`) sem changeset; os contratos em
  `origin/main` estão à frente do `0.6.0` publicado; o módulo não os usa.
- Parecer do `architect` (opus) aprovado; 14 correções aplicadas a `spec.md`, `plan.md` e `tasks.md`.
