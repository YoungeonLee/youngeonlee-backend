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
// import cors from "cors";

createConnection({
  type: "postgres",
  url: process.env.DATABASE_URL,
})
  .then(async (connection) => {
    // create express app
    const app = express();
    // app.use(
    //   cors({
    //     origin: process.env.FRONT_END_URL,
    //   })
    // );
    const apolloServer = new ApolloServer({
      schema: await buildSchema({ resolvers: [RoomResolver] }),
      // context: { conn: connection },
    });

    // setup express app here
    apolloServer.applyMiddleware({
      app,
      cors: { origin: process.env.FRONTEND_URL },
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
      console.log("new socket:", socket.id);

      // join room
      socket.on(
        "join-room",
        async (roomName: string, userInput: ChatUser, creatorKey: string) => {
          console.log("findOne room");
          const room = await Room.findOne(
            { roomName: roomName },
            { relations: ["users"] }
          );
          console.log("if not room");
          if (!room) {
            return socket.emit("server-error", `No room named ${roomName}`);
          }
          console.log("if max people");
          if (room.maxPeople <= room.users.length) {
            return socket.emit(
              "server-error",
              `Room ${roomName} is currently full`
            );
          }
          let admin = false;
          if (creatorKey === room.creatorKey) {
            admin = true;
          }
          console.log("new user");
          const user = new RoomUser();
          user.username = userInput.name;
          user.admin = admin;
          user.room = room;
          user.color = userInput.color;
          console.log("save user");
          await user.save();
          // when user leaves clear data
          socket.on("disconnect", async () => {
            console.log("remove user");
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
            console.log("room length:", users.length);
            if (users.length === 0) {
              console.log("remove room");
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
        console.log("call user", socketId);
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
