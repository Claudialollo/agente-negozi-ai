# Replai — Business Tracker

## Prodotto
Agente AI white-label per negozi locali su WhatsApp.
Nome brand: **Replai** — "Il tuo negozio non dorme mai."

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
- Titolare chiamato per nome (Claudia)
- Titolare vede appuntamenti 3 mesi
- Cliente vede appuntamenti 30 giorni
- Reminder automatico al cliente dopo 1 ora
- Job schedulato alle 20:00 recap serale
- Genera PDF settimanale/mensile on demand
- Invia PDF via email con Resend
- Landing page Replai creata

## Da fare
- [ ] Creare primi 3 negozi nel codice
- [ ] Pubblicare sito Replai su Vercel
- [ ] Trovare primi clienti veri
- [ ] Token WhatsApp permanente (dopo prima pubblicazione app Meta)
- [ ] Dominio proprio per email Resend (es. replai.it)

## Pricing
- Starter: €39/mese (WhatsApp, 500 msg/mese)
- Pro: €69/mese (WhatsApp + Instagram, illimitato)
- Business: €99/mese (fino a 3 sedi, analytics)

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
Poi aggiungere webhook su Meta Developer per negozio2.

## Note importanti
- WHATSAPP_TOKEN va aggiornato ogni mattina su Railway
- Resend in modalità free manda email solo a agentiai2026@gmail.com
- Per mandare email a clienti reali serve dominio verificato su resend.com
- Token WhatsApp permanente richiede app Meta pubblicata

## Prossima sessione — inizia con:
"Leggi il BUSINESS_TRACKER e riprendiamo da dove eravamo"
