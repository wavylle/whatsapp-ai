// Import required modules
const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
// Initialize dotenv to load environment variables from .env file
dotenv.config();

const openai = new OpenAI(process.env.OPENAI_API_KEY);

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);

const MessagingResponse = require("twilio").twiml.MessagingResponse;

// Create an instance of the Express application
const app = express();

async function gptEngine(prompt) {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: prompt }],
    model: "gpt-3.5-turbo",
  });

  return completion.choices[0]
}


// Middleware to parse JSON bodies
app.use(bodyParser.urlencoded({ extended: false }));

const goodBoyUrl =
  "https://images.unsplash.com/photo-1518717758536-85ae29035b6d?" +
  "ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1350&q=80";

// Define the /incoming-messages endpoint
app.post("/incoming-messages", async (req, res) => {
  const { body } = req;

  let message;

  if (body.Body) {
    let gptResponse = await gptEngine(body.Body)
    console.log("gptResponse: ", gptResponse)
    if(gptResponse.message) {
        message = new MessagingResponse().message(gptResponse.message.content);
    }
  } else {
    message = new MessagingResponse().message("Hey!");
  }

  res.set("Content-Type", "text/xml");
  res.send(message.toString()).status(200);
});

app.get("/send-message", async (req, res) => {
  await client.messages
    .create({
      body: "Your appointment is coming up on July 21 at 3PM",
      from: "whatsapp:+14155238886",
      to: "whatsapp:+918850727658",
    })
    .then((message) => console.log(message.sid));

  res.send("Message sent.");
  // .done();
});

// Get the port from environment variables or default to 3000
const port = process.env.PORT || 3000;

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
