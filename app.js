import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";

// Logger
app.use((req, res, next) => {
  console.log("====================================");
  console.log("INCOMING:", req.method, req.path);
  console.log("Body:", JSON.stringify(req.body));
  console.log("====================================");
  next();
});

// Health
app.get("/", (req, res) => {
  res.json({ status: "ok", endpoint: "/v1/responses", model: MODEL });
});
app.head("/", (req, res) => res.status(200).end());

// Helper: extrair texto
function extractUserText(body) {
  if (!body) return "Olá";

  if (typeof body.input === "string") return body.input;

  if (Array.isArray(body.messages) && body.messages.length) {
    const last = body.messages[body.messages.length - 1];
    if (typeof last?.content === "string") return last.content;
  }

  if (Array.isArray(body.input)) return JSON.stringify(body.input);

  if (typeof body.prompt === "string") return body.prompt;

  return "Olá";
}

// Aceita GET/HEAD em /v1/responses e /v1/responses/
app.get(["/v1/responses", "/v1/responses/"], (req, res) => {
  res.json({
    output: [
      {
        content: [{ type: "output_text", text: "Use POST neste endpoint." }],
      },
    ],
  });
});
app.head(["/v1/responses", "/v1/responses/"], (req, res) => res.status(200).end());

// Principal: POST em /v1/responses e /v1/responses/
app.post(["/v1/responses", "/v1/responses/"], async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(400).json({
        error: { message: "Missing GROQ_API_KEY in Render Environment Variables" },
      });
    }

    const userText = extractUserText(req.body);

    const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "Você é um assistente dentro do Godot, ajudando a criar jogos 2D." },
          { role: "user", content: userText },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    const data = await groqResp.json();

    if (!groqResp.ok) {
      return res.status(groqResp.status).json({
        error: { message: "Groq API error", details: data },
      });
    }

    const answer = data?.choices?.[0]?.message?.content || "(Sem resposta do modelo)";

    // Formato Responses API
    return res.json({
      output: [
        {
          content: [{ type: "output_text", text: answer }],
        },
      ],
    });
  } catch (err) {
    return res.status(500).json({
      error: { message: "Internal server error", details: String(err) },
    });
  }
});

app.listen(PORT, () => {
  console.log("====================================");
  console.log("Groq proxy running on port", PORT);
  console.log("Model:", MODEL);
  console.log("====================================");
});
