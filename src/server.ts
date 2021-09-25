import "source-map-support/register";
import {
    onZodMessage,
    RCPApi,
    sendMessage,
    ToAsyncFunctions,
    ZodCall,
    ZodResponse,
} from "./shared";
import { inspect } from "util";
import { appendFileSync, promises as fs } from "fs";
import { z } from "zod";

function log(...args: any[]) {
    const msg = args
        .map((part) => {
            if (typeof part === "string") {
                return part;
            }

            return inspect(part);
        })
        .join(" ");

    appendFileSync("/tmp/code.log", msg + "\n");
}

console.log = log;

process.stderr.write = (data) => {
    log(data);
    return true;
};

console.error("waiting for messages");

function sendZodResponse(response: z.infer<typeof ZodResponse>) {
    sendMessage(process.stdout, response);
}

export function implementBackend<T>(implementation: ToAsyncFunctions<T>) {
    const foo: Record<string, (...args: any) => Promise<any>> = implementation;

    onZodMessage(ZodCall, process.stdin, async (msg) => {
        const impl = foo[msg.name];

        if (!impl) {
            sendZodResponse({
                name: msg.name,
                callKey: msg.callKey,
                error: `Method "${msg.name}" not implemented on the server`,
            });
            return;
        }
        let res;

        try {
            res = await impl(...msg.args);
        } catch (error) {
            sendZodResponse({
                name: msg.name,
                callKey: msg.callKey,
                error: String(error),
            });
            return;
        }

        console.log("Created res", res);

        sendZodResponse({
            name: msg.name,
            callKey: msg.callKey,
            response: res,
        });
    });
}

implementBackend<RCPApi>({
    async readFile(path) {
        const res = await fs.readFile(path);
        return res.toString();
    },
    exit(code) {
        process.exit(code);
    },
    //     async doStuff(payload) {
    //         return { contents: "stuff!!" };
    //     },
    //     async doStuff2(payload) {
    //         return { contents: "" };
    //     },
});
