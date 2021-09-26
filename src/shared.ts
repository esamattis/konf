import { promises as fs } from "fs";
import { assertNotNil } from "@valu/assert";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import rl from "readline";
import { z, ZodType } from "zod";

export const ZodCall = z
    .object({
        name: z.string(),
        callKey: z.string(),
        args: z.array(z.any()),
    })
    .strict();

export function recordStack() {
    const stackRecorder = new Error("stack recorder");

    return {
        updateStack(error: Error) {
            const newStack = [error.stack?.split("\n")[0]]
                .concat(stackRecorder.stack?.split("\n").slice(1))
                .join("\n");

            error.stack = newStack;
        },
    };
}

export const ZodResponse = z
    .object({
        name: z.string(),
        callKey: z.string(),

        response: z.union([
            z.object({
                ok: z.literal(true),
                value: z.any(),
            }),
            z.object({
                ok: z.literal(false),
                error: z.string(),
            }),
        ]),
    })
    .strict();

async function onLine(
    stream: NodeJS.ReadableStream,
    onLine: (line: string) => any,
) {
    const lineReader = rl.createInterface({
        input: stream,
        terminal: false,
    });

    for await (const line of lineReader) {
        onLine(line);
    }
}

export type AsAsync<Type extends {}> = {
    [Property in keyof Type as Type[Property] extends (...args: any[]) => any
        ? Property
        : never]: Type[Property] extends (...args: any[]) => any
        ? (
              ...args: Parameters<Type[Property]>
          ) => Promise<ReturnType<Type[Property]>>
        : never;
};

export async function onZodMessage<Z extends ZodType<any, any, any>>(
    type: Z,
    stream: NodeJS.ReadableStream,
    onZodMessage: (call: ReturnType<Z["parse"]>) => any,
) {
    await onLine(stream, (line) => {
        let data;

        try {
            data = JSON.parse(line);
        } catch (error) {
            console.error("Failed to parse line", error);
        }

        const call = type.safeParse(data);

        if (call.success) {
            onZodMessage(call.data);
        } else {
            console.error("Failed to parse call data", call.error);
        }
    });
}

export function sendMessage(stream: NodeJS.WritableStream, payload: {}) {
    stream.write(JSON.stringify(payload) + "\n");
}

export async function waitExit(
    cmd: ChildProcessWithoutNullStreams,
    stack?: ReturnType<typeof recordStack>,
): Promise<number> {
    if (cmd.exitCode !== null) {
        return cmd.exitCode;
    }

    return await new Promise((resolve, reject) => {
        cmd.on("exit", (code) => {
            resolve(code ?? 0);
        });
        cmd.on("error", (error) => {
            if (stack) {
                stack.updateStack(error);
            }

            reject(error);
        });
    });
}

export interface ExecOptions {
    shell?: string;
    shellFlags?: string;
    allowNonZeroExit?: boolean;
    cwd?: string;
    env?: Record<string, string>;
}

export async function exec(command: string | string[], options?: ExecOptions) {
    const stack = recordStack();
    let bin = options?.shell ?? "/bin/sh";
    let args = options?.shellFlags ? ["-eux"] : [];
    const allowNonZero = options?.allowNonZeroExit ?? false;

    if (Array.isArray(command)) {
        assertNotNil(command[0], "cannot pass empty array as command");
        bin = command[0];
        args = command.slice(1);
    }

    const child = spawn(bin, args, {
        cwd: options?.cwd,
        env: {
            ...process.env,
            ...options?.env,
        },
    });

    let both = "";
    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
        if (chunk instanceof Buffer) {
            const str = chunk.toString("utf8");
            stdout += str;
            both += str;
        }
    });

    child.stderr.on("data", (chunk) => {
        if (chunk instanceof Buffer) {
            const str = chunk.toString("utf8");
            stderr += str;
            both += str;
        }
    });

    // is a shell script
    if (typeof command === "string") {
        child.stdin.end(command);
    }

    const exitCode = await waitExit(child);

    if (exitCode !== 0 && !allowNonZero) {
        let cmdStr = "";
        if (Array.isArray(command)) {
            cmdStr = `Command: "${command.join(" ")}"`;
        }
        const error = new Error(
            `Bad exit code ${exitCode}.${cmdStr} Output: ${both} `,
        );
        stack.updateStack(error);
        throw error;
    }

    return {
        stdout,
        stderr,
        output: both,
        code: exitCode,
    };
}

export function readFile(path: string) {
    return fs.readFile(path).then(
        (buf) => {
            return buf.toString("utf-8");
        },
        (error) => {
            if (error.code === "ENOENT") {
                return undefined;
            }

            return Promise.reject(error);
        },
    );
}

export function fileInfo(path: string) {
    return fs.stat(path).then(
        (stat) => {
            let type: "file" | "directory" | "other" = "other";

            if (stat.isFile()) {
                type = "file";
            } else if (stat.isDirectory()) {
                type = "directory";
            }

            return {
                type,
            };
        },
        (error) => {
            if (error.code === "ENOENT") {
                return undefined;
            }

            return Promise.reject(error);
        },
    );
}

export class SystemdService {
    service: string;

    constructor(service: string) {
        this.service = service;
    }

    async status(): Promise<"running" | "dead"> {
        const res = await exec([
            "systemctl",
            "show",
            this.service,
            "-p",
            "SubState",
            "--value",
        ]);

        if (res.stdout.trim() === "running") {
            return "running";
        }

        return "dead";
    }

    async start() {
        await exec(["systemctl", "start", this.service]);
    }

    async stop() {
        await exec(["systemctl", "stop", this.service]);
    }

    async restart() {
        await exec(["systemctl", "restart", this.service]);
    }

    async reload() {
        await exec(["systemctl", "reload", this.service]);
    }
}
