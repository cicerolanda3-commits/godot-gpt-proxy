import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Você pode definir uma lista no Render, ex:
// GROQ_MODELS="llama-3.1-8b-instant,llama-3.3-70b-versatile"
// Se não definir, usa essa lista padrão:
const DEFAULT_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
];

// Lê modelos do env se existir
function getModelList() {
  const fromEnv = (process.env.GROQ_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

app.get("/", (req, res) => res.status(200).send("OK"));

function extractUserText(body) {
  if (typeof body?.input === "string") return body.input;

  if (Array.isArray(body?.input)) {
    const parts = [];
    for (const item of body.input) {
      if (typeof item?.content === "string") parts.push(item.content);
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string") parts.push(c.text);
        }
      }
    }
    const joined = parts.join("\n").trim();
    if (joined) return joined;
  }

  if (Array.isArray(body?.messages)) {
    const last = body.messages[body.messages.length - 1];
    if (typeof last?.content === "string") return last.content;
  }

  return "";
}

function toResponsesFormat({ model, text, usage }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `resp_${Math.random().toString(16).slice(2)}`,
    object: "response",
    created: now,
    model,
    output: [
      {
        id: `msg_${Math.random().toString(16).slice(2)}`,
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: text ?? "" }],
      },
    ],
    usage: usage || undefined,
  };
}

function isRetryableModelError(groqError) {
  const code = groqError?.error?.code || groqError?.code;
  const msg = groqError?.error?.message || groqError?.message || "";

  // Casos típicos quando um modelo some/foi descontinuado:
  return (
    code === "model_decommissioned" ||
    code === "model_not_found" ||
    /decommissioned/i.test(msg) ||
    /no longer supported/i.test(msg) ||
    /does not exist/i.test(msg)
  );
}

async function callGroqChatCompletions({ model, payload }) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, model }),
  });

  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

app.post("/v1/responses", async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(400).json({
        error: { message: "Missing GROQ_API_KEY on server (Render env var)." },
      });
    }

    const body = req.body || {};
    const userText = extractUserText(body);

    if (!userText) {
      return res.status(400).json({
        error: { message: "Missing input text (body.input)." },
      });
    }

    // lista de fallback
    const models = getModelList();

    // se o cliente mandar um "model", tenta ele primeiro, depois a lista
    const requestedModel =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : null;

    const modelTryList = requestedModel
      ? [requestedModel, ...models.filter((m) => m !== requestedModel)]
      : models;

    const payload = {
      messages: [
        {
          role: "system",
          content:
            body?.instructions ||
            "Você é um assistente útil. Responda de forma direta.",
        },
        { role: "user", content: userText },
      ],
      temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      max_tokens:
        typeof body.max_output_tokens === "number"
          ? body.max_output_tokens
          : 1024,
    };

    let lastError = null;

    for (const model of modelTryList) {
      const { ok, status, data } = await callGroqChatCompletions({
        model,
        payload,
      });

      if (ok) {
        const text = data?.choices?.[0]?.message?.content ?? "";
        const usage = data?.usage
          ? {
              input_tokens: data.usage.prompt_tokens,
              output_tokens: data.usage.completion_tokens,
              total_tokens: data.usage.total_tokens,
            }
          : undefined;

        return res.json(toResponsesFormat({ model, text, usage }));
      }

      // se for erro de modelo, tenta o próximo
      if (isRetryableModelError(data)) {
        lastError = { status, data, triedModel: model };
        continue;
      }

      // qualquer outro erro (quota, auth, etc.) não adianta tentar outro modelo
      return res.status(status).json({
        error: { message: "Groq API error", details: data },
      });
    }

    // Se chegou aqui, todos os modelos falharam por “modelo inválido/descontinuado”
    return res.status(400).json({
      error: {
        message: "All fallback models failed (decommissioned/not found).",
        details: lastError,
        tried_models: modelTryList,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: { message: "Server error", details: String(err?.message || err) },
    });
  }
});

app.listen(PORT, () => {
  console.log("====================================");
  console.log(`Groq proxy running on port ${PORT}`);
  console.log(`Models (fallback): ${getModelList().join(", ")}`);
  console.log("====================================");
});
