import { createHash } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import https from "https";
import { pipeline } from "stream/promises";

export function hash(str: string) {
    const sum = createHash("sha1");
    sum.update(str);
    return sum.digest("hex");
}

export async function readAsBase64(path: string) {
    return (await fs.readFile(path))?.toString("base64");
}

export async function download(
    url: string,
    dest: string,
    options?: {
        _redirectCount?: number;
    },
) {
    const redirectCount = options?._redirectCount ?? 0;

    if (redirectCount > 10) {
        throw new Error(`Bad too many redirects for ${url}`);
    }

    return await new Promise<void>((resolve, reject) => {
        https.get(url, async (res) => {
            res.on("error", reject);

            if (res.statusCode?.toString()[0] === "3" && res.headers.location) {
                return download(res.headers.location, dest, {
                    ...options,
                    _redirectCount: redirectCount,
                });
            }

            if (res.statusCode !== 200) {
                res.destroy();
            }

            await pipeline(res, createWriteStream(dest));
            resolve();
        });
    });
}
