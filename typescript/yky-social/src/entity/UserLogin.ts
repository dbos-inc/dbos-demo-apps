import {Entity, PrimaryGeneratedColumn, Column} from "typeorm";

/*
 This is a per-user class, for login info.
 The profile, which is larger, shares the same key, but is in a different table
 What if we want to use an external auth service like "sign in with google" or use Okta?
 */
@Entity("user_login")
export class UserLogin {
    @PrimaryGeneratedColumn("uuid")
    id: string | undefined = undefined;

    @Column()
    first_name : string = '';

    @Column()
    last_name : string = '';

    @Column({unique: true})
    user_name : string = '';

    // This includes salt and hash as provided by bcrypt
    @Column()
    password_hash : string = '';

    @Column()
    active : boolean = true;
}
