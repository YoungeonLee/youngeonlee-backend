import { Field, Int, ObjectType } from "type-graphql";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  OneToMany,
} from "typeorm";
import { RoomUser } from "./RoomUser";
import { v4 } from "uuid";

@ObjectType()
@Entity()
export class Room extends BaseEntity {
  @Field(() => Int)
  @PrimaryGeneratedColumn()
  id: number;

  @Field()
  @Column({ unique: true })
  roomName: string;

  @Field()
  @Column({ nullable: true })
  description: string;

  @Field(() => Int)
  @Column()
  maxPeople: number;

  @Field()
  @Column()
  private: boolean;

  @Column({ nullable: true })
  password: string;

  @Column()
  creatorKey: string;

  @OneToMany(() => RoomUser, (user) => user.room)
  users: RoomUser[];

  @Column({ default: v4() })
  secretKey: string;
}
