const coordinator = `
You are a coordinator. Before delegating, analyze the query:

- Simple factual questions → single agent, no pipeline
- Questions needing research + synthesis → research then write
- Requests needing validation → add reviewer only if output will be acted on
- Creative tasks → writer only, no research needed
- Data-heavy questions → data agent first, analyst second

Never invoke an agent unless it adds value to this specific query.
Always explain your selection before delegating.
`


const tools = [
  {
    name: "analyze_query",
    description: "Analyze the query and decide which agents are needed and in what order",
    input_schema: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: ["factual", "research", "analytical", "creative", "data"]
        },
        agents_needed: {
          type: "array",
          items: {
            type: "string",
            enum: ["research", "analyst", "writer", "reviewer", "data"]
          },
          description: "Ordered list of agents to invoke"
        },
        rationale: {
          type: "string",
          description: "Why these agents and not others"
        }
      },
      required: ["query_type", "agents_needed", "rationale"]
    }
  },
  { name: "delegate_research",  ... },
  { name: "delegate_analysis",  ... },
  { name: "delegate_writing",   ... },
  { name: "delegate_review",    ... },
  { name: "delegate_data",      ... },
]

class Coordinator {
  constructor() {
    this.context = {}
    this.selectedAgents = []  // populated after analyze_query
  }

  async run(userTask) {
    const messages = [{ role: "user", content: userTask }]

    while (true) {
      const response = await callClaude({
        system: COORDINATOR_SYSTEM,
        messages,
        tools
      })

      if (response.stop_reason === "end_turn") return response.content

      if (response.stop_reason === "tool_use") {
        const toolBlock = response.content.find(b => b.type === "tool_use")
        const result = await this.route(toolBlock)

        messages.push({ role: "assistant", content: response.content })
        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(result) }]
        })
      }
    }
  }

  async route(toolBlock) {
    switch (toolBlock.name) {

      case "analyze_query":
        // coordinator stores its own plan — no subagent invoked yet
        this.selectedAgents = toolBlock.input.agents_needed
        console.log(`Query type: ${toolBlock.input.query_type}`)
        console.log(`Agents selected: ${this.selectedAgents.join(", ")}`)
        console.log(`Rationale: ${toolBlock.input.rationale}`)
        return { status: "analysis complete", plan: toolBlock.input }

      case "delegate_research":
        if (!this.selectedAgents.includes("research")) {
          return { skipped: "research agent not required for this query" }
        }
        return await researchAgent.run(toolBlock.input)

      case "delegate_analysis":
        if (!this.selectedAgents.includes("analyst")) {
          return { skipped: "analyst not required for this query" }
        }
        return await analysisAgent.run({
          ...toolBlock.input,
          priorResearch: this.context.research
        })

      case "delegate_writing":
        if (!this.selectedAgents.includes("writer")) {
          return { skipped: "writer not required for this query" }
        }
        return await writerAgent.run(toolBlock.input)

      case "delegate_review":
        // reviewer only runs if output will be published or acted on
        if (!this.selectedAgents.includes("reviewer")) {
          return { skipped: "review not required for this query" }
        }
        return await reviewerAgent.run(toolBlock.input)
    }
  }
}