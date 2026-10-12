import { Model } from "@opencode/plugin";
import type { Config, Shadow } from "./config.js";
export declare function matches(pattern: string, value: string): boolean;
export type Ref = {
    providerID: string;
    id: string;
    variant?: string;
};
export interface CatalogModel {
    providerID: string;
    id: string;
    enabled: boolean;
    status: string;
    capabilities: {
        tools: boolean;
        input: readonly string[];
    };
    limit: {
        context: number;
    };
    variants: readonly {
        id: string;
    }[];
    cost: readonly {
        input: number;
        output: number;
    }[];
    time: {
        released: number;
    };
}
export declare function selector(model: Ref): string;
export interface Selection {
    model: Model.Ref;
    reason: string;
    candidates: number;
}
export declare function selectModel(models: readonly CatalogModel[], config: Config, shadow: Shadow, inherited?: Ref, override?: string, requirements?: string[]): Selection;
