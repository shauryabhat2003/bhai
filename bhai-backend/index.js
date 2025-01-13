import express from "express";
import ImageKit from 'imagekit';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { requireAuth } from '@clerk/express';

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));

app.use(express.json());

const connect = async () => {
    try {
        await mongoose.connect(process.env.MONGO.trim());
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

connect();

const imagekit = new ImageKit({
    urlEndpoint: process.env.IMAGE_KIT_ENDPOINT.trim(),
    publicKey: process.env.IMAGE_KIT_PUBLIC_KEY.trim(),
    privateKey: process.env.IMAGE_KIT_PRIVATE_KEY.trim()
});

app.get("/api/upload", (req, res) => {
    try {
        const result = imagekit.getAuthenticationParameters();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: `Error: ${error.message}` });
    }
});

app.post("/api/chats", requireAuth(), async (req, res) => {
    const userId = req.auth.userId;
    const { text } = req.body;

    try {
        // CREATE A NEW CHAT 
        const newChat = new Chat({
            userId: userId,
            history: [{ role: "user", parts: [{ text }] }],
        });

        const savedChat = await newChat.save();

        const userChats = await UserChats.findOne({ userId: userId });
        // IF DOESN'T EXISTS CREATE A NEW ONE AND ADD THE CHAT IN CHATS ARRAY
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
            // IF EXISTS, PUSH THE CHAT TO THE EXISTING ARRAY
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
    const userId = req.auth.userId;

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
    const userId = req.auth.userId;
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
    const userId = req.auth.userId;
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

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(401).send('Unauthenticated!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});