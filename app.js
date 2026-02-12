const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/", (req, res) => res.send("ok"));

/**
 * Godot plugin manda algo parecido com "Responses API" (input/tools).
 * A Groq usa "Chat Completions" (messages/tools).
 * Aqui a gente converte automaticamente.
 */

function normalizeToolsToResponsesStyle(body) {
  if (!body || !Array.isArray(body.tools)) return body;

  // Se vier no formato Chat Completions:
  // tools: [{type:"function", function:{name,description,parameters}}]
  // Converter para Responses-style:
  // tools: [{type:"function", name, description, parameters}]
  const tools = body.tools.map((t) => {
    if (t && t.type === "function" && t.function && !t.name) {
      return {
        type: "function",
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      };
    }
    return t;
  });

  return { ...body, tools };
}

function responsesToGroqChat(body) {
  const model = body.model || "llama-3.1-8b-instant";

  // messages
  let messages = [];
  if (Array.isArray(body.messages)) {
    messages = body.messages;
  } else if (typeof body.input === "string") {
    messages = [{ role: "user", content: body.input }];
  } else if (Array.isArray(body.input)) {
    messages = [{ role: "user", content: JSON.stringify(body.input) }];
  } else {
    messages = [{ role: "user", content: "Hello" }];
  }

  // tools -> formato do chat.completions
  let tools = undefined;
  if (Array.isArray(body.tools)) {
    tools = body.tools.map((t) => {
      // Responses-style -> Chat-style
      if (t && t.type === "function" && t.name) {
        return {
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        };
      }
      // já está chat-style
      return t;
    });
  }

  return {
    model,
    messages,
    tools,
    tool_choice: body.tool_choice, // opcional
    temperature: body.temperature ?? 0.2,
    max_tokens: body.max_output_tokens ?? body.max_tokens ?? 800,
  };
}

app.post("/", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY not set on server" });
    }

    const normalized = normalizeToolsToResponsesStyle(req.body);
    const payload = responsesToGroqChat(normalized);

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Groq proxy running on port", port));
