import {Entity, PrimaryColumn, Column} from "typeorm";

/*
 This is a per-user class, but is the profile extension
 */
@Entity("user_profile")
export class UserProfile {
    // Same ID as the user login
    @PrimaryColumn("uuid")
    id : string | undefined = undefined;

    @Column()
    description : string = '';

// This could include a profile photo, birthday, and self-structured data
}
