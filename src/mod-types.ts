import { HostClient } from "./host-client";
import { modType } from "./mod";

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

export const m = { file, shell, role };
