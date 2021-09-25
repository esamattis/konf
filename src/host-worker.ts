import "source-map-support/register";
import { sh } from "sh-thunk";
import {
    onZodMessage,
    RPCApi,
    sendMessage,
    AsAsync,
    ZodCall,
    ZodResponse,
    waitExit,
} from "./shared";
import { promises as fs } from "fs";
import Path from "path";
import { z } from "zod";
import { spawn } from "child_process";

export interface HostWorkerOptions {
    readable: NodeJS.ReadableStream;
    writable: NodeJS.WritableStream;
}

function readFile(path: string) {
    return fs.readFile(path).then(
        (buf) => {
            return path.toString();
        },
        (error) => {
            if (error.code === "ENOENT") {
                return undefined;
            }

            return Promise.reject(error);
        },
    );
}

const RPCHandlers: AsAsync<RPCApi> = {
    async shell(code, options) {
        const bin = options?.bin ?? "/bin/sh";
        const flags = options?.flags ?? "-eu";
        const outputType = options?.output ?? "stdout";
        const allowNonZero = options?.allowNonZeroExit ?? false;

        const child = spawn(bin, [flags]);

        let output = "";

        if (outputType === "stdout" || outputType === "both") {
            console.log("stdout");
            child.stdout.on("data", (chunk) => {
                console.log("data", chunk);
                if (chunk instanceof Buffer) {
                    output += chunk.toString("utf8");
                }
            });
        }

        if (outputType === "stderr" || outputType === "both") {
            child.stderr.on("data", (chunk) => {
                if (chunk instanceof Buffer) {
                    output += chunk.toString("utf8");
                }
            });
        }

        child.stdin.end(code);

        const exitCode = await waitExit(child);

        if (exitCode !== 0 && !allowNonZero) {
            throw new Error("Bad exit code " + exitCode);
        }

        return {
            output,
            code: exitCode,
        };
    },
    async readFile(path) {
        return await readFile(path);
    },
    async writeFile(path, content) {
        const current = await readFile(path);
        if (current === content) {
            return { changed: false };
        }

        await fs.mkdir(Path.dirname(path), { recursive: true });
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
