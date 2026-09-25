# 188 — O convite leva à ativação

## Problema

Medido em staging em 25/09/2026: o motorista cadastrado recebeu o e-mail "Seu código de ativação"
(no Mailpit de staging) só com o código `1e45fbd0…`, e o digitou como **senha** no login — "Usuário
ou senha inválidos". A API tem `POST /user-activation` (anônima, `code` + `password`) desde a spec
026, mas **nenhuma tela chama a rota**: nem o painel, nem o portal, nem o tema do Keycloak. O único
caminho que funcionava era o administrador clicar em "Ativar agora" e definir a senha por ele.

## Resultado

1. **Tela pública `/ativar`** no painel (antes do Keycloak, na moldura das telas públicas): código,
   nova senha e confirmação; chama `POST /user-activation`; ao ativar, leva ao login. Toda recusa
   (código errado, expirado, usado, senha recusada, rede) cai no mesmo aviso genérico.
2. **O e-mail do convite leva à tela com o código preenchido**: botão "Ativar meu acesso" para
   `${APP_BASE_URL}/ativar#codigo=<código>`, com o endereço também por extenso. O código vai no
   **fragmento**, que o navegador não envia a servidor nenhum; a tela o lê e o tira da barra de
   endereço (`history.replaceState`).
3. O código continua no corpo do e-mail — sem `APP_BASE_URL` o e-mail sai como antes, só com ele.
   A recuperação de senha usa a mesma moldura e não muda.

## Fora do escopo

- Convite por WhatsApp: a mensagem é template aprovado da Meta, e link novo nela é outro template.
- Link "Tenho um código de ativação" na tela de login.

## Critérios de aceite

- [x] `test/code-email/activation-link.contract.ts` (worker)
- [x] `test/identity/user-activation.contract.ts` e `public-route.contract.ts` (painel)
- [x] Em staging: convite reenviado chega no Mailpit com o botão, e o link abre `/ativar` com o
      código preenchido
