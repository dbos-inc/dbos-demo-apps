import { kapp, YKY } from './app';
import { operon } from "./app";
import { ykyInit } from "./app";
import { Operations } from "./Operations";

operon.init(YKY, Operations)
  .then(() => {
    return operon.userDatabase.createSchema();
  })
  .then(() => {
    console.log("Operon has been initialized!");
    ykyInit();
    kapp.listen(3000, () => {
      console.log("Server started on port 3000");
    });
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
  });

