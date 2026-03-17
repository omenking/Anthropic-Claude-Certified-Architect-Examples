const usg_msg = "Give me a comprehensive analysis of the EV market"

const WEAK_COORDINATOR_SYSTEM = `
Break the user's task into subtasks and delegate them.

const STRONG_COORDINATOR_SYSTEM = `
You are a coordinator. When decomposing a task:

1. Generate an initial list of subtasks
2. Ask yourself: what perspectives, stakeholders, or dimensions are missing?
3. Add subtasks to cover those gaps
4. Only then begin delegating

For research tasks specifically, consider:
- quantitative AND qualitative angles
- supply AND demand sides
- short-term AND long-term factors
- supporting infrastructure, not just the primary subject
- policy, regulatory, and economic context
- risks and failure modes, not just opportunities

const tools = [
  {
    name: "submit_decomposition",
    description: "Submit your subtask breakdown for review before delegating",
    input_schema: {
      type: "object",
      properties: {
        subtasks: {
          type: "array",
          items: { type: "string" },
          description: "Full list of subtasks you plan to delegate"
        },
        coverage_rationale: {
          type: "string",
          description: "Explain what dimensions of the topic each subtask covers"
        },
        potential_gaps: {
          type: "string",
          description: "What might still be missing from this decomposition?"
        }
      },
      required: ["subtasks", "coverage_rationale", "potential_gaps"]
    }
  },
  { name: "delegate_research", ... },
  { name: "delegate_writing",  ... },
]


async function aggregate(results, originalTask) {
  const response = await callClaude({
    system: "You are a coordinator reviewing research completeness.",
    messages: [{
      role: "user",
      content: `
        Original task: ${originalTask}

        Research collected so far:
        ${JSON.stringify(results)}

        Before writing the final answer:
        1. Identify any significant dimensions of the topic not covered above
        2. If gaps are critical, list them explicitly in the final response
        3. Only then synthesise what was collected into a final answer
      `
    }]
  })