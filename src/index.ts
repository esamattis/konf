import { build } from "esbuild";
import { HostClient, HostMod, mod } from "./host-client";

const File = mod((options: { path: string; content: string }) => {
    return {
        describe() {
            return `Write file to ` + options.path;
        },
        async exec(host) {
            const res = await host.rpc.writeFile(options.path, options.content);
            return {
                changed: res.changed,
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

    vagrant.applyMod(file2);
    vagrant.applyMod(jes);
    vagrant.applyMod(file1);

    await vagrant.waitPendingMods();

    //     vagrant.applyMod(jes);

    //     const foo = await vagrant.rpc.readFile("/etc/hosts");
    //     console.log("DONE", foo);

    const code = await vagrant.disconnect({ exitCode: 5 });
}

main();
