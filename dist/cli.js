#!/usr/bin/env node
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyEdits, modify, parse } from "jsonc-parser";
import { globalDirectory, loadConfig } from "./config.js";
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function editPlugins(text, install) {
    const errors = [];
    const value = parse(text, errors, { allowTrailingComma: true });
    if (errors.length || !value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid OpenCode JSONC; file was not modified");
    // V2 migrates documents with any V1 key and ignores a mixed `plugins` field.
    const legacyKeys = ["logLevel", "server", "command", "reference", "snapshot", "plugin", "autoshare", "disabled_providers", "enabled_providers", "small_model", "mode", "agent", "provider", "permission", "tools", "attachment", "layout"];
    const field = legacyKeys.some(key => key in value) ? "plugin" : "plugins";
    if (field === "plugin" && "plugins" in value)
        throw new Error("Config mixes v1 and v2 plugin fields. Migrate to a consistent v2 config before installing; file was not modified.");
    if (value[field] !== undefined && !Array.isArray(value[field]))
        throw new Error(`${field} must be an array; file was not modified`);
    const plugins = (value[field] ?? []);
    const own = (entry) => {
        const item = typeof entry === "object" && entry ? entry.package : entry;
        return typeof item === "string" && (item === pluginRoot || item === "opencode-arise-v2" || item.startsWith("opencode-arise-v2@"));
    };
    const next = install ? plugins.some(own) ? plugins : [...plugins, pluginRoot] : plugins.filter(p => !own(p));
    return applyEdits(text, modify(text, [field], next, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } }));
}
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] ?? "help";
    const projectIndex = args.indexOf("--project");
    const configIndex = args.indexOf("--config");
    if ((projectIndex >= 0 && !args[projectIndex + 1]) || (configIndex >= 0 && !args[configIndex + 1]))
        throw new Error("Option needs a path");
    const project = projectIndex >= 0 ? resolve(args[projectIndex + 1]) : undefined;
    const directory = project ? join(project, ".opencode") : globalDirectory();
    let configFile = configIndex >= 0 ? resolve(args[configIndex + 1]) : join(project ?? directory, "opencode.jsonc");
    if (configIndex < 0) {
        try {
            await readFile(configFile);
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
            const jsonFile = join(project ?? directory, "opencode.json");
            try {
                await readFile(jsonFile);
                configFile = jsonFile;
            }
            catch (e) {
                if (e.code !== "ENOENT")
                    throw e;
            }
        }
    }
    if (command === "install" || command === "uninstall") {
        let text = "{\n  \"$schema\": \"https://opencode.ai/config.json\",\n  \"plugins\": []\n}\n";
        let existing = false;
        try {
            text = await readFile(configFile, "utf8");
            existing = true;
        }
        catch (e) {
            if (e.code !== "ENOENT")
                throw e;
        }
        const edited = editPlugins(text, command === "install");
        await mkdir(dirname(configFile), { recursive: true });
        if (existing && text !== edited)
            await copyFile(configFile, configFile + `.arise-backup-${Date.now()}`);
        if (text !== edited || !existing)
            await writeFile(configFile, edited);
        if (command === "install") {
            await mkdir(directory, { recursive: true });
            try {
                await writeFile(join(directory, "opencode-arise-v2.json"), JSON.stringify({ routing: { strategy: "balanced", route_primary: false }, agents: { beru: { strategy: "cheap" }, tank: { strategy: "cheap" } } }, null, 2) + "\n", { flag: "wx" });
            }
            catch (e) {
                if (e.code !== "EEXIST")
                    throw e;
            }
        }
        console.log(`${command === "install" ? "Installed" : "Unregistered"} ARISE v2 in ${configFile}. Restart OpenCode. Keep the installed package at ${pluginRoot}.`);
        return;
    }
    if (command === "doctor") {
        const text = await readFile(configFile, "utf8");
        if (editPlugins(text, false) === text)
            throw new Error(`ARISE v2 is not registered in ${configFile}`);
        await loadConfig(project ?? process.cwd(), {});
        await import("@opencode/plugin");
        console.log(`Configuration and SDK imports OK. SDK target: 2.0.24. Config: ${configFile}.`);
        console.log('Verify runtime loading with: opencode api get /api/plugin (use opencode2 if that is your v2 binary). Then ask Monarch to call arise_models.');
        return;
    }
    if (command !== "help" && command !== "--help")
        throw new Error(`Unknown command ${command}`);
    console.log("opencode-arise-v2 install|uninstall|doctor [--project DIRECTORY] [--config FILE]\nInstall registers this local package, preserves JSONC comments and backs up existing config. It does not connect providers or modify credentials.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
