import Path from "path";
import { promises as fs } from "fs";
import { AsAsync, exec, fileInfo, readFile } from "./shared";

export interface RPCApi {
    shell(
        code: string,
        options?: {
            output?: "stdout" | "stderr" | "both" | "none";
        },
    ): { code: number; output: string };
    readFile(path: string): string | undefined;
    writeFile(path: string, content: string): { changed: boolean };
    remove(path: string): { changed: boolean };
    exit(code?: number): void;
    apt(options: { packages: string[] }): { changed: boolean };
}

export const RPCHandlers: AsAsync<RPCApi> = {
    async apt(options) {
        if (options.packages.length === 0) {
            return { changed: false };
        }

        const res = await exec(
            ["apt-get", "install", "--no-upgrade", "-y", ...options.packages],
            {
                env: { DEBIAN_FRONTEND: "noninteractive" },
            },
        );

        const match = /([0-9]+) newly installed/.exec(res.stdout);
        const changed = match?.[1] !== "0";

        return { changed };
    },

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
    async remove(path) {
        const info = await fileInfo(path);
        if (info) {
            await fs.rm(path, { recursive: true });
            return { changed: true };
        }

        return { changed: false };
    },
    async exit(code) {
        setTimeout(() => {
            process.exit(code);
        }, 100);
    },
};
