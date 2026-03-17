class CoordinatorAgent {
  constructor() {
    this.subagents = {
      research:   new ResearchAgent(),
      writer:     new WriterAgent(),
      coder:      new CoderAgent(),
      reviewer:   new ReviewerAgent(),
    }
    this.context = {}
  }

  async run(userTask) {
    const messages = [{ role: "user", content: userTask }]

    while (true) {
      const response = await callClaude({ messages, tools: this.getCoordinatorTools() })

      if (response.stop_reason === "end_turn") {
        return response.content
      }

      if (response.stop_reason === "tool_use") {
        const toolBlock = response.content.find(b => b.type === "tool_use")

        // coordinator decides which subagent to call
        const result = await this.route(toolBlock)

        messages.push({ role: "assistant", content: response.content })
        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolBlock.id, content: result }]
        })
      }
    }
  }

  async route(toolBlock) {
    // all inter-agent communication goes through here
    try {
      switch (toolBlock.name) {
        case "delegate_research":
          return await this.subagents.research.run(toolBlock.input)

        case "delegate_writing":
          // coordinator can enrich input before passing to subagent
          return await this.subagents.writer.run({
            ...toolBlock.input,
            context: this.context.researchResults  // inject shared context
          })

        case "delegate_review":
          return await this.subagents.reviewer.run(toolBlock.input)

        default:
          return { error: `Unknown subagent: ${toolBlock.name}` }
      }
    } catch (err) {
      // all error handling lives here — subagents never handle each other's failures
      return { error: err.message, recoverable: true }
    }
  }

  getCoordinatorTools() {
    return [
      { name: "delegate_research", description: "Send a research task to the research agent", input_schema: { ... } },
      { name: "delegate_writing",  description: "Send a writing task to the writer agent",   input_schema: { ... } },
      { name: "delegate_review",   description: "Send output to the reviewer agent",          input_schema: { ... } },
    ]
  }
}