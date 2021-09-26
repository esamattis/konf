import Path from "path";
import { promises as fs } from "fs";
import { AsAsync, exec, readFile } from "./shared";

export interface RPCApi {
    shell(
        code: string,
        options?: {
            output?: "stdout" | "stderr" | "both" | "none";
        },
    ): { code: number; output: string };
    readFile(path: string): string | undefined;
    writeFile(path: string, content: string): { changed: boolean };
    exit(code?: number): void;
}

export const RPCHandlers: AsAsync<RPCApi> = {
    async shell(script, options) {
        const res = await exec(script, {});
        let output = res.stdout;

        if (options?.output === "stderr") {
            output = res.stderr;
        } else if (options?.output === "both") {
            output = res.output;
        }

        return {
            code: res.code,
            output,
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
