import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import queue from "./queue.js";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const PORT = process.env.PORT || 5000;
const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new IOServer(server, {
    cors: {
        origin: "http://localhost:5173",
    },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, "../dist");

app.use(express.static(outputDir));

app.get("/", function (req, res) {
    // res.sendFile(path.join(outputDir, "index.html"));
    console.log("Received a request at the root endpoint.");
    res.send('Live Audio Server Running');
});

(async () => {
    await queue.loadTracks("tracks");
    queue.play();

    io.on("connection", (socket) => {
        // Every new streamer must receive the header
        if (queue.bufferHeader) {
            socket.emit("bufferHeader", queue.bufferHeader);
        }

        socket.on("bufferHeader", (header) => {
            queue.bufferHeader = header;
            socket.broadcast.emit("bufferHeader", queue.bufferHeader);
        });

        socket.on("stream", (packet) => {
            // Only broadcast microphone if a header has been received
            if (!queue.bufferHeader) return;

            // Audio stream from host microphone
            socket.broadcast.emit("stream", packet);
        });

        socket.on("control", (command) => {
            switch (command) {
                case "pause":
                    queue.pause();
                    break;
                case "resume":
                    queue.resume();
                    break;
            }
        });
    });

    // HTTP stream for music
    app.get("/stream", (req, res) => {
        const { id, client } = queue.addClient();
        console.log(id,client);
        res.set({
            "Content-Type": "audio/mp3",
            "Transfer-Encoding": "chunked",
        }).status(200);

        client.pipe(res);

        req.on("close", () => {
            queue.removeClient(id);
        });
    });

    server.listen(PORT, () => {
        console.log(`Listening on port ${PORT}`);
    });
})();

export {};
