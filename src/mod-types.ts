import { assertNotNil } from "@valu/assert";
import fetch from "node-fetch";
import Path from "path";
import { createWriteStream, promises as fs } from "fs";
import { Git } from "./git";
import { HostClient } from "./host-client";
import { HostModResult, modType } from "./mod";
import { download, hash, readAsBase64 } from "./utils";
import { fileHash, fileInfo } from "./shared";
import { pipeline } from "stream/promises";

export const file = modType<
    {
        dest: string;
        content?: string | ((host: HostClient) => string | Promise<string>);
        state?: "present" | "absent";
    },
    {}
>((options) => {
    const state = options.state ?? "present";

    return {
        name: "file",

        concurrency: 3,

        description: `${state} ${options.dest}`,

        async exec(host) {
            if (state === "absent") {
                const res = await host.rpc.remove(options.dest);
                return {
                    status: res.changed ? "changed" : "clean",
                    results: {},
                };
            }

            let content = "";

            if (typeof options.content === "string") {
                content = options.content;
            } else if (typeof options.content === "function") {
                content = await options.content(host);
            }

            const res = await host.rpc.writeFile(options.dest, content);

            return {
                status: res.changed ? "changed" : "clean",
                results: {},
            };
        },
    };
});

export const shell = modType<
    {
        command: string;
        output?: "stdout" | "stderr" | "both" | "none";
        detectChange?: (output: string, code: number) => boolean;
    },
    { ouput: string; code: number }
>((options) => {
    return {
        name: "shell",

        concurrency: 3,

        description: "",

        async exec(host) {
            const res = await host.rpc.shell(options.command, {
                output: options.output,
            });

            let changed = true;

            if (options.detectChange) {
                changed = options.detectChange(res.output, res.code);
            }

            return {
                status: changed ? "changed" : "clean",
                results: { code: res.code, ouput: res.output },
            };
        },
    };
});

export const apt = modType<
    {
        package: string | string[];
        state?: "absent" | "present";
    },
    {}
>((options) => {
    const state = options.state ?? "present";
    const packages = Array.isArray(options.package)
        ? options.package
        : [options.package];

    return {
        name: "apt",

        concurrency: 3,

        description: `${state} ${packages.join(",")}`,

        async exec(host) {
            const res = await host.rpc.apt({ packages });

            return {
                status: res.changed ? "changed" : "clean",
                results: {},
            };
        },
    };
});

export const role = modType<{ name: string }, {}>((options) => {
    return {
        name: "Role",

        description: options.name,

        async exec(host, deps) {
            //     const res = await host.rpc.writeFile(options.path, options.content);
            const changed = deps.some((dep) => dep.status === "changed");

            return {
                status: changed ? "changed" : "clean",
                results: {},
            };
        },
    };
});

export const service = modType<
    { service: string; action: "start" | "stop" | "restart" | "reload" },
    {}
>((options) => {
    return {
        name: "Service",

        description: options.service,

        async exec(host) {
            const res = await host.rpc.service({
                service: options.service,
                action: options.action,
            });

            return {
                status: res.changed ? "changed" : "clean",
                results: {},
            };
        },
    };
});

export const custom = modType<
    {
        name: string;
        exec: (
            host: HostClient,
            deps: HostModResult<{}>[],
        ) => Promise<"changed" | "clean" | "skipped" | undefined | void>;
    },
    {}
>((options) => {
    return {
        name: "Custom",

        description: options.name,

        async exec(host, deps) {
            const status = await options.exec(host, deps);

            return {
                status: status ?? "changed",
                results: {},
            };
        },
    };
});

export const git = modType<
    {
        dest: string;
        repo: string;
        rev?: string;
    },
    {}
>((options) => {
    const rev = options.rev ?? "master";

    return {
        name: "git",

        concurrency: 3,

        description: `${options.repo} (${rev}) to ${options.dest}`,

        async exec(host) {
            const git = new Git(options.repo);
            await git.clone();

            const cleanRev = await git.revParse(rev);

            const current = await host.rpc.readFile(
                Path.join(options.dest, ".konf-git-rev"),
            );

            if (current === cleanRev) {
                return {
                    status: "clean",
                    results: {},
                };
            }

            const res = await git.archive(rev);

            const archive = await readAsBase64(res.path);

            await host.rpc.extractBase64Archive({
                dest: options.dest,
                data: archive,
                rev: res.cleanRev,
            });

            return {
                status: "changed",
                results: {},
            };
        },
    };
});

export const http = modType<
    {
        dest: string;
        url: string;
        assertHash?: string;
    },
    {}
>((options) => {
    return {
        name: "http",

        concurrency: 3,

        description: `${options.url} ${options.dest}`,

        async exec(host) {
            const urlHash = hash(options.url);
            const cachedPath = Path.join(".konf", "http-cache", urlHash);
            await fs.mkdir(Path.dirname(cachedPath), { recursive: true });

            let localHash = await fileHash(cachedPath);
            const remoteHash = await host.rpc.fileHash(options.dest);

            if (!localHash) {
                await download(options.url, cachedPath);
                localHash = await fileHash(cachedPath);
            }

            assertNotNil(localHash, "local download file missing");

            if (options.assertHash && options.assertHash !== localHash) {
                throw new Error(
                    `assertHash() failed ${options.assertHash} !== ${localHash} on ${options.url}`,
                );
            }

            if (remoteHash && localHash && remoteHash === localHash) {
                return {
                    status: "clean",
                    results: {},
                };
            }

            const data = await readAsBase64(cachedPath);
            await host.rpc.fileFromBase64({ data, dest: options.dest });

            return {
                status: "changed",
                results: {},
            };
        },
    };
});

export const m = { file, shell, role, apt, service, custom, git, http };
