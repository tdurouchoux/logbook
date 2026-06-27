import { createServer, Server as HttpServer } from "http";
import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { NoteStore } from "./note-store";
import { LogbookSettings } from "./settings";
import {
  LogNote,
  NOTE_TYPES,
  NoteType,
  TASK_STATUSES,
  DESIGN_STATUSES,
  MEETING_AGENDAS,
  activityTimestamp,
} from "./types";
import { applyFilters, emptyFilters, FilterState } from "./filters";

const TYPE_ATTR_VALUES: Partial<Record<NoteType, readonly string[]>> = {
  task: TASK_STATUSES,
  design: DESIGN_STATUSES,
  meeting: MEETING_AGENDAS,
};

function noteRow(n: LogNote): Record<string, unknown> {
  return { ...n.fm, tags: n.tags };
}

function countBy(notes: LogNote[], pick: (n: LogNote) => string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of notes) {
    for (const v of pick(n)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

/** Read-only MCP server exposing the logbook over HTTP, per design.md §16.
 *  Uses its own NoteStore — read-only access has no write-queue state to share
 *  with the views' stores. */
export class LogbookMcpServer {
  private store: NoteStore;
  private mcp: McpServer;
  private http: HttpServer | null = null;

  constructor(app: App, settings: LogbookSettings) {
    this.store = new NoteStore(app, settings);
    this.mcp = new McpServer({ name: "logbook", version: "1.0.0" });
    this.registerTools();
  }

  private registerTools() {
    this.mcp.registerTool(
      "list_note_types",
      { description: "The static catalog of note types: label, description, and filterable attribute (if any) with its valid values." },
      async () => {
        const types = (Object.entries(NOTE_TYPES) as [NoteType, (typeof NOTE_TYPES)[NoteType]][]).map(
          ([type, cfg]) => ({
            type,
            label: cfg.label,
            desc: cfg.desc,
            ...(cfg.filterAttr
              ? { filterAttr: { ...cfg.filterAttr, values: TYPE_ATTR_VALUES[type] ?? [] } }
              : {}),
          })
        );
        return textResult(types);
      }
    );

    this.mcp.registerTool(
      "list_projects",
      { description: "Every distinct projects[] value in use across notes, with a count." },
      async () => {
        const notes = await this.store.loadNotes();
        return textResult(countBy(notes, (n) => n.fm.projects));
      }
    );

    this.mcp.registerTool(
      "list_teams",
      { description: "Every distinct teams[] value in use across notes, with a count." },
      async () => {
        const notes = await this.store.loadNotes();
        return textResult(countBy(notes, (n) => n.fm.teams));
      }
    );

    this.mcp.registerTool(
      "list_tags",
      { description: "Every distinct tag (frontmatter + inline) in use across notes, with a count." },
      async () => {
        const notes = await this.store.loadNotes();
        return textResult(countBy(notes, (n) => n.tags));
      }
    );

    this.mcp.registerTool(
      "query_notes",
      {
        description:
          "Filtered, paginated list of notes (frontmatter + tags, no body), sorted by activity timestamp descending.",
        inputSchema: {
          type: z.string().optional().describe("Note type to filter to"),
          projects: z.array(z.string()).optional(),
          teams: z.array(z.string()).optional(),
          tags: z.array(z.string()).optional(),
          query: z.string().optional().describe("Fuzzy text query, same matching as the dock search"),
          typeAttr: z.object({ key: z.string(), value: z.string() }).optional(),
          limit: z.number().int().positive().optional(),
          offset: z.number().int().nonnegative().optional(),
        },
      },
      async ({ type, projects, teams, tags, query, typeAttr, limit, offset }) => {
        const notes = await this.store.loadNotes();
        const filters: FilterState = {
          ...emptyFilters(),
          type: (type as NoteType | undefined) ?? null,
          projects: projects ?? [],
          teams: teams ?? [],
          tags: tags ?? [],
          query: query ?? "",
          typeAttr: typeAttr ?? null,
        };
        const matched = applyFilters(notes, filters).sort(
          (a, b) => activityTimestamp(b) - activityTimestamp(a)
        );
        const start = offset ?? 0;
        const end = limit !== undefined ? start + limit : undefined;
        return textResult(matched.slice(start, end).map(noteRow));
      }
    );

    this.mcp.registerTool(
      "get_notes",
      {
        description: "Full rows (frontmatter + tags + body) for one or more notes by id.",
        inputSchema: { ids: z.array(z.string()) },
      },
      async ({ ids }) => {
        const idSet = new Set(ids);
        const notes = await this.store.loadNotes();
        const rows = notes
          .filter((n) => idSet.has(n.fm.id))
          .map((n) => ({ ...noteRow(n), body: n.body }));
        return textResult(rows);
      }
    );
  }

  async start(port: number): Promise<void> {
    this.http = createServer(async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null })
        );
        return;
      }
      try {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await this.mcp.connect(transport);
        await transport.handleRequest(req, res);
        res.on("close", () => transport.close());
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500).end(
            JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null })
          );
        }
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.http!.once("error", reject);
      this.http!.listen(port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    await this.mcp.close();
    if (this.http) {
      await new Promise<void>((resolve) => this.http!.close(() => resolve()));
      this.http = null;
    }
  }
}
