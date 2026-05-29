# ElevenLabs Agent Setup — Gemel Voice Conversation Mode

This document explains how to create and configure the ElevenLabs Conversational AI Agent that powers Gemel's real-time voice conversation mode. You only need to do this once per deployment.

---

## How it works

```
Browser microphone
       ↓  (WebSocket, real-time audio)
ElevenLabs Conversational AI
  • VAD — detects when you stop speaking
  • STT — transcribes your speech
  • Calls our LLM webhook with the transcript
       ↓  (POST to /api/voice/conversation-llm)
Our server
  • Loads your session, trip profile, itinerary from DB
  • Builds Gemel's full system prompt
  • Calls Claude API
  • Streams response back to ElevenLabs
       ↓  (streaming text → TTS)
ElevenLabs TTS → audio back to your speaker
```

**Cost:** ElevenLabs charges ~$0.10/minute of active conversation. Claude API costs are separate and the same as regular chat (~$0.01–0.02/turn with prompt caching). A typical 10-minute visitor session costs ~$1.10–1.40 total.

**Latency:** ~1.2–1.8 seconds from end of speech to first audio. Roughly 3× faster than the push-to-talk STT+chat+TTS path.

---

## Step 1 — Create the Agent

1. Go to [elevenlabs.io/app/conversational-ai](https://elevenlabs.io/app/conversational-ai)
2. Click **+ New Agent**
3. Choose **Blank Agent** (not a template)

---

## Step 2 — Configure the Agent

### Voice
- Select the same voice used for regular TTS: search for the voice ID `qSeXEcewz7tA0Q0qk9fH` or name it **Gemel**
- If you've used a custom cloned voice, select that instead

### Language
- Set **Language** to **English** (Gemel handles multi-language responses at the system prompt level; ElevenLabs' language setting controls VAD and STT optimisation)

### LLM
- Set **LLM** to **Custom LLM**
- **Server URL** (base only — ElevenLabs automatically appends `/chat/completions`):
  ```
  https://normieagent.com/api/voice/conversation-llm
  ```
  Resulting URL ElevenLabs calls: `https://normieagent.com/api/voice/conversation-llm/chat/completions` ← this matches the route file at `app/api/voice/conversation-llm/chat/completions/route.js`
- For preview/local testing: use the Vercel preview URL or an ngrok tunnel as the base — the `/api/voice/conversation-llm` path stays the same.
- **Model ID:** `claude-sonnet-4-5` (cosmetic — our webhook ignores it and uses the model configured in `ANTHROPIC_MODEL`, but the field requires a value)
- **API Key:** leave blank or use any placeholder — our endpoint validates via the session ID embedded in the signed URL, not an API key
- **Temperature:** middle of the slider (~0.6) — matches our regular chat default and keeps Gemel's voice natural
- **Reasoning Effort:** Default (Claude Sonnet 4.5 doesn't use this field)
- **Backup LLM configuration:** Default (ElevenLabs falls back automatically if our endpoint times out)

### System Prompt (on the ElevenLabs side)
Set a minimal placeholder — our webhook replaces this with the full dynamically-built Gemel system prompt on every turn:
```
You are Gemel, a conversational concierge for NFC Summit 2026 in Lisbon.
```
ElevenLabs requires something here, but it will be overridden.

### First Message
```
Hi — I'm Gemel. Tell me about your trip to Lisbon and I'll help you plan it.
```

### Advanced Settings
- **Turn timeout:** 5 seconds (how long ElevenLabs waits for a response from the LLM webhook before timing out)
- **Interruption sensitivity:** Medium
- **VAD sensitivity:** Medium
- Keep other settings at defaults

---

## Step 3 — Copy the Agent ID

After saving, the Agent ID appears in the URL:
`https://elevenlabs.io/app/conversational-ai/agents/YOUR_AGENT_ID/...`

Copy it.

---

## Step 4 — Add to environment variables

**Local (`.env.local`):**
```
ELEVENLABS_AGENT_ID=YOUR_AGENT_ID
```

**Vercel (production):**
1. Go to your Vercel project → Settings → Environment Variables
2. Add `ELEVENLABS_AGENT_ID` with the value from above
3. Redeploy

---

## Step 5 — Test it

1. Open `normieagent.com/chat`
2. You should now see a phone icon (📞) in the header next to the speaker toggle
3. Click it — the button turns lime-green and shows "Connecting…"
4. Once connected, it shows "Listening…"
5. Speak — Gemel responds in real-time

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Button shows but clicking gives "Error" | `ELEVENLABS_AGENT_ID` not set | Add env var and redeploy |
| Connects but Gemel doesn't respond | Webhook URL wrong in agent config | Verify the URL points to `normieagent.com/api/voice/conversation-llm` |
| Gemel responds but ignores session context | `session_id` not passed correctly | Check browser console for errors in `/api/voice/conversation-token` |
| VAD triggers too early (cuts you off) | VAD sensitivity too high | Lower sensitivity in Agent settings |
| High latency | LLM webhook URL slow to respond | Check Vercel function logs; consider regional deployment |

---

## Per-event configuration (white-label)

When deploying Gemel for a new event, you can either:
- **Reuse the same agent** — the webhook dynamically builds the correct system prompt from the session and programme data. No agent changes needed.
- **Create a new agent** — useful if you want different first messages or voice per event.

The Agent ID is the only thing that changes per deployment for voice mode.
