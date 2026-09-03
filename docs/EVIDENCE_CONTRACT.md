# Evidence contract

All paths are relative to the team repository. Markdown and Mermaid artifacts must be non-empty and specific to the submitted SHA.

## Generated reports

Every required JSON report uses this minimum envelope:

```json
{
  "schemaVersion": 1,
  "week": 5,
  "commitSha": "40-character SHA evaluated before recording this report",
  "generatedAt": "ISO-8601 timestamp",
  "checks": [
    {"id": "case-name", "status": "pass", "scenarioType": "boundary", "command": "exact command", "evidence": "observable result"}
  ]
}
```

`scenarioType` sólo admite `nominal`, `boundary` o `failure`. Cada reporte debe indexar por lo menos un caso `boundary` o `failure`; IDs, comandos y evidencia deben ser cadenas no vacías. Un reporte es un índice de evidencia reproducible, no un sustituto de ejecutar el check.

`commitSha` may equal the final tag or its direct evidence-only ancestor. If it is the ancestor, the only permitted changes up to the final tag are under `reports/` and `evidence/`; this avoids an impossible self-reference while preventing code changes after verification.

## Engineering evidence

`evidence/week-XX/engineering.json` contiene `schemaVersion`, `week`, `commitSha`, una `decision` sustantiva, al menos dos `alternatives` distintas, `tradeoff`, `requirementIds` que sólo referencian AC-01..AC-05 y `verification`. `verification` es una lista no vacía de objetos con `command`, `result` y `evidence`; así la decisión se contrasta con una observación reproducible.

## Individual evidence

`evidence/week-XX/individual.json` contiene `schemaVersion: 1`, `week`, `teamId` no vacío y exactamente tres `members`. Cada integrante suministra `studentId`, al menos un SHA completo en `commitShas`, al menos un elemento en `files`, al menos una señal entre `tests` o `reviews`, además de `prediction`, `command`, `observedResult` y `explanation` sustantivos. Los conteos no son una calificación; esta estructura sólo soporta flags y corroboración rotativa.
