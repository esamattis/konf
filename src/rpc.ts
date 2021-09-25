import { spawn } from "child_process";
import Path from "path";
import { promises as fs } from "fs";
import { AsAsync, waitExit } from "./shared";

export interface RPCApi {
    shell(
        code: string,
        options?: {
            bin?: string;
            flags?: string;
            allowNonZeroExit?: boolean;
            output?: "stdout" | "stderr" | "both" | "none";
        },
    ): { code: number; output: string };
    readFile(path: string): string | undefined;
    writeFile(path: string, content: string): { changed: boolean };
    exit(code?: number): void;
}

function readFile(path: string) {
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

export const RPCHandlers: AsAsync<RPCApi> = {
    async shell(code, options) {
        const bin = options?.bin ?? "/bin/sh";
        const flags = options?.flags ?? "-eu";
        const outputType = options?.output ?? "stdout";
        const allowNonZero = options?.allowNonZeroExit ?? false;
        console.log("running: " + code);

        const child = spawn(bin, [flags]);

        let output = "";

        if (outputType === "stdout" || outputType === "both") {
            child.stdout.on("data", (chunk) => {
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
