# MExU — Business Tracker

## Prodotto
Agente AI white-label per negozi locali su WhatsApp.
Nome brand: **MExU** — "Me for you. 24/7."

## Stack tecnico
- Node.js + Express (webhook.js su GitHub)
- Claude API (claude-sonnet-4-5)
- Google Calendar API
- Resend (email)
- node-cron (job serale 20:00)
- pdfkit (generazione PDF)
- Railway (hosting)
- GitHub: Claudialollo/agente-negozi-ai

## Variabili Railway
- ANTHROPIC_API_KEY
- WHATSAPP_TOKEN (scade ogni 24h — aggiornare manualmente da Meta Developer)
- PHONE_NUMBER_ID: 1140024685854229
- VERIFY_TOKEN: miotoken2026
- GOOGLE_CREDENTIALS (JSON account di servizio)
- GOOGLE_CALENDAR_ID: claudialollobattista@gmail.com
- OWNER_PHONES: 393454590268
- OWNER_EMAIL: agentiai2026@gmail.com
- RESEND_API_KEY
- URL: agente-negozi-ai-production.up.railway.app

## Cosa funziona ✅
- Risponde ai clienti su WhatsApp 24/7
- Legge Google Calendar e controlla disponibilità
- Crea, cancella e modifica appuntamenti
- Blocca prenotazioni per date passate
- Distinzione titolare / cliente per numero
- Titolare chiamato per nome
- Titolare vede appuntamenti 3 mesi
- Cliente vede appuntamenti 30 giorni
- Reminder automatico al cliente dopo 1 ora
- Job schedulato alle 20:00 recap serale
- Genera PDF settimanale/mensile on demand
- Invia PDF via email con Resend
- Landing page MExU creata su v0

## Bug e problemi tecnici da risolvere 🔧
- [ ] **URGENTE** — Token WhatsApp scade ogni 24h — risolvibile solo dopo pubblicazione app Meta
- [ ] **URGENTE** — Conversazioni in RAM — si perdono ad ogni restart Railway → migrare su Supabase
- [ ] Fuso orario appuntamenti — a volte crea all'ora sbagliata
- [ ] Gestione errori AI — quando l'agente sbaglia non c'è sistema di notifica al titolare
- [ ] Nessuna FAQ personalizzabile per negozio — se cliente chiede qualcosa di specifico l'agente non sa rispondere

## Feedback da utenti Reddit 📝
**Utente 1 — commento su calendario e domande specifiche:**
- ✅ Apprezza l'idea di usare WhatsApp (già installato)
- ✅ Conferma mercato reale (barbiere con libretto cartaceo)
- ✅ Apprezza il recap serale
- ❓ Chiede: gestione conflitti calendario se slot già occupato
- ❓ Chiede: cosa succede se cliente chiede qualcosa di troppo specifico (es. prodotto specifico)

**Utente 2 — commento su onboarding e scalabilità:**
- ✅ Conferma che il problema principale non è il codice ma l'onboarding
- ⚠️ Avverte: spiegare sempre le stesse cose agli utenti brucia l'energia e non scala
- 💡 Consiglia Supabase per persistenza dati
- 💡 Consiglia Runable per automatizzare docs e onboarding
- ⚠️ Onboarding manuale non scala oltre 10-15 clienti

## Problemi di prodotto da risolvere (medio termine) 🛠️
- [ ] Database persistente con Supabase
- [ ] Pannello di controllo per il titolare
- [ ] Onboarding self-service automatizzato
- [ ] Documentazione semplice per negozianti non tech
- [ ] Sistema di notifica al titolare quando l'agente sbaglia
- [ ] FAQ personalizzabile per ogni negozio
- [ ] Valutare Runable per docs e dashboard

## Da fare — priorità immediate
- [ ] Apri partita IVA (agenziaentrate.gov.it, SPID, gratis)
- [ ] Deploya sito MExU su Vercel
- [ ] Verifica Business Manager Meta con partita IVA
- [ ] Acquista numero Twilio (~€1/mese)
- [ ] Pubblica app Meta → token permanente
- [ ] Apri Stripe per incassare
- [ ] Crea 3 negozi nel codice
- [ ] Trova primi 5 clienti tester

## Marketing attivo 📣
- Pagina LinkedIn MExU creata: linkedin.com/company/mexu-ai
- Google Form tester: https://forms.gle/T1RrC2c2mnbGfARA8
- Post pubblicati su: LinkedIn, Reddit (r/startupfeedback, altri)
- Messaggi pronti per: Facebook groups, Telegram, Reddit IT/EN

## Pricing
- Starter: €39/mese
- Pro: €69/mese (featured)
- Business: €99/mese

## Brand
- Nome: MExU
- Tagline: "Me for you. 24/7." / "Il tuo negozio non dorme mai."
- Colori: #080B14 (sfondo) · #0A5FFF (blu elettrico) · #FF6B35 (arancio)
- Font: Montserrat Bold

## Come aggiungere un nuovo negozio
Nel codice webhook.js aggiungere in `businesses`:
```js
"negozio2": {
  name: "Nome Negozio",
  ownerName: "Nome Titolare",
  ownerPhones: ["39XXXXXXXXXX"],
  calendarId: "email@gmail.com",
  hours: "Lun-Sab 9:00-19:00.",
  services: "Servizio 1 €X, Servizio 2 €X.",
}
```

## Note importanti
- WHATSAPP_TOKEN va aggiornato ogni mattina su Railway
- Resend free manda email solo a agentiai2026@gmail.com
- Per email a clienti reali serve dominio verificato su resend.com
- Token permanente richiede app Meta pubblicata
- Conversazioni in RAM — si perdono ad ogni restart

## Prossima sessione — inizia con:
"Leggi il BUSINESS_TRACKER e riprendiamo da dove eravamo"
