import {Entity, JoinColumn, ManyToOne, PrimaryColumn, Column} from "typeorm";

import { Post } from "./Post";

/*
 Type of graph relationship
 */
export enum SendType {
    PM = 0,
    POST = 1,
    REPOST = 2,
}

/*
 * Send timeline
 * By user, a time-ordered list of sends
 */
 @Entity("timeline_send")
export class TimelineSend {
    @PrimaryColumn("uuid")
    user_id: string | undefined = undefined;

    @PrimaryColumn("timestamp")
    send_date: Date | undefined = undefined;

    @PrimaryColumn("uuid")
    post_id: string | undefined = undefined;

    @Column()
    send_type: SendType = SendType.PM;

    @ManyToOne(() => Post/*, (user) => user.photos*/)
    @JoinColumn({ name: "post_id" })
    post : Post | null = null;
}

/*
 Type of graph relationship
 */
 export enum RecvType {
    PM = 0,
    POST = 1,    // Followed poster
    FRIEND_MENTION = 2, // Friend mentioned in a post
}

/*
 * Receiver timeline
 * By user, a time-ordered list of receives
 */
@Entity("timeline_recv")
export class TimelineRecv {
    @PrimaryColumn("uuid")
    user_id: string | undefined = undefined;

    @PrimaryColumn("uuid")
    from_user_id: string | undefined = undefined;

    @PrimaryColumn("timestamp")
    send_date: Date | undefined = undefined;

    @PrimaryColumn("uuid")
    post_id: string | undefined = undefined;

    @Column()
    recv_type: RecvType = RecvType.PM;

    @Column()
    unread : boolean = true;

    @ManyToOne(() => Post/*, (user) => user.photos*/)
    @JoinColumn({ name: "post_id" })
    post : Post | null = null;
}