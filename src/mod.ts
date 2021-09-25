import { HostClient } from "./host-client";

export interface DefaultModParams {
    deps?: HostMod[];
    whenChanged?: HostMod[];
}

export interface HostModOptions<Results = any> extends DefaultModParams {
    name: string;
    concurrency?: number;
    description: string;
    exec(
        host: HostClient,
        depResults: HostModResult<Results>[],
    ): Promise<{
        status: HostModResult["status"];
        results?: Results;
        message?: string;
    }>;
}

export class HostMod<Results = {}> {
    private options: HostModOptions<Results>;

    constructor(options: HostModOptions<Results>) {
        this.options = options;
    }

    get deps() {
        return this.options.deps;
    }

    get whenChanged() {
        return this.options.whenChanged;
    }

    get name() {
        return this.options.name;
    }

    get cocurrency() {
        return this.options.concurrency ?? 10;
    }

    async exec(
        host: HostClient,
        depResults: HostModResult<any>[],
    ): Promise<HostModResult<Results>> {
        const res = await this.options.exec(host, depResults);

        if (res.status === "changed") {
            return {
                name: this.name,
                status: res.status,
                results: res.results,
                message: res.message,
            };
        }

        if (res.status === "clean") {
            return {
                name: this.name,
                status: res.status,
            };
        }

        if (res.status === "skipped") {
            return {
                name: this.name,
                status: res.status,
            };
        }

        throw new Error("Bad response status");
    }

    get description() {
        return `[${this.name}]: ${this.options.description}`;
    }
}

/**
 * Create mod type
 */
export function modType<Params extends {}, Results extends {}>(
    init: (params: Params & DefaultModParams) => HostModOptions,
) {
    const createMod = (params: Params & DefaultModParams) => {
        const options = init(params);
        return new HostMod<Results>(options);
    };

    createMod.hasResults = function isResult(
        res: HostModResult | undefined,
    ): res is ChangedResults<Results> {
        return Boolean(res && res.name === this.name);
    };

    return createMod;
}

export interface CleanResults {
    name: string;
    status: "clean";
}

export interface SkippedResults {
    name: string;
    status: "skipped";
}

export interface ChangedResults<R> {
    name: string;
    status: "changed";
    results: R;
    message: string;
}

export type HostModResult<Results = any> =
    | CleanResults
    | SkippedResults
    | ChangedResults<Results>;
