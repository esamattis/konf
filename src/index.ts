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
              payload: Parameters<Type[Property]>[0],
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
            defer.reject(new Error(msg.error));
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

async function main() {
    //     const cmd = spawn("ssh", [
    //         "-t",
    //         "git@valu-playbooks.test",

    //         "sh",
    //         "/vagrant/script.sh",
    //     ]);
    //     printlines(cmd);

    //     cmd.stdin.write("foocontent\n");
    //     cmd.stdin.write(EOL);

    //     cmd.stdin.write("bar conent\n");

    //     cmd.stdin.write(EOL);

    const res = await build({
        entryPoints: ["src/server.ts"],
        target: "node16",
        format: "cjs",
        platform: "node",
        sourcemap: "inline",
        bundle: true,
        outdir: "build",
    });

    const copyFile = spawn("ssh", [
        "git@valu-playbooks.test",
        "/bin/sh",
        "-eu",
        "-c",
        "cat > /tmp/code.js",
    ]);

    await pipeline(createReadStream("build/server.js"), copyFile.stdin);

    console.log("waiting copy file");
    await waitExit(copyFile);

    console.log("runnode");

    const runNode = spawn("ssh", [
        "git@valu-playbooks.test",
        // "/bin/sh",
        "/var/www/git/node-v16.10.0-linux-x64/bin/node",
        "/tmp/code.js",
    ]);

    //     runNode.stdin.write(`
    //     	set -eu

    // 	exec 2>> /tmp/code.log

    //     	exec /var/www/git/node-v16.10.0-linux-x64/bin/node /tmp/code.js
    //     `);
    const client = makeClient<RCPApi>(runNode);

    const foo = await client.readFile("/etc/hosts");
    console.log("DONE", foo);

    const code = await waitExit(runNode);
    console.log("exit code", code);
}

main();
