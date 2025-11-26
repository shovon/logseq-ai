import { z } from "zod";

const MCPServerConfig = z.object({
  type: z.union([z.literal("http"), z.literal("sse")]),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

type MCPServerConfig = z.infer<typeof MCPServerConfig>;

/**
 * Pulls in the MCP servers from the configs.
 * @returns A list of MCP server configs.
 */
export function loadMCPServers(): MCPServerConfig[] {
  const result = z
    .record(z.string(), z.unknown())
    .safeParse(logseq.settings?.mcpServers);
  if (result.success) {
    const data = result.data;
    return Object.entries(data)
      .map(([, obj]) => {
        console.log(obj);
        try {
          return MCPServerConfig.parse(obj);
        } catch {
          return {};
        }
      })
      .filter((m): m is MCPServerConfig => m !== null);
  }
  return [];
}
