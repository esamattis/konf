import { HostClient } from "./host-client";
import { HostModResult, modType } from "./mod";

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

export const m = { file, shell, role, apt, service, custom };
