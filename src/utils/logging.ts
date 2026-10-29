// ───────────────────────────────────────────────────────────── 

// Logger estructurado (Lecture 9) 

// REGLA DE ORO: todo log va a STDERR. STDOUT es exclusivo del protocolo MCP. 

// Ojo: console.log, console.info y console.debug escriben en STDOUT. No los uses. 

// ───────────────────────────────────────────────────────────── 



type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };



function write(level: Level, msg: string, context: Record<string, unknown> = {}): void {

    const min = process.env.LOG_LEVEL ?? "info";

    if (min === "silent") return; // en los tests no queremos ruido 

    if (ORDER[level] < (ORDER[min as Level] ?? ORDER.info)) return; // filtra por nivel 

    const line = { ts: new Date().toISOString(), level, msg, ...context };

    process.stderr.write(JSON.stringify(line) + "\n");

}



export const logger = {

    debug: (msg: string, context?: Record<string, unknown>) => write("debug", msg, context),
    info: (msg: string, context?: Record<string, unknown>) => write("info", msg, context),
    warn: (msg: string, context?: Record<string, unknown>) => write("warn", msg, context),
    error: (msg: string, context?: Record<string, unknown>) => write("error", msg, context),

}; 