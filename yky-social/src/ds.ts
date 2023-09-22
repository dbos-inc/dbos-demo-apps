import "reflect-metadata";

import { kapp } from './app';
import { userDataSource } from "./app";
import { operon } from "./app";
import { YKY } from "./app";

userDataSource.initialize()
  .then(() => {
    // Set operon DS to typeorm
    operon.useTypeORM(userDataSource);
  })
  .then(() => {
    operon.init(YKY);
  })
  .then(() => {
    console.log("User Data Source has been initialized!");
    kapp.listen(3000, () => {
      console.log("Server started on port 3000");
    });
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
  });
