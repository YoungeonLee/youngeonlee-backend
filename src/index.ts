import "reflect-metadata";
import { createConnection } from "typeorm";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { RoomResolver } from "./resolvers/room";
import { Server, Socket } from "socket.io";
import { Room } from "./entity/Room";
import { RoomUser } from "./entity/RoomUser";
import { ChatUser } from "./types";
import cors from "cors";
import dotenv from "dotenv";
import argon2 from "argon2";

dotenv.config();

createConnection({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: true,
  entities: [Room, RoomUser],
})
  .then(async (connection) => {
    // create express app
    const app = express();

    app.enable("trust proxy");

    app.use(
      cors({
        origin: process.env.FRONTEND_URL,
      })
    );

    app.get("/", (_, res) => {
      res.send("Hello");
    });

    const apolloServer = new ApolloServer({
      schema: await buildSchema({ resolvers: [RoomResolver] }),
      // context: { conn: connection },
    });

    console.log("front end address:", process.env.FRONTEND_URL);

    // setup express app here
    apolloServer.applyMiddleware({
      app,
      cors: false,
    });

    // start express server
    const server = app.listen(process.env.PORT);

    console.log(
      `Express server has started on port ${process.env.PORT}. http://localhost:${process.env.PORT}`
    );

    const io = new Server(server, {
      cors: { origin: process.env.FRONTEND_URL },
    });

    const videoChat = io.of("/video-chat");

    videoChat.on("connect", (socket: Socket) => {
      // join room
      socket.on(
        "join-room",
        async (
          roomName: string,
          userInput: ChatUser,
          creatorKey: string,
          password: string
        ) => {
          const room = await Room.findOne(
            { roomName: roomName },
            { relations: ["users"] }
          );
          if (!room) {
            return socket.emit("server-error", `No room named ${roomName}`);
          }
          if (room.maxPeople <= room.users.length) {
            return socket.emit(
              "server-error",
              `Room ${roomName} is currently full`
            );
          }
          let admin = false;
          if (creatorKey === room.creatorKey) {
            admin = true;
          } else {
            if (room.private) {
              await new Promise((resolve) => {
                setTimeout(resolve, 1000);
              });
              if (password === "") {
                return socket.emit("password-required");
              }
              if (!(await argon2.verify(room.password, password))) {
                return socket.emit("wrong-password");
              }
            }
          }
          const user = new RoomUser();
          user.username = userInput.name;
          user.admin = admin;
          user.room = room;
          user.color = userInput.color;
          await user.save();
          // when user leaves clear data
          socket.on("disconnect", async () => {
            socket.to(room.secretKey).emit(
              "user-disconnected",
              {
                color: user.color,
                name: user.username,
              },
              socket.id
            );
            await user.remove();
            const users = await RoomUser.find({ room: room });
            if (users.length === 0) {
              return await room.remove();
            }
          });
          // when user change their settings
          socket.on("user-setting-change", (userSetting) => {
            const prevSetting = { color: user.color, name: user.username };
            socket
              .to(room.secretKey)
              .emit("user-setting-changed", prevSetting, userSetting);
            user.color = userSetting.color;
            user.username = userSetting.name;
            user.save();
          });

          socket.join(room.secretKey);
          socket.emit("secret-key", room.secretKey);
          socket.to(room.secretKey).emit("user-joined", userInput);
        }
      );

      // tell users in the room that your video joined
      socket.on("join-video", (secretKey) => {
        socket.to(secretKey).emit("user-video-joined", socket.id);
      });

      // calling specific user
      socket.on("call-user", (data, socketId) => {
        videoChat.to(socketId).emit("call-received", data, socket.id);
      });

      // last signal for complete connection
      socket.on("answer-call", (data, socketId) => {
        videoChat.to(socketId).emit("answered-call", data, socket.id);
      });

      // handle text messages
      socket.on("send-message", (message, user, secretKey) => {
        socket.to(secretKey).emit("message", message, user);
      });
    });
  })
  .catch((error) => console.log(error));
