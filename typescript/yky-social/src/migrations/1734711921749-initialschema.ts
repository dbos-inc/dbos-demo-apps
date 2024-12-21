/* eslint-disable no-secrets/no-secrets */

import { MigrationInterface, QueryRunner } from "typeorm";

export class Initialschema1734711921749 implements MigrationInterface {
    name = 'Initialschema1734711921749';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_profile" ("id" uuid NOT NULL, "description" character varying NOT NULL, CONSTRAINT "PK_f44d0cd18cfd80b0fed7806c3b7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_login" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "user_name" character varying NOT NULL, "password_hash" character varying NOT NULL, "active" boolean NOT NULL, CONSTRAINT "UQ_c53a5ee8da57c3e595450dcfa86" UNIQUE ("user_name"), CONSTRAINT "PK_dea1292c6882b56142e9d6f9a99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "post" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "author" uuid NOT NULL, "author_orignal" uuid NOT NULL, "post_time" TIMESTAMP NOT NULL, "text" character varying NOT NULL, "media" text NOT NULL, "tags" text NOT NULL, "mentions" text NOT NULL, "post_type" integer NOT NULL, CONSTRAINT "PK_be5fda3aac270b134ff9c21cdee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "timeline_send" ("user_id" uuid NOT NULL, "send_date" TIMESTAMP NOT NULL, "post_id" uuid NOT NULL, "send_type" integer NOT NULL, CONSTRAINT "PK_99efaf6f31966b3f1eeab2e6f17" PRIMARY KEY ("user_id", "send_date", "post_id"))`);
        await queryRunner.query(`CREATE TABLE "timeline_recv" ("user_id" uuid NOT NULL, "from_user_id" uuid NOT NULL, "send_date" TIMESTAMP NOT NULL, "post_id" uuid NOT NULL, "recv_type" integer NOT NULL, "unread" boolean NOT NULL, CONSTRAINT "PK_a8bb5a07347064f97df1588c9e3" PRIMARY KEY ("user_id", "from_user_id", "send_date", "post_id"))`);
        await queryRunner.query(`CREATE TABLE "social_graph" ("src_id" uuid NOT NULL, "tgt_id" uuid NOT NULL, "link_type" integer NOT NULL, CONSTRAINT "PK_a9a4365b92ab61b882937571eba" PRIMARY KEY ("src_id", "tgt_id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "sg_tgt_src" ON "social_graph" ("tgt_id", "src_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "sg_src_tgt" ON "social_graph" ("src_id", "tgt_id") `);
        await queryRunner.query(`CREATE TABLE "media_item" ("media_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "media_type" integer NOT NULL, "media_usage" integer NOT NULL, "description" character varying NOT NULL, "media_url" character varying NOT NULL, CONSTRAINT "PK_e03716a601288be297ecbf0e17b" PRIMARY KEY ("media_id"))`);
        await queryRunner.query(`ALTER TABLE "post" ADD CONSTRAINT "FK_02ae38efb048ff5201d9bc632e1" FOREIGN KEY ("author") REFERENCES "user_login"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timeline_send" ADD CONSTRAINT "FK_d36a7cb6f001feb4e4f8edef01e" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timeline_recv" ADD CONSTRAINT "FK_aface6e5003accd94b0ee19bb29" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timeline_recv" DROP CONSTRAINT "FK_aface6e5003accd94b0ee19bb29"`);
        await queryRunner.query(`ALTER TABLE "timeline_send" DROP CONSTRAINT "FK_d36a7cb6f001feb4e4f8edef01e"`);
        await queryRunner.query(`ALTER TABLE "post" DROP CONSTRAINT "FK_02ae38efb048ff5201d9bc632e1"`);
        await queryRunner.query(`DROP TABLE "media_item"`);
        await queryRunner.query(`DROP INDEX "public"."sg_src_tgt"`);
        await queryRunner.query(`DROP INDEX "public"."sg_tgt_src"`);
        await queryRunner.query(`DROP TABLE "social_graph"`);
        await queryRunner.query(`DROP TABLE "timeline_recv"`);
        await queryRunner.query(`DROP TABLE "timeline_send"`);
        await queryRunner.query(`DROP TABLE "post"`);
        await queryRunner.query(`DROP TABLE "user_login"`);
        await queryRunner.query(`DROP TABLE "user_profile"`);
    }

}
