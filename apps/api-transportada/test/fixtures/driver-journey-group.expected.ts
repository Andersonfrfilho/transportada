/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que o bot responde a cada mensagem da jornada no grupo (texto exato, com a marcação do WhatsApp). As horas vêm do relógio do teste: `at` é a hora
 * do registro (saída, chegada, baixa) e `eta` a chegada prevista pela estrada (25 min depois).
 */
export type JourneyClock = {
  readonly at: string
  readonly eta: string
  readonly farewell: string
  readonly greeting: string
}

export type JourneyExchange = { readonly answered: readonly string[]; readonly shown: string }

export function groupJourneyExpected({
  at,
  eta,
  farewell,
  greeting,
}: JourneyClock): readonly JourneyExchange[] {
  return [
    {
      answered: [
        `${greeting}

🚚 *Para qual parada você saiu?*

> 👉 *PARADA 1 de 3* · _próxima da rota_
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81

*PARADA 2 de 3*
🧾 NF \`17235\` · *MERCADO LUA CHEIA*
📍 Ribeirao Preto
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*PARADA 3 de 3*
🧾 NF \`17236\` · *ACOUGUE ESTRELA*
📍 Ribeirao Preto
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73

_Responda com o número da parada ou da nota._`,
      ],
      shown: '@bot iniciar rota',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: '1',
    },
    {
      answered: [
        `🚚 *Saída registrada* · ${at}

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
> 📦 3 volumes
> 📏 *12 km* · ⏱️ _~25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81
> 💰 Valor da nota: *R$ 1.234,56*
> ⏱️ Chegada prevista: *~${eta}*

➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `${greeting}

📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `📍 *Chegada registrada* · ${at}
📬 _Enviei para o escritório conferir o endereço._

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
> 📦 3 volumes
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81
> 💰 Valor da nota: *R$ 1.234,56*

🔜 *Depois desta:* parada 2 · MERCADO LUA CHEIA – Ribeirao Preto

➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `🎙️ Estou escutando o seu áudio, só um momento. Já te mostro o que entendi para você confirmar.`,
        `🎙️ *Entendi assim:*

💬 _“cheguei”_

👉 *Está certo?* Responda com o número ou por áudio (_sim_ ou _não_):
✅ *1 - Sim*, pode seguir
❌ *2 - Não*, descartar`,
      ],
      shown: '🎤 (áudio: "cheguei")',
    },
    {
      answered: [
        `${greeting}

⚠️ *A chegada na parada 1 já foi registrada* às ${at}.

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - ⚠️ Abrir ocorrência
*4* - 💤 Nada por enquanto`,
      ],
      shown: '1',
    },
    {
      answered: [
        `⚠️ *Falta a baixa da parada 1.*
Você chegou às ${at} e ainda não registrou a entrega.

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - 🚚 Sair para outra parada sem dar a baixa
*4* - 💤 Nada por enquanto`,
      ],
      shown: 'saí',
    },
    {
      answered: [
        `👍 *Certo, nada foi registrado.*
➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.

${farewell}`,
      ],
      shown: '4',
    },
    {
      answered: [
        `${greeting}

⚠️ *Falta a baixa da parada 1.*
Você chegou às ${at} e ainda não registrou a entrega.

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - 🚚 Sair para outra parada sem dar a baixa
*4* - 💤 Nada por enquanto`,
      ],
      shown: '@bot saí',
    },
    {
      answered: [
        `📍 *NF \`17234\` · localização*
Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).
_Falta 1 item. Se não tiver, responda pular._`,
      ],
      shown: '1',
    },
    {
      answered: [
        `👍 _Ok, sem a localização._

📸 *NF \`17234\` · foto do canhoto*
Mande a foto do canhoto assinado.
_Falta 1 item. Se não tiver, responda pular._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `✅ *NF 17234 pronta para fechar.*
🏢 Contratante: Distribuidora Aurora
👤 Cliente: PADARIA SOL NASCENTE
🏠 Endereço: RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
💰 Valor da nota: *R$ 1.234,56*

📍 Localização: não enviada

*Confirma a entrega?*
*1* - Sim ✅
*2* - Não ❌`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `*NF 17234 entregue.* Parada concluída. ✅

➡️ *Próxima parada*

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 📏 *12 km* · ⏱️ _~25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*O que você quer fazer agora?*
*1* - 🚚 Seguir para a *parada 2*
*2* - 📋 Escolher outra da lista
*3* - 💤 Nada por enquanto`,
      ],
      shown: '1',
    },
    {
      answered: [
        `↩️ *Pedido cancelado.* Nada foi registrado.
➡️ _Próximo passo:_ quando quiser, marque o bot de novo.`,
      ],
      shown: 'cancelar',
    },
    {
      answered: [
        `${greeting}

⚠️ *A entrega da NF 17234 já foi registrada* às ${at}.

➡️ *Próxima parada*

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 📏 *12 km* · ⏱️ _~25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*O que você quer fazer agora?*
*1* - 🚚 Seguir para a *parada 2*
*2* - 📋 Escolher outra da lista
*3* - 💤 Nada por enquanto`,
      ],
      shown: '@bot entreguei 17234',
    },
    {
      answered: [
        `🚚 *Para qual parada você saiu?*

> 👉 *PARADA 2 de 3* · _próxima da rota_
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*PARADA 3 de 3*
🧾 NF \`17236\` · *ACOUGUE ESTRELA*
📍 Ribeirao Preto
🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73

_Responda com o número da parada ou da nota._`,
      ],
      shown: '2',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: '3',
    },
    {
      answered: [
        `⚠️ *Fora da rota sugerida*
A rota sugere ir antes para a *parada 2*. Se achar melhor, pode seguir para a 3.

> 🚚 *VOCÊ ESCOLHEU · PARADA 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73

> 👉 *PRÓXIMA DA ROTA · PARADA 2*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*Para onde você vai?*
*1* - ✅ Seguir para a *parada 3*
*2* - 👉 Ir para a *parada 2*

_Responda 1 ou 2._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `🚚 *Saída registrada* · ${at}

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA SETE, 7, CRAVINHOS, SP
> 📦 12 volumes
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73
> 💰 Valor da nota: *R$ 10,00*

➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '1',
    },
    {
      answered: [
        `${greeting}

📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `📍 *Chegada registrada* · ${at}

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA SETE, 7, CRAVINHOS, SP
> 📦 12 volumes
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73
> 💰 Valor da nota: *R$ 10,00*

🔜 *Depois desta:* parada 2 · MERCADO LUA CHEIA – Ribeirao Preto

➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `${greeting}

⚠️ *A chegada na parada 3 já foi registrada* às ${at}.

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - ⚠️ Abrir ocorrência
*4* - 💤 Nada por enquanto`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `(fluxo de ocorrência da NF 17236)

${farewell}`,
      ],
      shown: '3',
    },
    {
      answered: [
        `${greeting}

⚠️ *A chegada na parada 3 já foi registrada* às ${at}.

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - ⚠️ Abrir ocorrência
*4* - 💤 Nada por enquanto`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `*Por que a NF 17236 não foi entregue?*
*1* - 🚪 Destinatário ausente
*2* - 🙅 Recusou receber
*3* - 📍 Endereço não achado
*4* - 📦 Carga avariada
*5* - 🔒 Local fechado`,
      ],
      shown: 'não entreguei 17236',
    },
    {
      answered: [
        `*NF 17236 não entregue* ↩️

➡️ *Próxima parada*

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*O que você quer fazer agora?*
*1* - 🚚 Seguir para a *parada 2*
*2* - 📋 Escolher outra da lista
*3* - 💤 Nada por enquanto`,
      ],
      shown: '2',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: 'saí',
    },
    {
      answered: [
        `🚚 *Saída registrada* · ${at}

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
> 📦 1 volume
> 📏 *12 km* · ⏱️ _~25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99
> 💰 Valor da nota: *R$ 99,90*
> ⏱️ Chegada prevista: *~${eta}*

➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `${greeting}

⚠️ *Você já está a caminho da parada 2.*
Registre a chegada nela antes de sair para outra.

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 📏 *12 km* · ⏱️ _~25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*O que você quer fazer agora?*
*1* - 📍 Cheguei na *parada 2*
*2* - ⚠️ Abrir ocorrência
*3* - 💤 Nada por enquanto`,
      ],
      shown: '@bot saí',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: '1',
    },
    {
      answered: [
        `📍 *Chegada registrada* · ${at}

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
> 📦 1 volume
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99
> 💰 Valor da nota: *R$ 99,90*

➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `${greeting}

📍 *NF \`17235\` · localização*
Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).
_Falta 1 item. Se não tiver, responda pular._`,
      ],
      shown: '@bot entreguei 17235',
    },
    {
      answered: [
        `👍 _Ok, sem a localização._

📸 *NF \`17235\` · foto do canhoto*
Mande a foto do canhoto assinado.
_Falta 1 item. Se não tiver, responda pular._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `✅ *NF 17235 pronta para fechar.*
🏢 Contratante: Distribuidora Aurora
👤 Cliente: MERCADO LUA CHEIA
🏠 Endereço: AVENIDA BRASIL, 2500, SERTAOZINHO, SP
💰 Valor da nota: *R$ 99,90*

📍 Localização: não enviada

*Confirma a entrega?*
*1* - Sim ✅
*2* - Não ❌`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `*NF 17235 entregue.* Viagem concluída. 🏁

🏁 *Rota concluída!* Todas as 3 paradas estão fechadas.
Bom descanso, Motorista. 🌙

${farewell}`,
      ],
      shown: '1',
    },
  ]
}
