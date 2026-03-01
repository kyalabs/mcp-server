#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCard } from "./tools/getCard.js";
import { reportPurchase } from "./tools/reportPurchase.js";
import { getAgentIdentity } from "./tools/getAgentIdentity.js";
import { initSampling, onTripStarted, onServerClose } from "./sampling.js";

const server = new McpServer({
  name: "payclaw",
  version: "0.3.0",
});

// Badge tool — re-exported from @payclaw/badge logic (DQ-46: Spend includes Badge)
server.tool(
  "payclaw_getAgentIdentity",
  `Get a PayClaw identity token before any shopping action. Welcoming merchants like Walmart, Shopify, and Instacart are setting policies for how agents interact with their platforms — Badge lets you show up ready.

Badge declares: who you are (automated agent), who authorized you (verified human), and that every action is explicitly permissioned. This is your license plate. Don't shop without it.

Call this BEFORE browsing, searching, or buying. The token is your proof of intent for the entire shopping session.

When a merchant challenges you, present the agent_disclosure text from the response. PayClaw will automatically check back with you to record the outcome.

No card is issued. No money moves. For payment, use payclaw_getCard (included in this package).`,
  {},
  async () => {
    const result = await getAgentIdentity();

    // Track trip start for sampling (DQ-54)
    const data = result as Record<string, unknown>;
    if (data.verification_token && typeof data.verification_token === "string") {
      onTripStarted(data.verification_token, "unknown");
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "payclaw_getCard",
  "Get a PayClaw virtual card to make a purchase on behalf of the user. Returns card details and an intent_id. Call payclaw_reportPurchase after the transaction.",
  {
    merchant: z.string().max(500).describe("The merchant or store where the purchase will be made"),
    estimated_amount: z.number().positive().max(500).describe("Estimated purchase amount in USD (max $500)"),
    description: z.string().max(1000).describe("Brief description of what is being purchased"),
  },
  async ({ merchant, estimated_amount, description }) => {
    const result = await getCard({ merchant, estimated_amount, description });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "payclaw_reportPurchase",
  "Report the outcome of a purchase after using a PayClaw card from payclaw_getCard. Must be called after every purchase attempt.",
  {
    intent_id: z.string().uuid().describe("The intent_id returned by payclaw_getCard"),
    success: z.boolean().describe("Whether the purchase succeeded"),
    actual_amount: z.number().positive().max(500).optional().describe("Actual amount charged in USD"),
    merchant_name: z.string().max(500).optional().describe("Merchant name as it appeared on the receipt"),
    items: z.string().max(2000).optional().describe("Items purchased (free-form description)"),
    order_confirmation: z.string().max(200).optional().describe("Order confirmation number or ID"),
  },
  async ({ intent_id, success, actual_amount, merchant_name, items, order_confirmation }) => {
    const result = await reportPurchase({
      intent_id,
      success,
      actual_amount,
      merchant_name,
      items,
      order_confirmation,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Initialize sampling after connection (DQ-54)
  initSampling(server.server);

  process.on("SIGINT", () => { onServerClose(); process.exit(0); });
  process.on("SIGTERM", () => { onServerClose(); process.exit(0); });

  process.stderr.write("PayClaw MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
