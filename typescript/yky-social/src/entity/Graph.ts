import {Entity, Index, PrimaryColumn, Column} from "typeorm";

/*
 Type of graph relationship
 */
export enum GraphType {
    NONE = 0,
    BLOCK = 1,         // Do not allow target to see source users stuff
    FOLLOW = 2,        // Automatically see target's stuff on source timeline
    FRIEND = 3,        // Allow target to see source's friends-only stuff
    FOLLOW_FRIEND = 4, // Follow and friend together
}

/*
 Some sort of follower/followee stuff
 Friends too
 */
 @Entity("social_graph")
 @Index("sg_src_tgt", ["src_id", "tgt_id"], { unique: true }) // This is redundant with PK
 @Index("sg_tgt_src", ["tgt_id", "src_id"], { unique: true })
export class SocialGraph {
    // Same ID as the user login
    @PrimaryColumn("uuid")
    src_id: string | undefined = undefined;

    @PrimaryColumn("uuid")
    tgt_id = '';

    @Column()
    link_type: GraphType = GraphType.FOLLOW;
}