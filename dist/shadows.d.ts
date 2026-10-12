export interface ShadowAgent {
    name: string;
    description: string;
    mode: "primary" | "subagent" | "all";
    model: string;
    steps: number;
    prompt?: string;
    permission?: Record<string, "allow" | "deny" | "ask">;
    options?: Record<string, unknown>;
}
export declare const SHADOW_AGENTS: Record<string, ShadowAgent>;
export declare const OPENCODE_OVERRIDES: {
    build: {
        mode: "all";
        model: string;
    };
    plan: {
        mode: "all";
        model: string;
    };
    explore: {
        description: string;
        hidden: boolean;
    };
    general: {
        hidden: boolean;
    };
};
