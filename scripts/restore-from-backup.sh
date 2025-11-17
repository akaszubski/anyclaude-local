#!/bin/bash

# Restore files from rename backup

set -e

BACKUP_DIR="$1"

if [ -z "$BACKUP_DIR" ]; then
  echo "Usage: $0 <backup-directory>"
  echo "Example: $0 .rename-backup-20251118-123456"
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "Restoring files from: $BACKUP_DIR"
echo ""

# Restore all files
find "$BACKUP_DIR" -type f | while read -r backup_file; do
  # Get original file path
  original_file="${backup_file#$BACKUP_DIR/}"

  # Restore
  cp "$backup_file" "$original_file"
  echo "  Restored: $original_file"
done

echo ""
echo "✓ Restore complete"
echo ""
echo "You can now delete the backup:"
echo "  rm -rf $BACKUP_DIR"
