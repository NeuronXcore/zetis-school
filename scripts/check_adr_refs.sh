#!/usr/bin/env bash
# Tout « ADR-00XX » cité dans le dépôt doit correspondre à un fichier existant.
# Verrou de CI. Se sabote en renommant un ADR : il doit devenir rouge.
set -uo pipefail
RACINE="${1:-docs/decisions}"
manquants=0
existants=$(ls "$RACINE"/adr-*.md 2>/dev/null | sed -E 's|.*/adr-([0-9]{4}).*|\1|' | sort -u)
cites=$(grep -rhoE 'ADR-[0-9]{4}' --include='*.md' --include='*.py' --include='*.ts' --include='*.tsx' . \
        | sed 's/ADR-//' | sort -u)
for n in $cites; do
  if ! grep -qx "$n" <<< "$existants"; then
    echo "🔴 ADR-$n est cité mais n'existe pas dans $RACINE/"
    grep -rlE "ADR-$n" --include='*.md' --include='*.py' --include='*.ts' --include='*.tsx' . | sed 's/^/     /' | head -5
    manquants=$((manquants+1))
  fi
done
if [ "$manquants" -eq 0 ]; then
  echo "✅ toutes les références ADR résolvent ($(wc -w <<< "$cites") numéros cités)"
else
  echo "$manquants numéro(s) cité(s) sans fichier."
fi
exit $((manquants > 0))
