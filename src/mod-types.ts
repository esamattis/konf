import { modType } from "./mod";

export const File = modType<{ path: string; content: string }, { foo: string }>(
    (options) => {
        return {
            name: "file",

            concurrency: 3,

            description: options.path,

            async exec(host) {
                const res = await host.rpc.writeFile(
                    options.path,
                    options.content,
                );

                return {
                    name: "",
                    message: "",
                    status: res.changed ? "changed" : "clean",
                    results: { foo: "sdf" },
                };
            },
        };
    },
);

export const Shell = modType<
    {
        command: string;
        output?: "stdout" | "stderr" | "both" | "none";
        detectChange?: (output: string, code: number) => boolean;
    },
    { ouput: string }
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
                results: { foo: "sdf" },
            };
        },
    };
});

export const Role = modType<{ name: string }, {}>((options) => {
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
