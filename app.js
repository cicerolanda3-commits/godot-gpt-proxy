const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

// healthcheck
app.get("/", (req, res) => res.send("ok"));

app.post("/", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.text();
    res.status(response.status).type("application/json").send(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Proxy running on port", port));
