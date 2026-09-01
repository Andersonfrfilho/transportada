# Evidência — 068

## T1 · tabelas

- `bun run db:generate --name company_contacts` → `drizzle/20260901165052_company_contacts/`
- `rollback.sql` escrito ao lado, com aviso do que se perde
- `bun run db:check` → `Everything's fine`
- `make migration-test` → 90 pass / 0 fail (migration + rollback em Postgres descartável)

## T2 e T3 · aplicação, rotas e rota pública

- `test/companies/company-contacts.contract.ts` — 8 casos: telefone com máscara recusado, e-mail
  marcado como WhatsApp recusado, `http` recusado, rede fora do catálogo e rede repetida recusadas,
  cadastro vazio aceito, e o negativo de isolamento entre empresas
- `test/landing-http/public-settings.contract.ts` atualizado: a rota pública passa a servir
  `contacts` e `socialLinks` vazios enquanto ninguém cadastrou
- api: 3823 pass / 0 fail · lint e typecheck limpos

## T4 · rodapé do e-mail

- `test/code-email/template.contract.ts` — telefones com `tel:`, WhatsApp **ao lado** do telefone,
  `mailto:`, endereço linkando o mapa, lista cadastrada substituindo o contato do site sem repetir,
  e lista vazia não desenhando seção de redes
- worker: 816 pass / 0 fail
- Envio real medido no Mailpit (mensagem `3ArjMFaadbVr2Rd6OpVb1y`), com a marca lida da API de
  staging. Links no documento recebido:
  `maps.google.com/maps/search/?api=1&query=MOGIANA%2C%202296%2C…`, `tel:+1633334444`,
  `tel:+5516999991234` + `wa.me/5516999991234`, `tel:+5516988887777` + `wa.me/5516988887777`,
  `mailto:contato@…`, `mailto:financeiro@…`, Instagram, LinkedIn, Site, `adatechnology.com.br`

## T5 · painel

- `test/company-settings/contacts-panel.contract.ts` — paridade do catálogo de redes, endereço do
  painel no registro de abas, descarte de linha malformada na leitura, `PUT` da lista inteira com
  token, e as duas direções da máscara de telefone
- frontend-transportada: 2232 pass / 0 fail

## T6 · rodapé do site

- `https://wa.me` declarado em `NON_FETCH_ORIGIN` (é `<a href>`, não `fetch`)
- frontend-landing: 63 pass / 0 fail
