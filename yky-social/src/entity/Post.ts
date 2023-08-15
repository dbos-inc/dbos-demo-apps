import {Entity, PrimaryGeneratedColumn, ManyToOne, Column, JoinColumn} from "typeorm";
import { UserLogin } from "./UserLogin";

export enum PostType {
  POST = 0,
  REPOST = 1,
  REPLY = 2,
  PM = 3
}

@Entity()
export class Post {
    @PrimaryGeneratedColumn("uuid")
    id: string | undefined = undefined;

    // The one posting it
    @Column("uuid", { nullable: false })
    author ?: string = undefined;

    // For reposts
    @Column("uuid")
    author_orignal ?: string = undefined;
  
    // Posted time
    @Column("timestamp")
    post_time ?: Date = undefined;

    // Text
    @Column()
    text : string = "";

    // Media
    @Column("simple-array")
    media : string[] = [];

    // Tags
    @Column("simple-array")
    tags : string[] = [];

    // Tagged users
    @Column("simple-array")
    mentions : string[] = [];

    // Post Type
    @Column()
    post_type : PostType = PostType.POST;

    // Original had URLs...
    // Original also kept the user names, not just the ids...
    // Should it have reply-to?

    @ManyToOne(() => UserLogin/*, (user) => user.photos*/)
    @JoinColumn({ name: "author" })
    authorUser : UserLogin | null = null;
}

