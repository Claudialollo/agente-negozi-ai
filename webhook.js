import Anthropic from "@anthropic-ai/sdk";
import express from "express";

const app = express();
app.use(express.json());

const client = new Anthropic();
const conversations = {};

const businesses = {
  "negozio1": `Sei l'assistente virtuale di [NOME NEGOZIO].
Orari: [es. Lun-Sab 9:00-19:00].
Servizi: [elenca servizi e prezzi].
Tono: cordiale e professionale, usa il tu.
Se non sai rispondere, di' che passerai il messaggio al titolare.`
};

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
  const userText = message.text.body;

  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: userText });

  const systemPrompt = businesses[businessId] || "Sei un assistente virtuale utile.";

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    system: systemPrompt,
    messages: conversations[userId].slice(-10)
  });

  const reply = response.content[0].text;
  conversations[userId].push({ role: "assistant", content: reply });

  await fetch(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: userId,
      type: "text",
      text: { body: reply }
    })
  });

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Agente attivo sulla porta 3000"));
