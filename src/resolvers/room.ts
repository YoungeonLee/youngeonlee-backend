import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  Query,
  Resolver,
  Root,
} from "type-graphql";
import { Room } from "../entity/Room";
import argon2 from "argon2";
import { v4 } from "uuid";

@InputType()
class RoomInput {
  @Field()
  roomName: string;

  @Field({ nullable: true })
  description: string;

  @Field(() => Int, { defaultValue: 4 })
  maxPeople: number;

  @Field({ defaultValue: false })
  private: boolean;

  @Field({ nullable: true })
  password: string;

  @Field()
  creatorKey: string;
}

@Resolver(() => Room)
export class RoomResolver {
  @FieldResolver(() => Int)
  currentUsers(@Root() room: Room) {
    return room.users.length;
  }

  @Query(() => [Room])
  rooms() {
    return Room.find({ relations: ["users"], where: { private: false } });
  }

  @Mutation(() => Room)
  async createRoom(@Arg("input") input: RoomInput) {
    const room = new Room();
    room.roomName = input.roomName;
    room.description = input.description;
    room.maxPeople = input.maxPeople;
    room.private = input.private;
    room.creatorKey = input.creatorKey;
    room.secretKey = v4();
    if (input.password) {
      const hashedPassword = await argon2.hash(input.password);
      room.password = hashedPassword;
    }
    return room.save();
  }
}
