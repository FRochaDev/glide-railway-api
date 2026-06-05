const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "API Flávio!",
    app: "Glide + Railway",
    timestamp: new Date().toISOString()
  });
});

app.post("/hello", (req, res) => {
  const name = req.body.name || "Flávio";

  res.json({
    message: `Olá, ${name}!`,
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;

app.post("/multiply", (req, res) => {

  const value = Number(req.body.value || 0);

  res.json({
    result: value * 2
  });

});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});