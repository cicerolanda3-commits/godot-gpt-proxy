const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => res.send("ok"));

function normalizeTools(body) {
  if (!body || !Array.isArray(body.tools)) return body;

  const normalized = body.tools
    .map((t) => {
      // Convert Chat Completions tool format -> Responses tool format
      // from: {type:"function", function:{name, description, parameters}}
      // to:   {type:"function", name, description, parameters}
      if (t && t.type === "function" && t.function && !t.name) {
        return {
          type: "function",
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        };
      }
      return t;
    })
    // remove any invalid tools missing required "name"
    .filter((t) => !(t && t.type === "function" && !t.name));

  return { ...body, tools: normalized };
}

app.post("/", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set on server" });
    }

    const body = normalizeTools(req.body);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    res.status(response.status).type("application/json").send(text);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Proxy running on port", port));
