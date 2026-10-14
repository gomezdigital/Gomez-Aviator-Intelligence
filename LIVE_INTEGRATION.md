# Live Aviator data integration — Phase 02

## Current status

**Not connected.** The public dashboard is a static GitHub Pages site. It cannot safely store private provider credentials or host a persistent backend by itself.

## What the official documentation establishes

The official [Aviator Studio Round History API](https://docs.crash.aviator.studio/round-history/) describes authenticated access for registered providers. It requires a provider ID, a generated provider token, and IP allowlisting. Its documented round-history request requires a `roundId`; the documentation reviewed does not describe a public, unauthenticated endpoint that streams every new round for a Betway player.

The optional [round-ended integration callback](https://docs.crash.aviator.studio/game-integration/integration-endpoints/) is described as a provider integration feature that must be enabled during or after registration. It is not a public subscription available to every player.

**Conclusion:** these documents do not give this project authorization or sufficient details to connect directly to Betway's live player game. Do not guess undocumented endpoints or bypass login, access controls, rate limits, or terms.

## Required inputs before implementation

1. The exact game/operator whose completed rounds are needed (for example, Betway Botswana).
2. Written confirmation that the source may be used for this research project.
3. Provider/API documentation that specifies a history feed or round-ended callback, authentication, rate limits, pagination, timestamps, and allowed use.
4. Approved provider credentials, if applicable. Keep private credentials in the backend's secret store, never in GitHub files or browser JavaScript.
5. A backend host for a small relay/collector. GitHub Pages serves static files and cannot run this server-side component.

## Proposed normalized record

The backend should return JSON using this shape:

```json
{
  "source": "provider-name",
  "fetchedAt": "2026-10-14T12:00:00.000Z",
  "rounds": [
    {
      "roundId": "provider-round-id",
      "multiplier": 1.65,
      "endedAt": "2026-10-14T11:59:58.000Z"
    }
  ]
}
```

These values are an example schema only, not real results. Every imported record must retain source provenance and original round ID. Validate finite multipliers (>= 1), parseable timestamps, unique round IDs, and reasonable clock skew. Reject or quarantine malformed records; show the feed's last successful sync and age. Do not silently replace missing live data with synthetic data.

## Integration architecture

`Authorized provider source → server-side collector/relay → validated normalized JSON endpoint → dashboard`

The server-side collector should:
- keep secrets in environment/secret storage;
- use HTTPS and strict upstream allowlisting;
- validate authentication and response structure;
- deduplicate by round ID and retain source timestamps;
- apply provider rate limits and bounded request timeouts;
- expose only the minimum round data required by the dashboard;
- return clear unavailable/stale/error states without inventing rounds.

## Acceptance checks before calling it live

- Provider authorization and endpoint are documented.
- A test response is obtained from the authorized source.
- Invalid JSON, missing fields, duplicate IDs, invalid timestamps, and HTTP errors are tested.
- Dashboard displays the actual source name and last-success timestamp.
- A stale or unavailable feed is visibly marked offline.
- A sample record can be traced to its upstream source.
- No bet placement, auto-cashout, or automated betting is implemented.

Historical results and statistical analysis cannot reliably reveal the next independent crash outcome. Live data is for recording and research, not guaranteed prediction.
