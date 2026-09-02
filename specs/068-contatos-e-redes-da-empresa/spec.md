# Spec 068 — Os contatos e as redes da empresa

## Problema

A empresa tem **um** telefone no cadastro fiscal e **um** no cadastro do site. A transportadora real
tem vários — comercial, financeiro, o celular do dono que atende no WhatsApp — e tem perfil em rede
social. Nada disso cabe hoje, e o efeito aparece em dois lugares ao mesmo tempo: o rodapé do e-mail
do sistema se identifica com um número só, e o site institucional publica o mesmo número só.

Some-se a isso o que o e-mail já pedia e não tinha: **o endereço sem link para o mapa**, e o WhatsApp
sem link — quem recebe copia o número na mão e cola no aplicativo.

## Decisão

Duas tabelas por empresa, com ordem definida pelo operador:

- `company_contacts` — telefone ou e-mail, com rótulo livre ("Comercial"), marca de **WhatsApp** e
  posição. É a marca que decide o link: telefone marcado sai também como `https://wa.me/…`.
- `company_social_links` — rede de catálogo fechado (`instagram`, `facebook`, `linkedin`, `youtube`,
  `tiktok`, `x`, `website`) e URL `https`.

Rede é catálogo fechado porque o ícone e a ordem de exibição saem dele; URL livre com rótulo digitado
faria cada empresa escrever "Insta", "instagram" e "INSTAGRAM" na mesma lista.

**São dados públicos por natureza** e saem nas rotas públicas da landing, ao lado do que já sai.
Administrar é `settings.manage`; ler no site é anônimo.

## Não faz parte

- Validar se o número existe no WhatsApp (é chamada à Meta, e o cadastro não pode depender dela).
- Horário de atendimento por telefone — cadastro maior, sem consumidor hoje.
- Substituir `company_fiscal_profiles.phone/email`: aquele é o contato **fiscal**, que vai no CT-e.

## Aceite

- [x] Empresa cadastra N telefones e N e-mails, com rótulo, marca de WhatsApp e ordem
- [x] Telefone marcado como WhatsApp vira link `wa.me` no e-mail e no site
- [x] Redes sociais cadastradas aparecem nos dois
- [x] Endereço do rodapé do e-mail leva ao mapa
- [x] Nada disso vaza entre empresas — contrato de isolamento por consulta
- [x] Cadastro vazio não imprime seção vazia em lugar nenhum
