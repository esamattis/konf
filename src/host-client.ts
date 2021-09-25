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
    AsAsync,
    ZodCall,
    ZodResponse,
} from "./shared";

type RPCClient = AsAsync<RPCApi>;

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
): AsAsync<T> {
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

export interface DefaultModParams {
    deps?: HostMod[];
    whenChanged?: HostMod[];
}

export interface HostModOptions<Results = any> extends DefaultModParams {
    name: string;
    concurrency?: number;
    description: string;
    exec(
        host: HostClient,
        depResults: HostModResult<unknown>[],
    ): Promise<{ status: "clean" | "changed" | "skipped"; results: Results }>;
}

export class HostMod<Results = {}> {
    private options: HostModOptions<Results>;

    constructor(options: HostModOptions<Results>) {
        this.options = options;
    }

    get deps() {
        return this.options.deps;
    }

    get whenChanged() {
        return this.options.whenChanged;
    }

    get name() {
        return this.options.name;
    }

    get cocurrency() {
        return this.options.concurrency ?? 10;
    }

    async exec(
        host: HostClient,
        depResults: HostModResult<unknown>[],
    ): Promise<HostModResult<Results>> {
        const res = await this.options.exec(host, depResults);

        if (res.status === "changed") {
            return {
                name: this.name,
                status: res.status,
                results: res.results,
            };
        }

        if (res.status === "clean") {
            return {
                name: this.name,
                status: res.status,
            };
        }

        if (res.status === "skipped") {
            return {
                name: this.name,
                status: res.status,
            };
        }

        throw new Error("Bad response status");
    }

    get description() {
        return `[${this.name}]: ${this.options.description}`;
    }
}

/**
 * Create mod type
 */
export function modType<Params extends {}, Results extends {}>(
    init: (params: Params & DefaultModParams) => HostModOptions,
) {
    const createMod = (params: Params & DefaultModParams) => {
        const options = init(params);
        return new HostMod<Results>(options);
    };

    createMod.isResults = function isResult(
        res: HostModResult | undefined,
    ): res is ChangedResults<Results> {
        return Boolean(res && res.name === this.name);
    };

    return createMod;
}

export interface CleanResults {
    name: string;
    status: "clean";
}

export interface SkippedResults {
    name: string;
    status: "skipped";
}

export interface ChangedResults<R> {
    name: string;
    status: "changed";
    results: R;
}

export type HostModResult<Results = any> =
    | CleanResults
    | SkippedResults
    | ChangedResults<Results>;

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

    async applyMod<Result>(
        mod: HostMod<Result>,
    ): Promise<HostModResult<Result>> {
        const result = this.modResults.get(mod);
        if (result) {
            return result;
        }

        const pending = this.pendingModPromises.get(mod);
        if (pending) {
            return await pending;
        }

        let resolve = (_res: HostModResult) => {};
        this.pendingModPromises.set(
            mod,
            new Promise<HostModResult>((r) => {
                resolve = r;
            }),
        );

        console.log(c.blue("applying ") + mod.description);

        const depResults: HostModResult[] = [];
        if (mod.deps) {
            for (const dep of mod.deps) {
                const res = await this.applyMod(dep);
                depResults.push(res);
            }
        }

        if (mod.whenChanged) {
            let changed = false;
            for (const dep of mod.whenChanged) {
                const res = await this.applyMod(dep);
                depResults.push(res);
                if (res.status === "changed") {
                    changed;
                }
            }

            if (!changed) {
                const skipResult: HostModResult = {
                    name: mod.name,
                    status: "skipped",
                };
                this.modResults.set(mod, skipResult);
                return skipResult;
            }
        }

        const started = Date.now();
        const res = await mod.exec(this, depResults);
        const duration = Date.now() - started;

        this.modResults.set(mod, res);
        this.pendingModPromises.delete(mod);

        resolve(res);
        console.log(
            `${c.green`done`} ${mod.description} ${c.yellow(
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
