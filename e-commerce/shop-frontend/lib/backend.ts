import { Configuration, DefaultApi } from "@/client";


export const backendAddress = "http://localhost:8082";

const config = new Configuration({
    basePath: backendAddress
})

export const api = new DefaultApi(config);
