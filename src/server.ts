import "source-map-support/register";
import {
    onZodMessage,
    RPCApi,
    sendMessage,
    ToAsyncFunctions,
    ZodCall,
    ZodResponse,
} from "./shared";
import { inspect } from "util";
import { appendFileSync, promises as fs, writeFile } from "fs";
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
                response: {
                    ok: false,
                    error: `Method "${msg.name}" not implemented on the server`,
                },
            });
            return;
        }

        let responseValue;

        try {
            responseValue = await impl(...msg.args);
        } catch (error) {
            sendZodResponse({
                name: msg.name,
                callKey: msg.callKey,
                response: {
                    ok: false,
                    error: String(error),
                },
            });
            return;
        }

        sendZodResponse({
            name: msg.name,
            callKey: msg.callKey,
            response: {
                ok: true,
                value: responseValue,
            },
        });
    });
}

implementBackend<RPCApi>({
    async readFile(path) {
        const res = await fs.readFile(path);
        return res.toString();
    },
    async writeFile(path, content) {
        // await fs.writeFile(path, content);
        return { changed: true };
    },
    async exit(code) {
        setTimeout(() => {
            process.exit(code);
        }, 100);
    },
    //     async doStuff(payload) {
    //         return { contents: "stuff!!" };
    //     },
    //     async doStuff2(payload) {
    //         return { contents: "" };
    //     },
});
