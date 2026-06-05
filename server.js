const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    status: "online"
  });
});

app.post("/multiply", (req, res) => {

  const value = Number(req.body.value || 0);

  res.json({
    result: value * 2
  });

});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});