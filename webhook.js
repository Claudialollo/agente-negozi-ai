import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { google } from "googleapis";
import cron from "node-cron";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";

const app = express();
app.use(express.json());

const client = new Anthropic();
const conversations = {};
const pendingPDF = {};

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
const calendar = google.calendar({ version: "v3", auth });

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function getSlotsByRange(dateFrom, dateTo) {
  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: dateFrom.toISOString(),
    timeMax: dateTo.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    timeZone: "Europe/Rome",
  });
  return response.data.items || [];
}

async function createAppointment(customerName, service, dateTimeLocal) {
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.replace("Z", "").split(":").map(Number);

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
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

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

function formatEvents(events) {
  if (events.length === 0) return "nessuno";
  return events.map(e => {
    const date = new Date(e.start.dateTime).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
    const time = new Date(e.start.dateTime).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    return `${e.summary} — ${date} alle ${time}`;
  }).join("\n");
}

function generatePDF(events, title) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(20).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown();
    doc.fontSize(12).font("Helvetica").text(`Generato il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} alle ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}`, { align: "center" });
    doc.moveDown(2);

    if (events.length === 0) {
      doc.fontSize(14).text("Nessun appuntamento programmato.", { align: "center" });
    } else {
      events.forEach((e, i) => {
        const date = new Date(e.start.dateTime).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
        const time = new Date(e.start.dateTime).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
        doc.fontSize(13).font("Helvetica-Bold").text(`${i + 1}. ${e.summary}`);
        doc.fontSize(11).font("Helvetica").text(`   ${date} alle ${time}`);
        doc.moveDown(0.5);
      });
    }

    doc.end();
  });
}

async function sendDailyRecap(business) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const events = await getSlotsByRange(tomorrow, tomorrowEnd);
  const tomorrowDate = tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
  const title = `Appuntamenti di ${tomorrowDate}`;

  const testoRecap = events.length > 0
    ? `Ciao ${business.ownerName}! Ecco gli appuntamenti di domani (${tomorrowDate}):\n\n${formatEvents(events)}`
    : `Ciao ${business.ownerName}! Domani (${tomorrowDate}) non hai appuntamenti in agenda.`;

  const pdfBuffer = await generatePDF(events, title);

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.OWNER_EMAIL,
    subject: `Recap appuntamenti — ${tomorrowDate}`,
    text: testoRecap,
    attachments: [{
      filename: `recap_${tomorrow.toISOString().split("T")[0]}.pdf`,
      content: pdfBuffer,
    }]
  });

  for (const phone of business.ownerPhones) {
    await sendWhatsAppMessage(phone, testoRecap + "\n\nTi ho inviato anche il PDF via email!");
  }

  console.log(`Recap inviato per ${business.name}`);
}

const businesses = {
  "negozio1": {
    name: "Barber Shop Roma",
    ownerName: "Claudia",
    ownerPhones: process.env.OWNER_PHONES?.split(",") || [],
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    hours: "Lun-Sab 9:00-19:00. Chiuso domenica.",
    services: "Taglio uomo €15, Barba €10, Taglio + Barba €22.",
  }
};

const pendingConfirmations = {};

function getOwnerSystemPrompt(business, slotsInfo, today_date, today_iso) {
  return `Sei l'assistente personale di ${business.ownerName}, titolare di ${business.name}.
Stai parlando con ${business.ownerName} — il titolare. Chiamala sempre per nome.
Oggi è ${today_date} (${today_iso}).

${business.ownerName} può chiederti di:
- Aggiungere appuntamenti presi per telefono — scrivi PRENOTA:Nome,Servizio,YYYY-MM-DDTHH:MM:00
- Cancellare appuntamenti — scrivi CANCELLA:Nome
- Modificare appuntamenti — scrivi CANCELLA:Nome poi PRENOTA:Nome,Servizio,YYYY-MM-DDTHH:MM:00
- Vedere gli appuntamenti dei prossimi 3 mesi — li trovi qui sotto
- Chiedere info su un cliente specifico
- Chiedere un riepilogo settimanale o mensile — scrivi GENERA_PDF:settimana oppure GENERA_PDF:mese

Quando generi un riepilogo, mostra sempre il testo e poi chiedi:
"Vuoi ricevere il PDF anche via email? Rispondi sì o no."

REGOLA: Non accettare mai date passate rispetto a ${today_iso}.

Appuntamenti prossimi 3 mesi:
${slotsInfo}`;
}

