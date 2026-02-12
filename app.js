import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// =======================================================
// CONFIG
// =======================================================

const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Modelo Groq atual funcionando (leve e grátis)
const MODEL = "llama3-8b-8192";

// =======================================================
// LOG DE TUDO QUE CHEGA
// =======================================================

app.all("*", (req, res, next) => {
  console.log("====================================");
  console.log("INCOMING:", req.method, req.path);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("====================================");
  next();
});

// =======================================================
// ROTA RAIZ (teste rápido no navegador)
// =======================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Godot GPT Proxy is running!",
    endpoints: ["/v1/responses"],
  });
});

// =======================================================
// GET /v1/responses (caso Godot mande GET por erro)
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
// POST /v1/responses (principal)
// =======================================================

app.post("/v1/responses", async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(400).json({
        error: {
          message: "Missing GROQ_API_KEY environment variable",
        },
      });
    }

    // Godot envia algo tipo:
    // { input: "oi" }
    // ou { input: [{role:"user", content:"oi"}] }

    let userText = "Olá";

    if (typeof req.body.input === "string") {
      userText = req.body.input;
    } else if (Array.isArray(req.body.input)) {
      // pega último conteúdo
      const last = req.body.input[req.body.input.length - 1];
      if (last?.content) userText = last.content;
    }

    console.log("USER TEXT:", userText);

    // =======================================================
    // CHAMADA GROQ
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
            {
              role: "user",
              content: userText,
            },
          ],
        }),
      }
    );

    const data = await groqResp.json();

    if (!data.choices) {
      console.log("GROQ ERROR:", data);
      return res.status(500).json({
        error: {
          message: "Groq API error",
          details: data,
        },
      });
    }

    const answer = data.choices[0].message.content;

    // =======================================================
    // FORMATO EXATO QUE GODOT ESPERA (/v1/responses)
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
