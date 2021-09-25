import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { z } from "zod";
import { promises as fs, createReadStream } from "fs";
import { transform, build } from "esbuild";
import rl from "readline";
import { pipeline } from "stream/promises";
import {
    onZodMessage,
    RCPApi,
    sendMessage,
    ZodCall,
    ZodResponse,
} from "./shared";

function foo() {
    console.log("2jlalaaalalal");
}

async function waitExit(cmd: ChildProcessWithoutNullStreams): Promise<number> {
    return await new Promise((resolve, reject) => {
        cmd.on("exit", (code) => {
            resolve(code ?? 0);
        });
        cmd.on("error", reject);
    });
}

function sendZodCall(
    stream: NodeJS.WritableStream,
    payload: z.infer<typeof ZodCall>,
) {
    sendMessage(stream, payload);
}

type ToAsyncFunctions<Type extends {}> = {
    [Property in keyof Type as Type[Property] extends (...args: any[]) => any
        ? Property
        : never]: Type[Property] extends (...args: any[]) => any
        ? (
              ...args: Parameters<Type[Property]>
          ) => Promise<ReturnType<Type[Property]>>
        : never;
};

export function makeClient<T>(
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
        if (msg.response) {
            defer.resolve(msg.response);
        } else if (msg.error) {
            const error = new Error(
                `RPC call failed on "${msg.name}": ${msg.error}`,
            );
            const newStack = [error.stack?.split("\n")[0]]
                .concat(defer.stackRecorder.stack?.split("\n").slice(1))
                .join("\n");

            error.stack = newStack;
            defer.reject(error);
        } else {
            defer.reject(new Error(`Unknown error from ${msg.name}`));
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

async function connectServer(options: { username: string; host: string }) {
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

    return { api: makeClient<RCPApi>(runNode), process: runNode };
}

async function main() {
    await build({
        entryPoints: ["src/server.ts"],
        target: "node16",
        format: "cjs",
        platform: "node",
        sourcemap: "inline",
        bundle: true,
        outdir: "build",
    });

    const vagrant = await connectServer({
        username: "git",
        host: "valu-playbooks.test",
    });

    const foo = await vagrant.api.readFile("/etc/hosts");
    console.log("DONE", foo);

    vagrant.api.exit();
}

main();
