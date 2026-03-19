const COORDINATOR_SYSTEM = `
You are a research coordinator. Your job is not just to delegate once — 
it is to ensure the final output is complete.

After each synthesis, evaluate it against the original task:
- What dimensions are missing or thin?
- What claims lack supporting evidence?
- What follow-up questions does the draft raise but not answer?

If gaps exist, re-delegate targeted queries to fill them.
Only call submit_final when you are confident coverage is sufficient.

You have a maximum of 4 refinement iterations. Use them wisely.

const tools = [
  {
    name: "delegate_research",
    description: "Send a research query to the research agent",
    input_schema: {
      type: "object",
      properties: {
        query:       { type: "string" },
        focus:       { type: "string", description: "Specific angle to focus on" },
        iteration:   { type: "number", description: "Which refinement pass is this?" }
      },
      required: ["query", "iteration"]
    }
  },
  {
    name: "delegate_synthesis",
    description: "Send all collected research to the writer agent for synthesis",
    input_schema: {
      type: "object",
      properties: {
        research_ids: { type: "array", items: { type: "string" } },
        instructions: { type: "string" }
      },
      required: ["research_ids"]
    }
  },
  {
    name: "evaluate_coverage",
    description: "Score the current synthesis and identify gaps",
    input_schema: {
      type: "object",
      properties: {
        synthesis_id:    { type: "string" },
        coverage_score:  { type: "number", description: "0-100, how complete is this?" },
        gaps:            { type: "array", items: { type: "string" } },
        sufficient:      { type: "boolean" }
      },
      required: ["coverage_score", "gaps", "sufficient"]
    }
  },
  {
    name: "submit_final",
    description: "Submit the final response when coverage is sufficient",
    input_schema: {
      type: "object",
      properties: {
        synthesis_id: { type: "string" },
        rationale:    { type: "string", description: "Why coverage is now sufficient" }
      },
      required: ["synthesis_id", "rationale"]
    }
  }
]

lass RefinementCoordinator {
  constructor() {
    this.researchStore = {}   // keyed by id, all collected research
    this.syntheses     = {}   // keyed by id, all synthesis drafts
    this.iteration     = 0
    this.MAX_ITERATIONS = 4
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
        const result    = await this.route(toolBlock)

        messages.push({ role: "assistant", content: response.content })
        messages.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result)
          }]
        })
      }
    }
  }

  async route(toolBlock) {
    switch (toolBlock.name) {

      case "delegate_research": {
        this.iteration = toolBlock.input.iteration

        // safety cap — refuse further delegation if limit reached
        if (this.iteration > this.MAX_ITERATIONS) {
          return {
            status: "cap_reached",
            message: "Maximum iterations reached. Proceed to final synthesis with current data."
          }
        }

        const result = await researchAgent.run({
          query: toolBlock.input.query,
          focus: toolBlock.input.focus
        })

        // store with a unique id so coordinator can reference it later
        const id = `research_${Date.now()}`
        this.researchStore[id] = result
        return { id, result, iteration: this.iteration }
      }

      case "delegate_synthesis": {
        // gather only the research pieces the coordinator specified
        const selectedResearch = toolBlock.input.research_ids
          .map(id => this.researchStore[id])
          .filter(Boolean)

        const draft = await writerAgent.run({
          research:     selectedResearch,
          instructions: toolBlock.input.instructions,
          iteration:    this.iteration
        })

        const id = `synthesis_${Date.now()}`
        this.syntheses[id] = draft
        return { id, draft }
      }

      case "evaluate_coverage": {
        const { coverage_score, gaps, sufficient } = toolBlock.input

        console.log(`Iteration ${this.iteration} — coverage: ${coverage_score}/100`)
        console.log(`Gaps identified: ${gaps.join(", ")}`)

        if (sufficient || this.iteration >= this.MAX_ITERATIONS) {
          return { proceed: "submit_final", coverage_score }
        }

        // return gaps as targeted queries for the next iteration
        return {
          proceed:        "continue",
          targeted_queries: gaps.map(gap => ({
            query: gap,
            focus: "fill this specific gap in the existing research"
          }))
        }
      }

      case "submit_final": {
        const finalSynthesis = this.syntheses[toolBlock.input.synthesis_id]
        console.log(`Final submitted. Rationale: ${toolBlock.input.rationale}`)
        return { status: "complete", output: finalSynthesis }
      }
    }
  }
}
```

**What the conversation history looks like across iterations**
```
iteration 1:
  delegate_research("EV market overview")          → research_001
  delegate_synthesis([research_001])               → synthesis_001
  evaluate_coverage(score: 55, gaps: [
    "no mention of charging infrastructure",
    "policy section is thin",
    "nothing on supply chain"
  ], sufficient: false)

iteration 2:
  delegate_research("EV charging infrastructure")  → research_002
  delegate_research("EV government policy 2024")   → research_003
  delegate_synthesis([research_001, 002, 003])     → synthesis_002
  evaluate_coverage(score: 78, gaps: [
    "supply chain still missing"
  ], sufficient: false)

iteration 3:
  delegate_research("EV lithium cobalt supply chain") → research_004
  delegate_synthesis([research_001, 002, 003, 004])   → synthesis_003
  evaluate_coverage(score: 91, gaps: [], sufficient: true)

  submit_final(synthesis_003)