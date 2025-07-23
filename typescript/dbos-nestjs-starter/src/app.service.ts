import { Injectable } from "@nestjs/common";
import { ConfiguredInstance, DBOS } from "@dbos-inc/dbos-sdk";
import { KnexDataSource } from "@dbos-inc/knex-datasource";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";

export interface GreetingRecord {
  greeting_name: string;
  greeting_note_content: string;
}

const config = {
  client: 'pg',
  connection: process.env.DBOS_DATABASE_URL || {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'dbos_nest_starter',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
  },
};
const appds = new KnexDataSource('appdb', config);

@Injectable()
export class AppService extends ConfiguredInstance {
  constructor(name: string) {
    super(name);
  }

  override async initialize(): Promise<void> {
    DBOS.logger.info(`Initializing DBOS provider ${this.name}`);
    return Promise.resolve();
  }

  @DBOS.workflow()
  async getHello() {
    DBOS.logger.info("Hello from a wf");
    await this.sendHTTPrequest();
    const res = await this.insert();
    return JSON.stringify(res);
  }

  @DBOS.step()
  async sendHTTPrequest() {
    const response = await fetch("https://example.com");
    const data = await response.text();
    return data;
  }

  @appds.transaction()
  async insert(): Promise<GreetingRecord[]> {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: "-",
      length: 2,
      style: "capital",
    });
    return await KnexDataSource.client<GreetingRecord>("dbos_greetings").insert(
      { greeting_name: randomName, greeting_note_content: "Hello World!" },
      ["greeting_name", "greeting_note_content"],
    );
  }
}
