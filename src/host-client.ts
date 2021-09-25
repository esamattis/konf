import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { z } from "zod";
import {
    onZodMessage,
    RPCApi,
    sendMessage,
    ToAsyncFunctions,
    ZodCall,
    ZodResponse,
} from "./shared";

type RPCClient = ToAsyncFunctions<RPCApi>;

export interface HostOptions {
    cmd: ChildProcessWithoutNullStreams;
    username: string;
    host: string;
}

function sendZodCall(
    stream: NodeJS.WritableStream,
    payload: z.infer<typeof ZodCall>,
) {
    sendMessage(stream, payload);
}

async function waitExit(cmd: ChildProcessWithoutNullStreams): Promise<number> {
    if (cmd.exitCode !== null) {
        return cmd.exitCode;
    }

    return await new Promise((resolve, reject) => {
        cmd.on("exit", (code) => {
            resolve(code ?? 0);
        });
        cmd.on("error", reject);
    });
}

export function makeRPCClient<T>(
    cmd: ChildProcessWithoutNullStreams,
): ToAsyncFunctions<T> {
    //     const foo: Record<string, (payload: {}) => Promise<{}>> = implementation;

    const pendingCalls = new Map<
        string,
        {
            resolve: (res: {}) => any;
            reject: (error: Error) => any;
            stackRecorder: Error;
        }
    >();

    onZodMessage(ZodResponse, cmd.stdout, (msg) => {
        console.log("got restponse", msg);
        const defer = pendingCalls.get(msg.callKey);

        if (!defer) {
            console.error(`No pending call for ${msg.callKey}`);
            return;
        }

        pendingCalls.delete(msg.callKey);
        if (msg.response.ok) {
            defer.resolve(msg.response.value);
        } else {
            const error = new Error(
                `RPC call failed on "${msg.name}": ${msg.response.error}`,
            );
            const newStack = [error.stack?.split("\n")[0]]
                .concat(defer.stackRecorder.stack?.split("\n").slice(1))
                .join("\n");

            error.stack = newStack;
            defer.reject(error);
        }
    });

    return new Proxy(
        {},
        {
            get(target, prop) {
                return async (...args: any[]) => {
                    if (typeof prop !== "string") {
                        throw TypeError("Only string props are supported");
                    }

                    const callKey = prop + ":" + Math.random();

                    const promise = new Promise((resolve, reject) => {
                        pendingCalls.set(callKey, {
                            stackRecorder: new Error("stack recorder"),
                            resolve,
                            reject,
                        });
                    });

                    sendZodCall(cmd.stdin, {
                        name: prop,
                        callKey,
                        args,
                    });

                    return promise;
                };
            },
        },
    ) as any;
}

export class HostClient {
    rpc: RPCClient;
    username: string;
    host: string;
    cmd: ChildProcessWithoutNullStreams;

    constructor(options: HostOptions) {
        this.rpc = makeRPCClient<RPCApi>(options.cmd);
        this.cmd = options.cmd;
        this.host = options.host;
        this.username = options.username;
    }

    async disconnect(options?: { exitCode?: number }) {
        const promise = waitExit(this.cmd);
        await this.rpc.exit(options?.exitCode);
        return promise;
    }

    static async connect(options: { username: string; host: string }) {
        const copyFile = spawn("ssh", [
            `${options.username}@${options.host}`,
            "/bin/sh",
            "-eu",
            "-c",
            "cat > /tmp/code.js",
        ]);

        await pipeline(createReadStream("build/server.js"), copyFile.stdin);

        await waitExit(copyFile);

        const runNode = spawn("ssh", [
            `${options.username}@${options.host}`,
            "/var/www/git/node-v16.10.0-linux-x64/bin/node",
            "/tmp/code.js",
        ]);

        return new HostClient({
            cmd: runNode,
            username: options.username,
            host: options.host,
        });
    }
}
