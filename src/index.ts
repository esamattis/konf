import { build } from "esbuild";
import { HostClient } from "./host-client";
import { m } from "./mod-types";

async function main() {
    await build({
        entryPoints: ["src/host-entry.ts"],
        target: "node16",
        format: "cjs",
        platform: "node",
        sourcemap: "inline",
        bundle: true,
        outdir: ".konf",
    });
    console.log("build done");

    const vagrant = await HostClient.connect({
        username: "git",
        host: "valu-playbooks.test",
    });

    //     const file2 = File({ path: "/dong", content: "" });

    const file1 = m.file({
        dest: "boo.txt",
        content: async (host) => {
            const din = await host.rpc.readFile("/etc/hosts");
            return din ?? "";
        },
    });

    //     const file2 = m.file({
    //         path: "boo2.txt",
    //         content: "sdafs3d",
    //         deps: [file1],
    //     });

    //     const file3 = m.file({
    //         path: "boo3.txt",
    //         content: "sdafs3d",
    //         deps: [file1],
    //     });

    //     const jes = File({ path: "/jest", content: "", deps: [file2] });

    //     const files = Role({
    //         name: "some files",
    //         deps: [File({ path: "/dong", content: "" })],
    //     });

    //     const res = await vagrant.applyMod(file2);

    //     vagrant.applyMod(jes);

    //     const cmd = m.shell({
    //         command: "ls -l",
    //         requireChanged: [file1],
    //     });

    //     //     vagrant.applyMod(file1);
    //     vagrant.applyMod(cmd);

    //     const role = m.role({ name: "my-role", deps: [file1] });
    //     console.log("wat");
    //     console.log(await vagrant.rpc.shell("whoami"));
    //     console.log("wut");

    vagrant.applyMod(m.apt({ package: "htop", deps: [file1] }));

    //     await vagrant.applyMod(file1);

    await vagrant.waitPendingMods();

    //     console.log(await vagrant.rpc.shell("ls sdfsdj"));

    //     vagrant.applyMod(jes);

    //     const foo = await vagrant.rpc.readFile("/etc/hosts");
    //     console.log("DONE", foo);

    const code = await vagrant.disconnect({});
}

main();
