# Evidências — spec 295

## T1.1 / T1.2 — API `/me/picture` (commits `test(295)` e `feat(295)`)

- Contrato vermelho antes: `bun test ./test/me-picture.contract.test.ts` → 8 fail (módulo ausente).
- Depois: 8 pass. Contrato completo da API (`bun --env-file=../../.env.test test --timeout 120000`): 13119 pass, 1 fail — o
  `membership-policy-lock` (trava da spec 144 que lista quem usa a política de membership); corrigido incluindo
  `me-picture.routes.ts` e a assinatura das três rotas na trava; reexecutado: 549 pass, 0 fail.
- `tsc --noEmit` e `eslint --max-warnings=0` limpos. Sem teste de integração tocado (nenhuma consulta nova).
- Teto de requisições: a rota administrativa não tem; esta também não.

## T2.1 / T2.2 — App do motorista

- Contrato vermelho antes (módulos ausentes); depois `bun run test` do app: 2203 pass, 0 fail.
- `typecheck`, `lint` limpos; `bun run build` ok (6 pass em `dist.contract`); prettier limpo.
- CSP: `img-src` já inclui `blob:` e a origem da API — sem mudança.
- `<input type="file" accept="image/*">` sem `capture`: o seletor do sistema oferece câmera e galeria; `capture` forçaria só a câmera.

## Correções da revisão de código

- `DELETE /me/picture` idempotente (`remove({ idempotent: true })` só na rota própria; a administrativa mantém 404); o atributo do
  provedor é zerado também sem foto. GET `/me/picture` e da administrativa com `x-content-type-options: nosniff`.
- Contrato: DELETE duas vezes → 204/204 com o atributo zerado; 403 em GET/PUT/DELETE sem membership ativa e com service account.
- App do motorista: `useOwnPicture` zera as duas mutations ao iniciar trocar/remover (teste por contrato de fonte: sem DOM nesta app);
  `OWN_PICTURE_PATH` exportada e usada nos testes.
