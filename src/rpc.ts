import Path from "path";
import { promises as fs } from "fs";
import {
    AsAsync,
    exec,
    fileHash,
    fileInfo,
    readFile,
    SystemdService,
} from "./shared";
import { tmpdir } from "os";

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
    service(options: {
        service: string;
        action: "start" | "restart" | "reload" | "stop";
    }): {
        changed: boolean;
    };
    extractBase64Archive(options: {
        data: string;
        rev: string;
        dest: string;
    }): { changed: boolean };
    fileFromBase64(options: { data: string; dest: string }): void;
    fileHash(path: string): string | undefined;
}

function assertAllCases(value: never): never {
    throw new Error("Not checked all switch-cases");
}

export const RPCHandlers: AsAsync<RPCApi> = {
    async fileFromBase64(options) {
        await fs.mkdir(Path.dirname(options.dest), { recursive: true });
        await fs.writeFile(options.dest, Buffer.from(options.data, "base64"));
    },
    async fileHash(path) {
        return await fileHash(path);
    },
    async extractBase64Archive(options) {
        const rand = Math.random().toString().slice(2);
        const tmpDir = "/tmp/konf-archive-" + rand;
        const tmpOld = Path.join(tmpDir, "old");
        const tmpNew = Path.join(tmpDir, "new");
        const archiveName = ".konf-git-archive.tar.gz";
        const archivePath = Path.join(tmpNew, archiveName);

        await fs.mkdir(tmpNew, { recursive: true });

        await fs.writeFile(archivePath, Buffer.from(options.data, "base64"));

        await exec(["tar", "xzvf", archiveName], { cwd: tmpNew });

        await fs.writeFile(Path.join(tmpNew, ".konf-git-rev"), options.rev);

        await fs.unlink(archivePath);

        const destInfo = await fileInfo(options.dest);

        if (destInfo) {
            await fs.rename(options.dest, tmpOld);
        }

        await fs.rename(tmpNew, options.dest);

        await fs.rm(tmpDir, { recursive: true });

        return { changed: true };
    },
    async service(options) {
        const service = new SystemdService(options.service);
        const status = await service.status();

        switch (options.action) {
            case "start": {
                switch (status) {
                    case "dead": {
                        await service.start();
                        return { changed: true };
                    }
                    case "running": {
                        return { changed: false };
                    }
                    default: {
                        assertAllCases(status);
                    }
                }
            }
            case "restart": {
                switch (status) {
                    case "dead": {
                        await service.start();
                        return { changed: true };
                    }
                    case "running": {
                        await service.restart();
                        return { changed: true };
                    }
                    default: {
                        assertAllCases(status);
                    }
                }
            }

            case "reload": {
                switch (status) {
                    case "dead": {
                        await service.start();
                        return { changed: true };
                    }
                    case "running": {
                        await service.reload();
                        return { changed: true };
                    }
                    default: {
                        assertAllCases(status);
                    }
                }
            }

            case "stop": {
                switch (status) {
                    case "dead": {
                        return { changed: false };
                    }
                    case "running": {
                        await service.stop();
                        return { changed: true };
                    }
                    default: {
                        assertAllCases(status);
                    }
                }
            }

            default: {
                assertAllCases(options.action);
            }
        }
    },
    async apt(options) {
        if (options.packages.length === 0) {
            return { changed: false };
        }

        const res = await exec(
            [
                "apt-get",
                "install",
                "--no-install-recommends",
                "--no-upgrade",
                "-y",
                ...options.packages,
            ],
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
