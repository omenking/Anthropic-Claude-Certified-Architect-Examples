// Task Decomposition
const COORDINATOR_SYSTEM = `
You are a coordinator. When given a task, break it into subtasks and 
delegate each one using the available tools. Do not do the work yourself.
`

// Claude reads the user task and decides what to delegate
const response = await callClaude({
  system: COORDINATOR_SYSTEM,
  messages: [{ role: "user", content: "Research EVs, write a report, then review it" }],
  tools: [
    { name: "delegate_research", ... },
    { name: "delegate_writing",  ... },
    { name: "delegate_review",   ... },
  ]
})

// Claude will call delegate_research first — it decomposed the task itself

// Deciding which agents to invoke based on complexity
const COORDINATOR_SYSTEM = `
You are a coordinator. Use your judgment:
- Simple factual questions: use a single agent
- Multi-step tasks: delegate sequentially, passing results forward
- Independent subtasks: delegate in parallel
`

async function route(toolBlock) {
  switch (toolBlock.name) {

    case "delegate_research":
      // simple — one agent, one shot
      return await researchAgent.run(toolBlock.input)

    case "delegate_full_report":
      // complex — sequential chain, each agent gets prior output
      const research = await researchAgent.run({ topic: toolBlock.input.topic })
      const draft    = await writerAgent.run({ research, task: toolBlock.input.task })
      const reviewed = await reviewerAgent.run({ draft })
      return reviewed

    case "delegate_parallel_analysis":
      // independent subtasks — run concurrently
      const [marketData, techData, regulatoryData] = await Promise.all([
        marketAgent.run(toolBlock.input),
        techAgent.run(toolBlock.input),
        regulatoryAgent.run(toolBlock.input),
      ])
      return { marketData, techData, regulatoryData }
  }
}

// Result aggregation — coordinator merges outputs before returning
async function aggregate(results) {
  // coordinator decides how to combine subagent outputs
  const aggregationMessages = [
    {
      role: "user",
      content: `
        You have received outputs from multiple agents. 
        Combine them into a single coherent response.
        Resolve any conflicts by preferring the most specific data.

        Research output:  ${results.research}
        Writing output:   ${results.writing}
        Review feedback:  ${results.review}
      `
    }
  ]

  const response = await callClaude({
    system: "You are a coordinator. Merge these results into a final answer.",
    messages: aggregationMessages
  })

  return response.content
}

// The full coordinator loop tying it all together
class Coordinator {
  constructor() {
    this.context = {}  // coordinator's own store for passing results between agents
  }

  async run(userTask) {
    const messages = [{ role: "user", content: userTask }]

    while (true) {
      const response = await callClaude({
        system: COORDINATOR_SYSTEM,
        messages,
        tools: this.tools
      })

      if (response.stop_reason === "end_turn") {
        // aggregation happens here — Claude writes the final answer
        // having seen all tool results in its context
        return response.content
      }

      if (response.stop_reason === "tool_use") {
        const toolBlock = response.content.find(b => b.type === "tool_use")

        // delegate and store result for potential forwarding
        const result = await this.route(toolBlock)
        this.context[toolBlock.name] = result

        messages.push({ role: "assistant", content: response.content })
        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolBlock.id, content: JSON.stringify(result) }]
        })
        // loop continues — Claude sees the result and decides what to delegate next
      }
    }
  }
}