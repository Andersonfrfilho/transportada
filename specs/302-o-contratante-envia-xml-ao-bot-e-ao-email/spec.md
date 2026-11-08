# Feature 302 — O contratante envia XML de NF-e ao bot e à caixa `notas@`

> Pedido do Anderson em 08/11/2026: "os contratantes também podem enviar ao bot" (aprovou a recomendação "lista de números autorizados por contratante, cadastrada pela transportadora").

## Problema e resultado

A spec 301 aceita XML por e-mail e WhatsApp só de **usuários da empresa** (administrador, fiscal, operador). O contratante, que é quem costuma mandar esses XMLs, era ignorado.

**Resultado:** o contato do contratante que a transportadora marcar com o tipo **"Pode enviar XML de NF-e"** (`nfe_xml`) passa a importar XML pelos dois canais, sem virar usuário do sistema.

## Decisões

- **D1 — Reaproveita o cadastro que já existe.** `contractor_contacts` já guarda e-mail, telefone, aceite do WhatsApp e uma lista de `types` (quem recebe o quê). Nasce o valor `nfe_xml` na lista. Nenhuma tabela nova; a transportadora marca o tipo na tela de contatos do contratante (a mesma da spec 183), e a revogação é desmarcar ou inativar o contato.
- **D2 — Quem vale.** Contato `active`, com o tipo `nfe_xml`. No WhatsApp, também com o **aceite do WhatsApp** (`whatsapp_opt_in_at`), como já é regra para o número falar com o sistema (spec 183 D6). No e-mail, o endereço do contato; a checagem de DKIM alinhado da 301 continua valendo.
- **D3 — Escopo da empresa.** O contato é da empresa dona do contratante; um contato da empresa A não importa na B (o `company_id` vem do webhook/da instalação, nunca do texto).
- **D4 — Ator da importação.** Contratante não é usuário: a importação é gravada com o ator de sistema `automation`, e o remetente (e-mail ou número) fica em `received_from`. É o mesmo ator que a caixa de e-mail já usa; precisa de vínculo com a empresa (runbook § 5.23).
- **D5 — Mesmas barreiras.** Só `.xml`/`.zip`, zip hostil recusado, teto de 50 MB por arquivo, fila em lotes, logs com motivo, resposta ao remetente: tudo como na 301. Nada é recusado por volume.
- **D6 — Fora do escopo.** Vínculo do contratante à importação (campo `contractor_id` na importação) e tela de histórico por contratante. O remetente fica no registro; o cruzamento com o contratante é por `received_from`.

## Requisitos

- RF1 — `nfe_xml` é um tipo válido do contato (CHECK, API, painel).
- RF2 — WhatsApp: número de contato ativo, com o tipo e o aceite, é remetente autorizado; sem qualquer um dos três, é recusado como "não autorizado" (comportamento da 301).
- RF3 — E-mail: endereço de contato ativo com o tipo é remetente autorizado.
- RF4 — Migration aditiva (só amplia o CHECK) com rollback que recusa se algum contato ainda tem o tipo.
