const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/", (req, res) => res.send("ok"));

app.post("/", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY not set" });
    }

    let messages = [];

    // Se vier no formato Responses (input)
    if (typeof req.body.input === "string") {
      messages = [{ role: "user", content: req.body.input }];
    }
    // Se vier no formato Chat (messages)
    else if (Array.isArray(req.body.messages)) {
      messages = req.body.messages;
    }
    else {
      messages = [{ role: "user", content: "Hello" }];
    }

    const payload = {
      model: "llama-3.1-70b-versatile",
      messages: messages,
      temperature: 0.2,
      max_tokens: 800
    };

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.text();
    res.status(response.status).type("application/json").send(data);

  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Groq proxy running on", port));
