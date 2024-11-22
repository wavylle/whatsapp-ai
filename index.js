// Import required modules
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { OpenAI } from "openai";
import mongoose from "mongoose";
import session from "express-session";
import { MongoClient } from "mongodb";
import twilio from "twilio";
import { MessagingResponse } from "twilio";
import ContextDataDB from "./models/contextData.js"; // Ensure the file extension is included for local imports

// Initialize dotenv to load environment variables from .env file
dotenv.config();

const openai = new OpenAI(process.env.OPENAI_API_KEY);

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const mongourl = process.env.MONGODB_URL;

// Create an instance of the Express application
const app = express();

async function runConversation(prompt, contextData) {
  console.log("Running conversation");
  const messages = contextData;
  console.log("messages: ", messages);
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages,
  });
  const responseMessage = response.choices[0].message.content;
  return responseMessage;
}

// Middleware to parse JSON bodies
app.use(bodyParser.urlencoded({ extended: false }));

// Define the /incoming-messages endpoint
app.post("/incoming-messages", async (req, res) => {
  const { body } = req;
  console.log("Received: ", body.Body);

  let message;

  if (body.Body) {
    try {
      console.log("Getting user");
      // Check if the user already exists
      let user = await ContextDataDB.findOne({ wa_id: body.WaId });

      // If user does not exist, create a new one
      if (!user) {
        console.log("Creating user");
        user = await ContextDataDB.create({ wa_id: body.WaId });
      }

      console.log("Setting context");
      const newContext = {
        role: "user",
        content: body.Body,
      };

      console.log("Updating user");
      user = await ContextDataDB.findOneAndUpdate(
        { wa_id: body.WaId },
        { $push: { context_data: newContext } },
        { new: true }
      );
    } catch (error) {
      console.error("Error updating document:", error);
    }

    console.log("Generating response");
    const getContext = await ContextDataDB.findOne({ wa_id: body.WaId });
    let gptResponse = await runConversation(body.Body, getContext.context_data);
    const gptContext = { role: "assistant", content: gptResponse };

    await ContextDataDB.findOneAndUpdate(
      { wa_id: body.WaId },
      { $push: { context_data: gptContext } },
      { new: true }
    );
    console.log("gptResponse: ", gptResponse);
    message = new MessagingResponse().message(gptResponse);
  } else {
    message = new MessagingResponse().message("Hey!");
  }

  res.set("Content-Type", "text/xml");
  res.status(200).send(message.toString());
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
});

app.get("/getallusers", async (req, res) => {
  const users = await ContextDataDB.find();
  res.json(users);
});

app.get("/deleteallusers", async (req, res) => {
  const users = await ContextDataDB.deleteMany({});
  res.json(users);
});

app.get("/", async (req, res) => {
  res.send("Server is live");
});

// Get the port from environment variables or default to 3000
const port = process.env.PORT || 3000;

mongoose
  .connect(mongourl)
  .then(() => {
    const server = app.listen(port, () => {
      console.log("App is listening on port:", port);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });

export default app;
