import { build } from "esbuild";
import { HostClient, HostMod, modType } from "./host-client";

const File = modType<{ path: string; content: string }, { foo: string }>(
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
                    //     name: "sdaf",
                    status: res.changed ? "changed" : "clean",
                    results: { foo: "sdf" },
                };
            },
        };
    },
);

const Role = modType<{ name: string }, {}>((options) => {
    return {
        name: "Role",

        description: options.name,

        async exec(host, deps) {
            const dep = deps[0];
            if (File.isResults(dep)) {
                dep.results;
            }

            //     const res = await host.rpc.writeFile(options.path, options.content);
            const changed = deps.some((dep) => dep.status === "changed");

            return {
                status: changed ? "changed" : "clean",
                results: {},
            };
        },
    };
});

async function main() {
    await build({
        entryPoints: ["src/server.ts"],
        target: "node16",
        format: "cjs",
        platform: "node",
        sourcemap: "inline",
        bundle: true,
        outdir: "build",
    });

    const vagrant = await HostClient.connect({
        username: "git",
        host: "valu-playbooks.test",
    });

    const file2 = File({ path: "/dong", content: "" });

    const file1 = File({ path: "/ding", content: "", deps: [file2] });
    const jes = File({ path: "/jest", content: "", deps: [file2] });

    const files = Role({
        name: "some files",
        deps: [File({ path: "/dong", content: "" })],
    });

    const res = await vagrant.applyMod(file2);

    vagrant.applyMod(jes);
    vagrant.applyMod(file1);

    await vagrant.waitPendingMods();

    //     vagrant.applyMod(jes);

    //     const foo = await vagrant.rpc.readFile("/etc/hosts");
    //     console.log("DONE", foo);

    const code = await vagrant.disconnect({ exitCode: 5 });
}

main();
