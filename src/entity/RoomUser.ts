import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  ManyToOne,
} from "typeorm";
import { Room } from "./Room";

@Entity()
export class RoomUser extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ default: false })
  admin: boolean;

  @ManyToOne(() => Room, (room) => room.users)
  room: Room;

  @Column()
  color: string;
}
