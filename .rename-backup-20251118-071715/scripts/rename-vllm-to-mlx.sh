#!/bin/bash

# Rename vllm-mlx → mlx across the codebase
# This is a major refactoring affecting ~930 occurrences

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

echo "================================================================================"
echo "RENAME: vllm-mlx → mlx"
echo "================================================================================"
echo ""
echo "This script will rename all occurrences of:"
echo "  - vllm-mlx → mlx"
echo "  - vllm_mlx → mlx"
echo "  - VLLM_MLX → MLX"
echo "  - vLLM-MLX → MLX"
echo ""
echo -e "${YELLOW}WARNING: This affects ~930 occurrences across the codebase${RESET}"
echo ""

# Create backup
BACKUP_DIR=".rename-backup-$(date +%Y%m%d-%H%M%S)"
echo "Creating backup in: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Find all affected files (excluding node_modules, dist, .git)
echo ""
echo "Finding affected files..."
affected_files=$(grep -rl "vllm-mlx\|vllm_mlx\|VLLM_MLX\|vLLM-MLX" \
  --include="*.ts" \
  --include="*.js" \
  --include="*.json" \
  --include="*.md" \
  --include="*.sh" \
  --include="*.py" \
  . 2>/dev/null | \
  grep -v node_modules | \
  grep -v dist | \
  grep -v ".git/" | \
  grep -v "$BACKUP_DIR")

file_count=$(echo "$affected_files" | wc -l | xargs)
echo "Found $file_count files to update"
echo ""

# Show sample of files
echo "Sample of files to be updated:"
echo "$affected_files" | head -10
if [ $file_count -gt 10 ]; then
  echo "  ... and $(($file_count - 10)) more files"
fi
echo ""

# Ask for confirmation
read -p "Proceed with rename? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo ""
echo "Backing up files..."
echo "$affected_files" | while read -r file; do
  if [ -f "$file" ]; then
    backup_path="$BACKUP_DIR/$file"
    mkdir -p "$(dirname "$backup_path")"
    cp "$file" "$backup_path"
  fi
done

echo -e "${GREEN}✓ Backup complete${RESET}"
echo ""

# Perform the rename
echo "Renaming occurrences..."

# Use different patterns for different contexts
echo "$affected_files" | while read -r file; do
  if [ -f "$file" ]; then
    # Create temp file
    temp_file="${file}.tmp"

    # Perform replacements
    sed \
      -e 's/vllm-mlx/mlx/g' \
      -e 's/vllm_mlx/mlx/g' \
      -e 's/VLLM_MLX/MLX/g' \
      -e 's/vLLM-MLX/MLX/g' \
      -e 's/"mlx"/"mlx"/g' \
      "$file" > "$temp_file"

    # Replace original file
    mv "$temp_file" "$file"

    echo "  Updated: $file"
  fi
done

echo ""
echo -e "${GREEN}✓ Rename complete${RESET}"
echo ""

# Show summary
echo "================================================================================"
echo "SUMMARY"
echo "================================================================================"
echo "Files updated: $file_count"
echo "Backup location: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Test the code: npm run build && npm test"
echo "  3. If OK: git add . && git commit -m 'refactor: rename vllm-mlx to mlx'"
echo "  4. If NOT OK: ./scripts/restore-from-backup.sh $BACKUP_DIR"
echo ""
echo "================================================================================"
