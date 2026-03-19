class Coordinator {
  constructor() {
    this.log     = []    // full audit trail of every subagent interaction
    this.context = {}
  }

  // every subagent call goes through here — no exceptions
  async dispatch(agentName, input, iteration = 0) {
    const entry = {
      timestamp:  new Date().toISOString(),
      agent:      agentName,
      iteration,
      input,
      status:     "pending",
      output:     null,
      error:      null,
    }

    this.log.push(entry)

    try {
      // ----- observability: log what was sent -----
      console.log(`[${entry.timestamp}] → ${agentName}`, input)

      // ----- information control: strip fields subagent shouldn't see -----
      const sanitized = this.sanitize(agentName, input)

      // ----- delegate to the actual subagent -----
      const output = await this.agents[agentName].run(sanitized)

      // ----- observability: log what came back -----
      entry.status = "success"
      entry.output = output
      console.log(`[${new Date().toISOString()}] ← ${agentName}`, output)

      return { success: true, output }

    } catch (err) {

      // ----- consistent error handling: all failures caught here -----
      entry.status = "error"
      entry.error  = err.message
      console.error(`[${new Date().toISOString()}] ✕ ${agentName}: ${err.message}`)

      return this.handleError(agentName, err, input, iteration)
    }
  }

  // strip coordinator-only fields before passing to subagent
  sanitize(agentName, input) {
    const { _coordinator_meta, _prior_results, ...safe } = input
    return safe
  }
}


handleError(agentName, err, originalInput, iteration) {
  // classify the error
  const isTransient = err.message.includes("timeout") ||
                      err.message.includes("rate_limit")
  const isRecoverable = isTransient && iteration < 3

  if (isRecoverable) {
    console.log(`Retrying ${agentName} (attempt ${iteration + 1})`)
    return this.dispatch(agentName, originalInput, iteration + 1)
  }

  if (agentName === "research") {
    // degrade gracefully — skip research, proceed with less data
    console.warn("Research failed — proceeding without it")
    return {
      success:  false,
      degraded: true,
      output:   "Research unavailable — synthesis will be based on existing context only"
    }
  }

  if (agentName === "reviewer") {
    // reviewer is optional — skip and proceed
    console.warn("Review skipped due to error")
    return {
      success:  false,
      degraded: true,
      output:   null
    }
  }

  // critical agent failure — surface to coordinator loop
  return {
    success: false,
    fatal:   true,
    error:   `${agentName} failed unrecoverably: ${err.message}`
  }
}

// coordinator accumulates results but decides what to forward explicitly
async route(toolBlock) {
  switch (toolBlock.name) {

    case "delegate_research": {
      const { success, output } = await this.dispatch("research", {
        query: toolBlock.input.query
      })
      if (success) this.context.research = output
      return { success, output }
    }

    case "delegate_analysis": {
      // analyst gets research output — but not the raw user task or coordinator history
      const { success, output } = await this.dispatch("analysis", {
        data:         this.context.research,   // explicit forward
        instructions: toolBlock.input.instructions
        // NOT passing: this.context.priorSyntheses, user task, coordinator messages
      })
      if (success) this.context.analysis = output
      return { success, output }
    }

    case "delegate_synthesis": {
      // writer gets research + analysis — but not the evaluation scores or gap lists
      const { success, output } = await this.dispatch("writer", {
        research: this.context.research,
        analysis: this.context.analysis,
        task:     toolBlock.input.task
        // NOT passing: coverage scores, coordinator's gap evaluations
      })
      if (success) this.context.synthesis = output
      return { success, output }
    }
  }
}

// after the run completes, the full log is available
coordinator.getAuditLog()

// returns:
[
  {
    timestamp:  "2024-03-17T10:00:01Z",
    agent:      "research",
    iteration:  0,
    input:      { query: "EV market 2024" },
    status:     "success",
    output:     { ... },
    error:      null
  },
  {
    timestamp:  "2024-03-17T10:00:08Z",
    agent:      "analysis",
    iteration:  0,
    input:      { data: { ... }, instructions: "focus on growth trends" },
    status:     "error",
    output:     null,
    error:      "timeout after 30s"
  },
  {
    timestamp:  "2024-03-17T10:00:09Z",
    agent:      "analysis",
    iteration:  1,         // retry
    input:      { data: { ... }, instructions: "focus on growth trends" },
    status:     "success",
    output:     { ... },
    error:      null
  },
  ...
]