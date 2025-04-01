import { Injectable } from "@nestjs/common";
import { ConfiguredInstance, DBOS, InitContext } from "@dbos-inc/dbos-sdk";
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

@Injectable()
export class AppService extends ConfiguredInstance {
  constructor(name: string) {
    super(name);
  }

  async initialize(): Promise<void> {}

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

  @DBOS.transaction()
  async insert(): Promise<GreetingRecord[]> {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: "-",
      length: 2,
      style: "capital",
    });
    return await DBOS.knexClient<GreetingRecord>("dbos_greetings").insert(
      { greeting_name: randomName, greeting_note_content: "Hello World!" },
      ["greeting_name", "greeting_note_content"],
    );
  }
}
