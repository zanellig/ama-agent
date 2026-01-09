# Releasing Desktop Audio Agent

## Prerequisites

1. All changes committed and pushed to `main`
2. Version numbers updated (if needed)

## Steps to Release

### 1. Update Version Numbers

Update the version in these files:

- **`package.json`**: `"version": "0.2.0"`
- **`src-tauri/tauri.conf.json`**: `"version": "0.2.0"`
- **`src-tauri/Cargo.toml`**: `version = "0.2.0"`

### 2. Commit Version Bump

```bash
git add -A
git commit -m "chore: bump version to v0.2.0"
git push origin main
```

### 3. Create and Push Git Tag

```bash
git tag v0.2.0
git push origin v0.2.0
```

This triggers the GitHub Actions release workflow.

### 4. Monitor Build

1. Go to **Actions** tab in GitHub
2. Watch the "Release" workflow run
3. Builds run for: Windows, macOS (ARM + Intel), Linux

### 5. Publish Release

1. Go to **Releases** tab
2. Find the draft release created by the workflow
3. Edit release notes if needed
4. Click **Publish release**

## Build Outputs

| Platform | File |
|----------|------|
| Windows | `.msi` installer |
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x86_64) |
| Linux | `.AppImage`, `.deb` |

## Troubleshooting

- **Build fails**: Check Actions logs for errors
- **Missing secrets**: Ensure `GITHUB_TOKEN` has write permissions
- **Rust errors**: May need to update dependencies in `Cargo.toml`
