# Feature 015 — Preferências de tabela que sobrevivem à sessão

Aberta em 2026-07-29 a partir de um relato de uso: colunas alteradas na tabela "Notas", a tela
reiniciou e a configuração voltou ao padrão. O diagnóstico foi medido antes de qualquer código —
está em `evidence.md`.

## Problema

Dois defeitos somados no `nfe-workspace`, ambos reproduzidos na stack local:

1. **Gravação espúria no mount sobrescreve o layout salvo.** O efeito de persistência em
   `useNfeDocumentTable.hook.ts` é protegido por um único ref consumido na primeira invocação.
   Sob `StrictMode` o React invoca o efeito de mount duas vezes; a segunda invocação persiste o
   estado semente. Além de gravar, ela marca `hasEditedRef`, que é exatamente a condição que
   desliga a hidratação do valor remoto — o layout salvo no servidor nunca chega à tela e é
   sobrescrito pelo padrão local ~1,2s depois do mount.
2. **Edição pendente morre quando a tela reinicia.** O salvamento é debounced em 800ms sem flush
   em unmount nem em `pagehide`. Qualquer navegação nesse intervalo — inclusive o
   `keycloak.login()` do refresh de sessão, que é navegação de página inteira — descarta a
   gravação.

Consequência combinada: a preferência do usuário é perdida e substituída pelo padrão sem nenhuma
ação dele.

## Fora de escopo

- Reescrever o contrato de tabelas de `docs/frontend/data-tables.md`.
- Estender o mesmo mecanismo para `cte-batch` e `mdfe-manifest`, que hoje persistem só em
  `localStorage` — se o desenho valer para os três, vira task própria depois de esta fechar.

## Contratos que não se negociam

- Preferência é por usuário e por empresa — a leitura e a escrita continuam derivando `companyId`
  do contexto autenticado.
- Nenhuma gravação pode partir de um render que o usuário não provocou.
- Perda de gravação por navegação é defeito, não tolerância: o estado editado precisa alcançar o
  servidor ou permanecer recuperável localmente com prioridade sobre o remoto mais antigo.
