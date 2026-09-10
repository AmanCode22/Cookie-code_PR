# Cookie Code Roadmap

> This file tracks the next work items, ordered by priority.

---

## Completed

- [x] Core framework: Electron window + overlay injection
- [x] Tool call system: read / write / edit / glob / grep / bash, etc.
- [x] Project initialization: directory picker + directory tree + system prompt
- [x] Multi-window management: independent profile per window
- [x] MCP support: config + SDK connection + UI panel + `mcpCall` tool
- [x] Skills: load and execute custom skills
- [x] Customizable UI: 27 wallpapers, blur and transparency sliders
- [x] Inline tool blocks (collapsible, error highlighting)
- [x] Response meta badge (⏱ time · ~tokens)
- [x] RGB username animation
- [x] Settings tab inside DeepSeek's native settings modal

---

## Next up (in priority order)

### 1. Reliability

**Goal:** reduce interruptions and improve core UX.

- [ ] Stop generation mid-thought
- [ ] Automatic retry on network failure
- [ ] Manual-parse hint when a tool call fails

**Acceptance:** user can abort generation; transient network errors recover automatically; failed tool calls show a clear manual-parse affordance.

---

### 2. Tool call UX

**Goal:** make the agent loop more transparent.

- [ ] Per-tool-result viewer (open the full output in a panel)
- [ ] Copy / re-run individual tool blocks
- [ ] Inline diff preview for `edit` calls

**Acceptance:** every tool block exposes its raw output, an easy copy, and a re-run action.

---

### 3. New capabilities

**Goal:** extend the agent.

- [ ] Sub-agents
- [ ] Conversation compression for long sessions

**Acceptance:** to be defined after the first real use cases.

---

## Notes

- Priority order: reliability → tool call UX → new capabilities
- Check off items as they're done
- To change priorities, edit this file directly
