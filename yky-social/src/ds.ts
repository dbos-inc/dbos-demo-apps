import "reflect-metadata";

import { app } from './app';
import { userDataSource } from "./app";

userDataSource.initialize()
    .then(() => {
        console.log("User Data Source has been initialized!");
        app.listen(3000, () => {
            console.log("Server started on port 3000");
        });
    })
    .catch((err) => {
        console.error("Error during Data Source initialization", err);
    });
