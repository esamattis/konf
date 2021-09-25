import "source-map-support/register";
import {
    onZodMessage,
    RPCApi,
    sendMessage,
    AsAsync,
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

export interface HostWorkerOptions {
    readable: NodeJS.ReadableStream;
    writable: NodeJS.WritableStream;
}

const RPCHandlers: AsAsync<RPCApi> = {
    async readFile(path) {
        const res = await fs.readFile(path);
        return res.toString();
    },
    async writeFile(path, content) {
        await fs.writeFile(path, content);
        return { changed: true };
    },
    async exit(code) {
        setTimeout(() => {
            process.exit(code);
        }, 100);
    },
};

export class HostWorker {
    options: HostWorkerOptions;

    handlers: AsAsync<RPCApi>;

    constructor(options: HostWorkerOptions) {
        this.options = options;

        this.handlers = RPCHandlers;
    }

    sendResponse(response: z.infer<typeof ZodResponse>) {
        sendMessage(this.options.writable, response);
    }

    init() {
        const genericHandlers: Record<string, (...args: any) => Promise<any>> =
            this.handlers;

        onZodMessage(ZodCall, this.options.readable, async (msg) => {
            const handler = genericHandlers[msg.name];

            if (!handler) {
                this.sendResponse({
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
                responseValue = await handler(...msg.args);
            } catch (error) {
                console.error(`RPC method "${msg.name}" failed`, error);
                this.sendResponse({
                    name: msg.name,
                    callKey: msg.callKey,
                    response: {
                        ok: false,
                        error: String(error),
                    },
                });
                return;
            }

            this.sendResponse({
                name: msg.name,
                callKey: msg.callKey,
                response: {
                    ok: true,
                    value: responseValue,
                },
            });
        });
    }
}