function getClientSystemPrompt(business, slotsInfo, today_date, today_iso) {
  return `Sei l'assistente virtuale di ${business.name}.
Orari: ${business.hours}
Servizi: ${business.services}
Oggi è ${today_date} (${today_iso}).

Puoi aiutare il cliente a:
- Controllare disponibilità
- Prenotare un appuntamento
- Cancellare o modificare il suo appuntamento

Quando confermi una prenotazione chiedi sempre nome, servizio e orario preciso.

REGOLA FONDAMENTALE: Non accettare mai prenotazioni per date precedenti a ${today_iso}.

Per CREARE una prenotazione scrivi ESATTAMENTE alla fine del messaggio:
PRENOTA:Nome,Servizio,YYYY-MM-DDTHH:MM:00

Per CANCELLARE una prenotazione scrivi ESATTAMENTE alla fine del messaggio:
CANCELLA:Nome

Per MODIFICARE una prenotazione:
CANCELLA:Nome
PRENOTA:Nome,Servizio,YYYY-MM-DDTHH:MM:00

Tono: cordiale e professionale, usa il tu.

Appuntamenti prossimi 30 giorni:
${slotsInfo}`;
}

cron.schedule("0 20 * * *", async () => {
  console.log("Job serale avviato — invio recap...");
  for (const businessId of Object.keys(businesses)) {
    await sendDailyRecap(businesses[businessId]);
  }
}, { timezone: "Europe/Rome" });

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
  const userText = message.text.body.toLowerCase().trim();
  const business = businesses[businessId];

  if (!business) return res.sendStatus(200);

  const isOwner = business.ownerPhones.includes(userId);

  // Gestione risposta sì/no per PDF in attesa
  if (isOwner && pendingPDF[userId]) {
    if (userText === "sì" || userText === "si" || userText === "s" || userText === "yes") {
      const { pdfBuffer, titoloPDF, tipo, today_iso } = pendingPDF[userId];
      try {
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: process.env.OWNER_EMAIL,
          subject: titoloPDF,
          text: `Ciao ${business.ownerName}! In allegato trovi il PDF con gli appuntamenti della ${tipo}.`,
          attachments: [{
            filename: `${tipo}_${today_iso}.pdf`,
            content: pdfBuffer,
          }]
        });
        delete pendingPDF[userId];
        await sendWhatsAppMessage(userId, `PDF inviato! Controlla la tua email ${process.env.OWNER_EMAIL}.`);
      } catch (err) {
        await sendWhatsAppMessage(userId, "Errore nell'invio email. Riprova tra poco.");
      }
      return res.sendStatus(200);
    } else if (userText === "no" || userText === "n") {
      delete pendingPDF[userId];
      await sendWhatsAppMessage(userId, "Ok, nessuna email. A presto!");
      return res.sendStatus(200);
    }
  }

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const today_date = today.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const today_iso = today.toISOString().split("T")[0];

  let slotsInfo;
  if (isOwner) {
    const threeMonths = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    const events = await getSlotsByRange(today, threeMonths);
    slotsInfo = formatEvents(events);
  } else {
    const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const events = await getSlotsByRange(today, thirtyDays);
    slotsInfo = formatEvents(events);
  }

  const systemPrompt = isOwner
    ? getOwnerSystemPrompt(business, slotsInfo, today_date, today_iso)
    : getClientSystemPrompt(business, slotsInfo, today_date, today_iso);

  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: message.text.body });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system: systemPrompt,
    messages: conversations[userId].slice(-10)
  });

  let reply = response.content[0].text;

  if (reply.includes("GENERA_PDF:") && isOwner) {
    const pdfMatch = reply.match(/GENERA_PDF:(settimana|mese)/);
    if (pdfMatch) {
      const tipo = pdfMatch[1];
      const giorni = tipo === "settimana" ? 7 : 30;
      const fine = new Date(today.getTime() + giorni * 24 * 60 * 60 * 1000);
      const events = await getSlotsByRange(today, fine);
      const titoloPDF = tipo === "settimana" ? "Appuntamenti della settimana" : "Appuntamenti del mese";
      const pdfBuffer = await generatePDF(events, titoloPDF);

      pendingPDF[userId] = { pdfBuffer, titoloPDF, tipo, today_iso };
      reply = reply.replace(/GENERA_PDF:(settimana|mese)/, "").trim();
    }
  }

  if (reply.includes("CANCELLA:")) {
    const cancelMatch = reply.match(/CANCELLA:([^\n]+)/);
    if (cancelMatch) {
      const nome = cancelMatch[1].trim();
      const deleted = await deleteAppointmentByName(nome);
      reply = reply.replace(/CANCELLA:[^\n]+/g, "").trim();
      if (!deleted) {
        reply += "\n\n(Appuntamento non trovato sul calendario.)";
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
      reply += "\n\nPrenotazione confermata!";

      if (!isOwner) {
        if (pendingConfirmations[userId]) clearTimeout(pendingConfirmations[userId]);
        pendingConfirmations[userId] = setTimeout(async () => {
          await sendWhatsAppMessage(userId, "Ciao! Volevi confermare la prenotazione? Fammi sapere!");
          delete pendingConfirmations[userId];
        }, 60 * 60 * 1000);
      }
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
