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
const mongoclient = new MongoClient(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });

const ContextDataDB = require("./models/contextData");

// Import the Todoist API wrapper for TypeScript
const {TodoistApi} = require('@doist/todoist-api-typescript');

// Initialize the Todoist API with the API key from environment variables
const api = new TodoistApi(process.env.TODOIST_API_KEY);

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

// Function to get all projects of the authenticated user
async function getUserProjects(){
  try {
      // Fetch and return the projects from Todoist
      const projects = await api.getProjects();
      return projects;
  } catch (error) {
      // Log any errors that occur during the fetch
      console.error('error', error);
  }
}

// Function to get tasks of a specific project
async function getTasks(projectId){
  try {
      // Fetch and return tasks of a given project
      const tasks = await api.getTasks({projectId});
      return tasks;
  } catch (error) {
      // Log any errors that occur during the fetch
      console.error('error', error);
  }
}

// Function to create a new task in a specified project
async function createTask(projectId, taskContent){
  try {
      // Add a new task with the given content to the specified project
      const newTask = await api.addTask({
          content: taskContent, projectId
      });
      return newTask;
  } catch (error) {
      // Log any errors that occur during the creation of the task
      console.error('error', error);
  }
}

async function getTodoistTasks() {
  // Fetch all user projects
  const projects = await getUserProjects();

  // Fetch tasks of the first project
  const tasks = await getTasks(projects[0].id);
  console.log(tasks)

  let tasksArray = []
  for(let i = 0; i < tasks.length; i++) {
    tasksArray.push(tasks[i]["content"])
  }

  console.log("tasksArray: ", tasksArray)

  return JSON.stringify({tasks: tasksArray})
}

async function createTodoistTask(taskName) {
  // Fetch all user projects
  const projects = await getUserProjects();

  // Create a new task in the first project and log it
  const newTask = await createTask(projects[0].id, taskName);
  console.log(newTask);

  return `Task: ${taskName} is successfully created.`
}

// Example dummy function hard coded to return the same weather
// In production, this could be your backend API or an external API
function getCurrentWeather(location, unit = "fahrenheit") {
  if (location.toLowerCase().includes("tokyo")) {
    return JSON.stringify({ location: "Tokyo", temperature: "10", unit: "celsius" });
  } else if (location.toLowerCase().includes("san francisco")) {
    return JSON.stringify({ location: "San Francisco", temperature: "72", unit: "fahrenheit" });
  } else if (location.toLowerCase().includes("paris")) {
    return JSON.stringify({ location: "Paris", temperature: "22", unit: "fahrenheit" });
  } else {
    return JSON.stringify({ location, temperature: "unknown" });
  }
}

async function runConversation(prompt, contextData) {
  // Step 1: send the conversation and available functions to the model
  const messages = contextData

  const tools = [
    {
      type: "function",
      function: {
        name: "get_all_tasks",
        description: "Gets all Todoist tasks.",
      },
    },
    {
      type: "function",
      function: {
        name: "create_task",
        description: "Creates a new Todoist task.",
        parameters: {
          type: "object",
          properties: {
            taskName: {
              type: "string",
              description: "Name of the task to be created."
            }
          },
          required: ["taskName"]
        }
      },
    },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages,
    tools: tools,
    tool_choice: "auto", // auto is default, but we'll be explicit
  });
  const responseMessage = response.choices[0].message;

//   console.log("responseMessage: ", responseMessage)

  // Step 2: check if the model wanted to call a function
  const toolCalls = responseMessage.tool_calls;
  if (responseMessage.tool_calls) {
    // Step 3: call the function
    // Note: the JSON response may not always be valid; be sure to handle errors
    const availableFunctions = {
      get_all_tasks: getTodoistTasks,
      create_task: createTodoistTask,
    }; // only one function in this example, but you can have multiple
    messages.push(responseMessage); // extend conversation with assistant's reply
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionToCall = availableFunctions[functionName];
      const functionArgs = JSON.parse(toolCall.function.arguments);
      let functionResponse;
      if(functionName == "create_task") {
        functionResponse = await functionToCall(functionArgs.taskName);
      } else {
        functionResponse = await functionToCall();
      }
      messages.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: functionName,
        content: functionResponse,
      }); // extend conversation with function response
    }
    console.log(messages)
    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
    }); // get a new response from the model where it can see the function response
    return secondResponse.choices[0].message.content;
  } else if (responseMessage.content) {
    return responseMessage.content
  }
}

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

    try {
      // Check if the user already exists
      let user = await ContextDataDB.findOne({ wa_id: body.WaId });
      
      // If user does not exist, create a new one
      if (!user) {
          user = await ContextDataDB.create({ wa_id: body.WaId });
      }

      const newContext = {role: 'user', content: body.Body}

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