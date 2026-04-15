import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { google } from "googleapis";

const app = express();
app.use(express.json());

const client = new Anthropic();
const conversations = {};

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
const calendar = google.calendar({ version: "v3", auth });

async function getAvailableSlots(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(7, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(17, 0, 0, 0);

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

async function createAppointment(customerName, service, dateTime) {
  const start = new Date(dateTime);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: `${customerName} — ${service}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });
}

const businesses = {
  "negozio1": `Sei l'assistente virtuale di Barber Shop Roma.
Orari: Lun-Sab 9:00-19:00. Chiuso domenica.
Servizi: Taglio uomo €15, Barba €10, Taglio + Barba €22.
Quando un cliente chiede disponibilità per una data, controllala sempre prima di confermare.
Quando confermi una prenotazione chiedi sempre nome, servizio e orario preciso.
Dopo aver raccolto nome, servizio e orario, DEVI scrivere obbligatoriamente questa riga esatta nel tuo messaggio:
PRENOTA:Mario,Taglio uomo,2026-04-16T13:00:00Z
Usa sempre questo formato esatto. Non cambiare nulla. Metti questa riga alla fine del messaggio.
Tono: cordiale e professionale, usa il tu.`
};

const pendingConfirmations = {};
const ownerPhones = process.env.OWNER_PHONES?.split(",") || [];

app.get("/webhook/:businessId", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook/:businessId", async (req, res) => {
  const { businessId } = req.params;
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message || message.type !== "text") return res.sendStatus(200);

  const userId = message.from;
  const isOwner = ownerPhones.includes(userId);
  const userText = message.text.body;

  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: userText });

  const systemPrompt = businesses[businessId] || "Sei un assistente virtuale utile.";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const slots = await getAvailableSlots(tomorrow);
  const slotsInfo = slots.length > 0
    ? `Appuntamenti già presi domani: ${slots.map(e => e.summary + " alle " + new Date(e.start.dateTime).getHours() + ":00").join(", ")}`
    : "Domani non ci sono ancora appuntamenti.";

  const fullSystem = systemPrompt + "\n\n" + slotsInfo;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    system: fullSystem,
    messages: conversations[userId].slice(-10)
  });

  let reply = response.content[0].text;

  if (reply.includes("PRENOTA:")) {
    const prenotaMatch = reply.match(/PRENOTA:([^,]+),([^,]+),(.+)/);
    if (prenotaMatch) {
      const [, nome, servizio, dataOra] = prenotaMatch;
      await createAppointment(nome.trim(), servizio.trim(), dataOra.trim());
      reply = reply.replace(/PRENOTA:.+/, "").trim();
      reply += "\n\nPrenotazione confermata! Ti aspettiamo.";

      pendingConfirmations[userId] = setTimeout(async () => {
        await sendWhatsAppMessage(userId, "Ciao! Volevi confermare la prenotazione? Fammi sapere!");
        delete pendingConfirmations[userId];
      }, 60 * 60 * 1000);
    }
  }

  conversations[userId].push({ role: "assistant", content: reply });
  await sendWhatsAppMessage(userId, reply);
  res.sendStatus(200);
});

async function sendWhatsAppMessage(to, text) {
  await fetch(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });
}

app.listen(3000, () => console.log("Agente attivo sulla porta 3000"));
