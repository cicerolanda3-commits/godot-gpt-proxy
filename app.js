import express from "express";

const app = express();
app.use(express.json());

// =======================================================
// CONFIG
// =======================================================

const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// modelo Groq que costuma funcionar na faixa grátis
const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";

// =======================================================
// LOG DE TUDO QUE CHEGA
// =======================================================

app.all("*", (req, res, next) => {
  console.log("====================================");
  console.log("INCOMING:", req.method, req.path);
  console.log("Headers:", req.headers);
  console.log("Body:", JSON.stringify(req.body));
  console.log("====================================");
  next();
});

// =======================================================
// ROTA RAIZ
// =======================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Groq Godot proxy is running!",
    endpoints: ["/v1/responses"],
    model: MODEL,
  });
});

// =======================================================
// GET /v1/responses (se alguém abrir no navegador)
// =======================================================

app.get("/v1/responses", (req, res) => {
  res.json({
    output: [
      {
        content: [
          { type: "output_text", text: "Use POST neste endpoint (/v1/responses)." },
        ],
      },
    ],
  });
});

// =======================================================
// POST /v1/responses
// =======================================================

app.post("/v1/responses", async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(400).json({
        error: { message: "Missing GROQ_API_KEY environment variable" },
      });
    }

    // Extrai texto do payload do plugin
    let userText = "Olá";

    if (typeof req.body?.input === "string") {
      userText = req.body.input;
    } else if (Array.isArray(req.body?.input)) {
      const last = req.body.input[req.body.input.length - 1];
      if (typeof last?.content === "string") userText = last.content;
    } else if (Array.isArray(req.body?.messages)) {
      const last = req.body.messages[req.body.messages.length - 1];
      if (typeof last?.content === "string") userText = last.content;
    } else if (typeof req.body?.prompt === "string") {
      userText = req.body.prompt;
    }

    console.log("USER TEXT:", userText);

    // Chamada Groq (compatível OpenAI chat.completions)
    const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Você é um assistente dentro do Godot, ajudando a criar jogos 2D.",
          },
          { role: "user", content: userText },
        ],
      }),
    });

    const data = await groqResp.json();

    if (!groqResp.ok) {
      console.log("GROQ ERROR STATUS:", groqResp.status);
      console.log("GROQ ERROR BODY:", data);
      return res.status(groqResp.status).json({
        error: {
          message: "Groq API error",
          details: data,
        },
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content ??
      "(Sem resposta do modelo)";

    // Formato que o plugin espera (Responses API style)
    return res.json({
      output: [
        {
          content: [{ type: "output_text", text: answer }],
        },
      ],
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
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
