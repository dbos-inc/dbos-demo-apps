import {Entity, PrimaryGeneratedColumn, Column} from "typeorm";

/*
 Type of graph relationship
 */
export enum MediaType {
    INVALID = 0,
    JPG = 1,
    PNG = 2,
}

export enum MediaUsage {
    INVALID = 0,
    PROFILE = 1,
    POST = 2,
}

/*
 * Media reference
 * The contents are not stored here, but this ties on to the ownership / viewer info
 * The lifecycle of the item is that it goes from a placeholder (invalid) to a type once
 *   uploaded.  Then it can be referenced by something else.
 */
 @Entity("media_item")
export class MediaItem {
    @PrimaryGeneratedColumn("uuid")
    media_id: string | undefined = undefined;

    @Column("uuid")
    owner_id = '';

    @Column()
    media_type: MediaType = MediaType.INVALID;

    @Column()
    media_usage: MediaUsage = MediaUsage.INVALID;

    @Column()
    description : string = '';

    @Column()
    media_url : string = '';
}
