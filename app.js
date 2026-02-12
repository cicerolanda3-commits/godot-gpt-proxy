import express from "express";

const app = express();
app.use(express.json());

// =======================================================
// CONFIG
// =======================================================

const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Modelo Groq leve e gratuito
const MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";

// =======================================================
// LOG DE TODAS AS REQUISIÇÕES (SEM app.all("*") BUGADO)
// =======================================================

app.use((req, res, next) => {
  console.log("====================================");
  console.log("INCOMING:", req.method, req.path);
  console.log("Body:", JSON.stringify(req.body));
  console.log("====================================");
  next();
});

// =======================================================
// ROTA RAIZ (TESTE NO NAVEGADOR)
// =======================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Groq Godot Proxy is running!",
    endpoint: "/v1/responses",
    model: MODEL,
  });
});

// =======================================================
// GET /v1/responses (se abrir no navegador por engano)
// =======================================================

app.get("/v1/responses", (req, res) => {
  res.json({
    output: [
      {
        content: [
          {
            type: "output_text",
            text: "Este endpoint precisa ser chamado via POST.",
          },
        ],
      },
    ],
  });
});

// =======================================================
// POST /v1/responses (PRINCIPAL)
// =======================================================

app.post("/v1/responses", async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(400).json({
        error: { message: "Missing GROQ_API_KEY in Render Environment Variables" },
      });
    }

    // =======================================================
    // Extrair texto enviado pelo plugin Godot
    // =======================================================

    let userText = "Olá";

    if (typeof req.body?.input === "string") {
      userText = req.body.input;
    } else if (Array.isArray(req.body?.messages)) {
      const last = req.body.messages[req.body.messages.length - 1];
      if (typeof last?.content === "string") userText = last.content;
    } else if (Array.isArray(req.body?.input)) {
      userText = JSON.stringify(req.body.input);
    }

    console.log("USER TEXT:", userText);

    // =======================================================
    // Chamada para Groq API (OpenAI compatible)
    // =======================================================

    const groqResp = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
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
              content:
                "Você é um assistente dentro do Godot, ajudando a criar jogos 2D.",
            },
            { role: "user", content: userText },
          ],
          temperature: 0.2,
          max_tokens: 500,
        }),
      }
    );

    const data = await groqResp.json();

    if (!groqResp.ok) {
      console.log("GROQ ERROR:", data);
      return res.status(groqResp.status).json({
        error: {
          message: "Groq API error",
          details: data,
        },
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content || "(Sem resposta do modelo)";

    // =======================================================
    // Retorno no formato Responses API (Godot plugin entende)
    // =======================================================

    return res.json({
      output: [
        {
          content: [
            {
              type: "output_text",
              text: answer,
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);

    return res.status(500).json({
      error: {
        message: "Internal server error",
        details: String(err),
      },
    });
  }
});

// =======================================================
// START SERVER
// =======================================================

app.listen(PORT, () => {
  console.log("====================================");
  console.log("Groq proxy running on port", PORT);
  console.log("Model:", MODEL);
  console.log("====================================");
});
