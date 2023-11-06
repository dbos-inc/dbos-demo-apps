import { cookies } from 'next/headers';
import jwt from "jsonwebtoken";

const JWT_TOKEN_KEY = process.env.JWT_TOKEN_KEY || "super duper secret key";

interface ErrorStatus {
    message: string;
    status ?: number;
}

export function hasuserid() : boolean
{
    return cookies().get("auth") ? true : false;
}

export function getuserid() : string
{
    const auth = cookies().get("auth");

    if (!auth) {
        const err = new Error("No authorization token") as ErrorStatus;
        err.status = 401;
        throw err;
    }

    try {
        const udata = jwt.verify(auth.value, JWT_TOKEN_KEY);

        if (!udata) {
            const err = new Error("Authorization token not verified") as ErrorStatus;
            err.status = 401;
            throw err;
        }
        const userid = (udata as any).userid;
    
        return userid;
    }
    catch (e) {
        if (e instanceof Error) {
            const err = new Error(e.message) as ErrorStatus;
            err.status = 401;
            throw err;
        }
        throw e;
    }
}