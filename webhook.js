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
  startOfDay.setHours(9, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(19, 0, 0, 0);

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    timeZone: "Europe/Rome",
  });

  return response.data.items || [];
}

async function createAppointment(customerName, service, dateTimeLocal) {
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.replace("Z","").split(":").map(Number);

  const start = new Date(Date.UTC(year, month - 1, day, hour - 2, minute));
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: `${customerName} — ${service}`,
      start: { dateTime: start.toISOString(), timeZone: "Europe/Rome" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Rome" },
    },
  });

  return event.data.id;
}

async function deleteAppointmentByName(customerName) {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items || [];
  const match = events.find(e =>
    e.summary?.toLowerCase().includes(customerName.toLowerCase())
  );

  if (match) {
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: match.id,
    });
    return true;
  }
  return false;
}

const businesses = {
  "negozio1": `Sei l'assistente virtuale di Barber Shop Roma.
Orari: Lun-Sab 9:00-19:00. Chiuso domenica.
Servizi: Taglio uomo €15, Barba €10, Taglio + Barba €22.
Quando un cliente chiede disponibilità per una data, controllala sempre prima di confermare.
Quando confermi una prenotazione chiedi sempre nome, servizio e orario preciso.

REGOLA FONDAMENTALE: La data di oggi ti viene fornita ad ogni messaggio. Qualsiasi data precedente a oggi è nel passato. Non puoi accettare prenotazioni per il passato. Se il cliente chiede una data passata, rispondi IMMEDIATAMENTE che non è possibile e suggerisci una data futura. Non chiedere altri dettagli, non andare avanti con la prenotazione.

Per CREARE una prenotazione, scrivi ESATTAMENTE alla fine del messaggio:
PRENOTA:Nome,Servizio,YYYY-MM-DDTHH:MM:00
Usa sempre la data corretta basandoti sulla data di oggi che ti viene fornita.

Per CANCELLARE una prenotazione, scrivi ESATTAMENTE alla fine del messaggio:
CANCELLA:Nome

Per MODIFICARE una prenotazione, prima cancella quella vecchia poi crea quella nuova:
CANCELLA:Nome
PRENOTA:Nome,Servizio,YYYY-MM-DDTHH:MM:00

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

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: userText });

  const systemPrompt = businesses[businessId] || "Sei un assistente virtuale utile.";

  const slots = await getAvailableSlots(today);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const slotsTomorrow = await getAvailableSlots(tomorrow);

  const slotsInfo = `
Appuntamenti oggi: ${slots.length > 0 ? slots.map(e => e.summary + " alle " + new Date(e.start.dateTime).toLocaleTimeString("it-IT", {hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome"})).join(", ") : "nessuno"}
Appuntamenti domani: ${slotsTomorrow.length > 0 ? slotsTomorrow.map(e => e.summary + " alle " + new Date(e.start.dateTime).toLocaleTimeString("it-IT", {hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome"})).join(", ") : "nessuno"}`;

  const today_date = new Date().toLocaleDateString("it-IT", {timeZone: "Europe/Rome", weekday: "long", year: "numeric", month: "long", day: "numeric"});
  const today_iso = today.toISOString().split("T")[0];
  const fullSystem = systemPrompt + "\n\nOggi è " + today_date + " (" + today_iso + "). Non accettare date precedenti a " + today_iso + ".\n\n" + slotsInfo;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    system: fullSystem,
    messages: conversations[userId].slice(-10)
  });

  let reply = response.content[0].text;

  if (reply.includes("CANCELLA:")) {
    const cancelMatch = reply.match(/CANCELLA:([^\n]+)/);
    if (cancelMatch) {
      const nome = cancelMatch[1].trim();
      const deleted = await deleteAppointmentByName(nome);
      reply = reply.replace(/CANCELLA:[^\n]+/g, "").trim();
      if (!deleted) {
        reply += "\n\n(Nota: non ho trovato un appuntamento con questo nome sul calendario.)";
      }
    }
  }

  if (reply.includes("PRENOTA:")) {
    const prenotaMatch = reply.match(/PRENOTA:([^,]+),([^,]+),([^\n]+)/);
    if (prenotaMatch) {
      const [, nome, servizio, dataOra] = prenotaMatch;

      const appointmentDate = new Date(dataOra);
      const appointmentMidnight = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());

      if (appointmentMidnight < todayMidnight) {
        reply = "Mi dispiace, non posso prenotare per una data già passata. Scegli una data a partire da oggi!";
        await sendWhatsAppMessage(userId, reply);
        return res.sendStatus(200);
      }

      await createAppointment(nome.trim(), servizio.trim(), dataOra.trim());
      reply = reply.replace(/PRENOTA:[^\n]+/g, "").trim();
      reply += "\n\nPrenotazione confermata! Ti aspettiamo.";

      if (pendingConfirmations[userId]) clearTimeout(pendingConfirmations[userId]);
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
