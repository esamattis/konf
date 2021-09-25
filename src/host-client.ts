import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { z } from "zod";
import prettyMs from "pretty-ms";
import c from "chalk";
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

export interface HostMod {
    exec(host: HostClient, depResults: HostModResult[]): Promise<HostModResult>;
    deps?: HostMod[];
    requireChangeOn?: HostMod[];
    describe(): string;
}

export interface HostModResult {
    status: "clean" | "changed" | "skipped";
}

export function mod<Options extends {}>(
    init: (options: Options & { deps?: HostMod[] }) => HostMod,
) {
    return (options: Options & { deps?: HostMod[] }) => {
        const mod = init(options);

        return {
            deps: options.deps,
            ...mod,
        };
    };
}

export class HostClient {
    rpc: RPCClient;
    username: string;
    host: string;
    cmd: ChildProcessWithoutNullStreams;

    modResults = new Map<HostMod, HostModResult>();
    pendingModPromises = new Map<HostMod, Promise<HostModResult>>();

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

    async waitPendingMods() {
        for (const promise of this.pendingModPromises.values()) {
            await promise;
        }
    }

    async applyMod(mod: HostMod): Promise<HostModResult> {
        const result = this.modResults.get(mod);
        if (result) {
            return result;
        }

        const pending = this.pendingModPromises.get(mod);
        if (pending) {
            return await pending;
        }

        console.log(c.blue("applying ") + mod.describe());

        const depResults: HostModResult[] = [];
        if (mod.deps) {
            for (const dep of mod.deps) {
                const res = await this.applyMod(dep);
                depResults.push(res);
            }
        }

        const promise = mod.exec(this, depResults);

        this.pendingModPromises.set(mod, promise);

        const started = Date.now();
        const res = await promise;
        const duration = Date.now() - started;

        this.modResults.set(mod, res);
        this.pendingModPromises.delete(mod);

        console.log(
            `${c.green`done`} ${mod.describe()} ${c.yellow(
                prettyMs(duration),
            )}`,
        );
        return res;
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
