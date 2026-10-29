import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ───────────────────────────────────────────────────────────── 

// Tipos compartidos 

// ───────────────────────────────────────────────────────────── 



// Lo que toda tool expone: su contrato (lo que ve el LLM) y su handler (lo que se ejecuta) 

export interface McpTool {

    definition: {

        name: string;
        description: string;
        inputSchema: Record<string, unknown>;

    };

    handler: (args: unknown) => Promise<CallToolResult>;

}



// DTOs: respuestas CHICAS y estables. GitHub devuelve +80 campos; el agente necesita 5 o 6. 

export interface RepoDTO {

    full_name: string;

    owner: string;

    name: string;

    private: boolean;

    description: string | null;

    html_url: string;

}

export interface IssueDTO {

    number: number;
    title: string;
    state: string;
    html_url: string;
    labels: string[];

}

export interface CommitDTO {

    commit_sha: string;
    commit_url: string;
    branch: string;
    path: string;
    file_url: string;

}

// Lo mínimo que necesitamos de un repo para los preflights 

export interface RepoInfo {

    full_name: string;
    default_branch: string;
    has_issues: boolean;

} 