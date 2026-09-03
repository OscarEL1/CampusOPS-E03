# Entrega semanal reproducible

1. Trabaja en la rama principal registrada para el equipo.
2. Ejecuta `make feedback` y los tres comandos de la actividad semanal.
3. Confirma que los reportes referencien `HEAD` o su padre inmediato cuando el último commit contiene únicamente evidencia.
4. Integra los cambios antes de congelar la entrega; no entregues una rama local sin publicar.
5. Crea el tag anotado y publícalo:

```bash
git status --short
git tag -a week-01-final -m "DMI week 01 final"
git push origin HEAD
git push origin week-01-final
git rev-list -n 1 week-01-final
```

6. Entrega en el LMS la URL pública del repositorio, el nombre del tag y el SHA completo que muestra el último comando.

El evaluador fija ese ref a un SHA y trabaja sobre una copia temporal. Cambios posteriores no alteran la entrega congelada. GitHub Actions es retroalimentación visible, no la autoridad exclusiva de calificación.

No incluyas credenciales, tokens, keystores, datos personales reales, respuestas de quizzes ni material del evaluador docente.
