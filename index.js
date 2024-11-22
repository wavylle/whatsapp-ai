// Import required modules
const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
// Initialize dotenv to load environment variables from .env file
dotenv.config();

const openai = new OpenAI(process.env.OPENAI_API_KEY);
// const MongoDBSessionStore = require("connect-mongodb-session");

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);

const MessagingResponse = require("twilio").twiml.MessagingResponse;

// Create an instance of the Express application
const app = express();

async function runConversation(prompt) {
  console.log("Running conversation")
  // Step 1: send the conversation and available functions to the model
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a trading assistant talking to a trader. Based on user's input, provide a pine script code which will be used for TradingView. Just return with the code, nothing else."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });
  const responseMessage = response.choices[0].message.content;
  // console.log(responseMessage)
  console.log("Sending response")
  return {status: 200, message: responseMessage};
}

// Middleware to parse JSON bodies
app.use(bodyParser.urlencoded({ extended: false }));

// Define the /incoming-messages endpoint
app.post("/incoming-messages", async (req, res) => {
  const { body } = req;
  console.log("Recieved: ", body.Body)

  let message;
  
  if (body.Body) {

  console.log("Generating response")
  let gptResponse = await runConversation(body.Body)
  const gptContext = {role: 'assistant', content: gptResponse.message}
    
  if(gptResponse.message) {
        console.log("Sending response over whatsapp")
        message = new MessagingResponse().message(gptResponse.message);
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

app.get("/", async (request, response) => {
  response.send("Server is live")
});

// Get the port from environment variables or default to 3000
const port = process.env.PORT || 8000;

// Start your Express app after ensuring the collection is created
const server = app.listen(port, () => {
  console.log("App is listening on port:", port);
});

// export default app;
