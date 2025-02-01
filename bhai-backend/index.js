import express from "express";
import cors from "cors";
import path from "path";
import url, { fileURLToPath } from "url";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { clerkMiddleware, requireAuth, getAuth, clerkClient } from "@clerk/express";
import dotenv from "dotenv";

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  })
);

app.use(express.json());
app.use(clerkMiddleware());

const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.log(err);
  }
};

connect();

app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

app.post("/api/chats", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  const { text } = req.body;

  try {
    const newChat = new Chat({
      userId: userId,
      history: [{ role: "user", parts: [{ text }] }],
    });

    const savedChat = await newChat.save();

    const userChats = await UserChats.findOne({ userId: userId });
    if (!userChats) {
      const newUserChats = new UserChats({
        userId: userId,
        chats: [
          {
            _id: savedChat._id.toString(),
            title: text.substring(0, 40),
          }
        ]
      });

      await newUserChats.save();
    } else {
      await UserChats.updateOne({ userId: userId }, {
        $push: {
          chats: {
            _id: savedChat._id.toString(),
            title: text.substring(0, 40),
          }
        }
      });
    }

    res.status(201).send({ id: savedChat._id.toString() });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error!!", err.message);
  }
});

app.get("/api/userchats", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);

  try {
    const userChats = await UserChats.findOne({ userId });
    if (userChats) {
      res.status(200).send(userChats.chats);
    } else {
      res.status(404).send("No chats found for this user.");
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching user chats!");
  }
});

app.get("/api/chats/:id", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send("Invalid chat ID");
    }

    const chat = await Chat.findOne({ _id: new mongoose.Types.ObjectId(id), userId });
    if (chat) {
      res.status(200).send(chat);
    } else {
      res.status(404).send("Chat not found.");
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat!");
  }
});

app.put("/api/chats/:id", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  const { question, answer, img } = req.body;

  const newItems = [
    ...(question
      ? [{ role: "user", parts: [{ text: question }], ...(img && { img }) }]
      : []),
    { role: "model", parts: [{ text: answer }] },
  ];

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send("Invalid chat ID");
    }

    const updatedChat = await Chat.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(req.params.id), userId },
      {
        $push: {
          history: {
            $each: newItems,
          }
        }
      },
      { new: true }
    );

    res.status(200).send(updatedChat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding conversation!");
  }
});

app.get('/users', requireAuth(), async (req, res) => {
  const users = await clerkClient.users.getUserList();
  return res.json({ users });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(401).send('Unauthenticated!');
});

// PRODUCTION
app.use(express.static(path.join(__dirname, "../client/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});