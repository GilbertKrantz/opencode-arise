import { z } from "zod";
export declare const names: readonly ["monarch", "beru", "igris", "bellion", "tusk", "tank", "shadow-sovereign"];
export type Shadow = typeof names[number];
declare const route: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    disabled: z.ZodOptional<z.ZodBoolean>;
    strategy: z.ZodOptional<z.ZodEnum<{
        balanced: "balanced";
        cheap: "cheap";
        quality: "quality";
        inherit: "inherit";
    }>>;
    preferred: z.ZodOptional<z.ZodArray<z.ZodString>>;
    min_context: z.ZodOptional<z.ZodNumber>;
    max_output_price: z.ZodOptional<z.ZodNumber>;
    required_inputs: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const schema: z.ZodObject<{
    show_banner: z.ZodDefault<z.ZodBoolean>;
    banner_every_session: z.ZodDefault<z.ZodBoolean>;
    disabled_shadows: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        monarch: "monarch";
        beru: "beru";
        igris: "igris";
        bellion: "bellion";
        tusk: "tusk";
        tank: "tank";
        "shadow-sovereign": "shadow-sovereign";
    }>>>;
    disabled_hooks: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        "arise-banner": "arise-banner";
        "compaction-preserver": "compaction-preserver";
        "todo-enforcer": "todo-enforcer";
    }>>>;
    agents: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
        monarch: "monarch";
        beru: "beru";
        igris: "igris";
        bellion: "bellion";
        tusk: "tusk";
        tank: "tank";
        "shadow-sovereign": "shadow-sovereign";
    }> & z.core.$partial, z.ZodObject<{
        model: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        disabled: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        strategy: z.ZodOptional<z.ZodOptional<z.ZodEnum<{
            balanced: "balanced";
            cheap: "cheap";
            quality: "quality";
            inherit: "inherit";
        }>>>;
        preferred: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString>>>;
        min_context: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        max_output_price: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        required_inputs: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    }, z.core.$strict>>>;
    routing: z.ZodDefault<z.ZodObject<{
        strategy: z.ZodDefault<z.ZodEnum<{
            balanced: "balanced";
            cheap: "cheap";
            quality: "quality";
            inherit: "inherit";
        }>>;
        route_primary: z.ZodDefault<z.ZodBoolean>;
        preferred: z.ZodDefault<z.ZodArray<z.ZodString>>;
        allow: z.ZodDefault<z.ZodArray<z.ZodString>>;
        deny: z.ZodDefault<z.ZodArray<z.ZodString>>;
        min_context: z.ZodDefault<z.ZodNumber>;
        max_output_price: z.ZodOptional<z.ZodNumber>;
        allow_unknown_prices: z.ZodDefault<z.ZodBoolean>;
        quality: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        fallback_on_unavailable: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    compaction: z.ZodDefault<z.ZodObject<{
        preserve_todos: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strict>;
export type Config = z.infer<typeof schema>;
export type Route = z.infer<typeof route>;
export declare function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown>;
export declare function globalDirectory(): string;
export declare function loadConfig(directory: string, options: Record<string, unknown>): Promise<Config>;
export declare function enabled(config: Config, shadow: Shadow): boolean;
export declare function hookEnabled(config: Config, name: Config["disabled_hooks"][number]): boolean;
export {};
