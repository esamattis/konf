import { build } from "esbuild";
import { HostClient } from "./host-client";

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

    const foo = await vagrant.rpc.readFile("/etc/hosts");
    console.log("DONE", foo);

    const code = await vagrant.disconnect({ exitCode: 5 });
}

main();
