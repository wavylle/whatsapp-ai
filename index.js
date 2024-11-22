// Import required modules
const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const mongoose = require("mongoose");
// Initialize dotenv to load environment variables from .env file
dotenv.config();

const openai = new OpenAI(process.env.OPENAI_API_KEY);
var session = require('express-session')
const { MongoClient } = require('mongodb');

const MongoDBSessionStore = require("connect-mongodb-session");

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);

const MessagingResponse = require("twilio").twiml.MessagingResponse;

var mongourl = process.env.MONGODB_URL;
// const mongoclient = new MongoClient(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
// const mongoclient = new mongoose.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });

const ContextDataDB = require("./models/contextData");

// Create a new MongoDBSessionStore
const MongoDBStore = MongoDBSessionStore(session);

// Initialize MongoDBStore with session options
const store = new MongoDBStore({
  uri: mongourl,
  collection: "sessions",
});

// Catch errors in MongoDBStore
store.on("error", function (error) {
  console.error("MongoDBStore Error:", error);
});

// Create an instance of the Express application
const app = express();

async function runConversation(prompt, contextData) {
  // Step 1: send the conversation and available functions to the model
  const messages = contextData

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages
  });
  const responseMessage = response.choices[0].message.content;
  return responseMessage;
}

// Middleware to parse JSON bodies
app.use(bodyParser.urlencoded({ extended: false }));

// Define the /incoming-messages endpoint
app.post("/incoming-messages", async (req, res) => {
  const { body } = req;

  let message;
  
  if (body.Body) {

    try {
      // Check if the user already exists
      let user = await ContextDataDB.findOne({ wa_id: body.WaId });
      
      // If user does not exist, create a new one
      if (!user) {
          user = await ContextDataDB.create({ wa_id: body.WaId });
      }

      // const newContext = {role: 'user', content: body.Body}
      const newContext = [
        {
          role: "system",
          content: "You are a trading assistant talking to a trader. Based on user's input, provide a pine script code which will be used for TradingView."
        },
        {
          role: "user",
          content: body.Body
        }
      ]

      // Push new data to the context_data array
      user = await ContextDataDB.findOneAndUpdate(
          { wa_id: body.WaId },
          { $push: { context_data: newContext } },
          { new: true }
      );
  } catch (error) {
      console.error('Error updating document:', error);
  }

  const getContext = await ContextDataDB.findOne({wa_id: body.WaId})
  let gptResponse = await runConversation(body.Body, getContext.context_data)
  const gptContext = {role: 'assistant', content: gptResponse}

    // Push new data to the context_data array
  const updateGptContext = await ContextDataDB.findOneAndUpdate(
      { wa_id: body.WaId },
      { $push: { context_data: gptContext } },
      { new: true }
  );
    console.log("gptResponse: ", gptResponse)
    if(gptResponse) {
        message = new MessagingResponse().message(gptResponse);
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

app.get("/getallusers", async (request, response) => {
  const users = await ContextDataDB.find();
  response.json(users);
});

app.get("/deleteallusers", async (request, response) => {
  const users = await ContextDataDB.deleteMany({});
  response.json(users);
});

app.get("/", async (request, response) => {
  response.send("Server is live")
});

// Get the port from environment variables or default to 3000
const port = process.env.PORT || 3000;

mongoose.connect(mongourl)
.then(async () => {
  // console.log("Connected to MongoDB");
  // const database = mongoclient.db(); // This will use the default database specified in the connection string

  // // Check if the "CallTrials" collection exists
  // const collections = await database.listCollections({ name: 'CallTrials' }).toArray();
  // if (collections.length === 0) {
  //   // If the collection doesn't exist, create it
  //   await database.createCollection('CallTrials');
  //   console.log("Created collection 'CallTrials'");
  // } else {
  //   console.log("Collection 'CallTrials' already exists");
  // }

  // Start your Express app after ensuring the collection is created
  const server = app.listen(port, () => {
    console.log("App is listening on port:", port);
  });
})
.catch((error) => {
  console.error("Error connecting to MongoDB:", error);
});
